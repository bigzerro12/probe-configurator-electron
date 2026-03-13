import { Probe, DriverType, ProviderType } from "@shared/types";
import { runCommand } from "../../../utils/exec";
import log from "../../../utils/logger";
import { getPlatformStrategy } from "../../../utils/platform/index";

const platform = getPlatformStrategy();


// ─── Regex patterns ───────────────────────────────────────────────────────────

const PROBE_LINE_REGEX  = /^(J-Link>)?J-Link\[\d+\]:/;
const SERIAL_REGEX      = /Serial number:\s*(\d+)/;
const PRODUCT_REGEX     = /ProductName:\s*([^,]+)/;
const NICKNAME_REGEX    = /Nickname:\s*([^,\r\n]+)/;
const CONNECTION_REGEX  = /Connection:\s*(\w+)/;
// Matches: "Firmware: J-Link OB-S124 compiled Feb  2 2021 16:57:21"
const FIRMWARE_REGEX    = /^Firmware:.*compiled\s+(.+)$/m;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseProbeLines(stdout: string): Probe[] {
  const probes: Probe[] = [];
  const lines = stdout.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!PROBE_LINE_REGEX.test(trimmedLine)) continue;

    const serial  = trimmedLine.match(SERIAL_REGEX)?.[1]?.trim();
    const product = trimmedLine.match(PRODUCT_REGEX)?.[1]?.trim();
    const nick    = trimmedLine.match(NICKNAME_REGEX)?.[1]?.trim() ?? "<not set>";
    const conn    = trimmedLine.match(CONNECTION_REGEX)?.[1]?.trim() ?? "USB";

    if (!serial || !product) {
      log.warn(`[scanProbes] Could not parse line: ${trimmedLine}`);
      continue;
    }

    probes.push({
      id: serial,
      serialNumber: serial,
      productName: product,
      nickName: nick,
      provider: "JLink",
      connection: conn,
      driver: "Unknown" as DriverType,
      firmware: undefined,
    });
  }

  return probes;
}

/**
 * Fetch firmware dates for all probes in a single JLink session.
 *
 * Input sequence sent to JLink:
 *   exec DisableAutoUpdateFW
 *   selectprobe
 *   0
 *   selectprobe
 *   1
 *   ...
 *   exit
 *
 * Output is split on "Select emulator index:" boundaries — each chunk
 * after the prompt contains the Firmware line for that probe index.
 */
async function fetchFirmwareDates(probeCount: number, jlinkBin: string): Promise<(string | undefined)[]> {
  if (probeCount === 0) return [];

  // Build input: disable auto-update, then selectprobe for each index, then exit
  const selectCmds = Array.from({ length: probeCount }, (_, i) => `selectprobe\n${i}`);
  const input = ["exec DisableAutoUpdateFW", ...selectCmds, "exit"].join("\n") + "\n";

  try {
    const result = await runCommand(jlinkBin, ["-NoGUI", "1"], {
      input,
      timeout: 10_000 + probeCount * 5_000,  // base + 5s per probe
      windowsHide: true,
      env: { JLINK_NO_GUI: "1", NO_GUI: "1", DISPLAY: ":0" },
    });

    // Split output on "Select emulator index:" — each section corresponds to one probe
    // in the order they were selected (index 0, 1, 2...)
    const sections = result.stdout.split(/Select emulator index:/);

    // sections[0] = output before first selectprobe prompt (showemulist etc.) — skip
    // sections[1] = output after user entered "0"
    // sections[2] = output after user entered "1"  ...etc.
    const firmwareDates: (string | undefined)[] = [];

    for (let i = 0; i < probeCount; i++) {
      const section = sections[i + 1] ?? "";
      const match   = section.match(FIRMWARE_REGEX);
      const date    = match?.[1]?.trim();
      firmwareDates.push(date);
      log.info(`[scanProbes] Probe[${i}] firmware: ${date ?? "unknown"}`);
    }

    return firmwareDates;

  } catch (err) {
    log.warn(`[scanProbes] Firmware fetch failed: ${err instanceof Error ? err.message : err}`);
    // Return array of undefined — probes still shown without firmware
    return Array(probeCount).fill(undefined);
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function scanProbes(jlinkBin: string = platform.jlinkBin): Promise<Probe[]> {
  try {
    // Step 1: Get probe list via ShowEmuList
    const listResult = await runCommand(jlinkBin, ["-NoGUI", "1"], {
      input: "ShowEmuList\nExit\n",
      timeout: 15_000,
      windowsHide: true,
      env: { JLINK_NO_GUI: "1", NO_GUI: "1", DISPLAY: ":0" },
    });

    const probes = parseProbeLines(listResult.stdout);
    log.info(`[scanProbes] Found ${probes.length} J-Link probes`);

    if (probes.length === 0) return probes;

    // Step 2: Fetch firmware for each probe in a single JLink session
    const firmwareDates = await fetchFirmwareDates(probes.length, jlinkBin);

    for (let i = 0; i < probes.length; i++) {
      probes[i].firmware = firmwareDates[i];
    }

    return probes;

  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      throw new Error("jlink command not found. Is J-Link software installed?");
    }
    if (error instanceof Error && error.message.includes("timeout")) {
      throw new Error("jlink scan timed out after 15s");
    }
    throw error;
  }
}