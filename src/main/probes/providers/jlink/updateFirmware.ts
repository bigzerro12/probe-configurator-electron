import { runCommand } from "../../../utils/exec";
import log from "../../../utils/logger";
import { getPlatformStrategy } from "../../../utils/platform/index";

const platform = getPlatformStrategy();


const FIRMWARE_REGEX = /Firmware:.*compiled\s+(.+)/;

export type FirmwareUpdateResult =
  | { status: "updated";   firmware: string }  // firmware was outdated and updated
  | { status: "current";   firmware: string }  // firmware was already up to date
  | { status: "failed";    error: string    };  // update failed

/**
 * Update firmware of a single probe by its index in ShowEmuList order.
 *
 * Flow:
 *   exec EnableAutoUpdateFW
 *   selectprobe
 *   <index>
 *   exit
 *
 * Possible outcomes in output after selectprobe:
 *   A) "Updating firmware: ..." + "New firmware booted successfully" → updated
 *   B) No "Updating firmware" line, just "Firmware: ..." → already current
 *   C) Error / timeout → failed
 */
export async function updateProbeFirmware(
  probeIndex: number,
  jlinkBin: string = platform.jlinkBin,
  timeoutMs = 60_000,   // firmware flash can take up to ~30s
): Promise<FirmwareUpdateResult> {
  const input = [
    "exec EnableAutoUpdateFW",
    "selectprobe",
    String(probeIndex),
    "exit",
  ].join("\n") + "\n";

  log.info(`[updateFirmware] Updating probe[${probeIndex}]...`);

  try {
    const result = await runCommand(jlinkBin, ["-NoGUI", "1"], {
      input,
      timeout: timeoutMs,
      windowsHide: true,
      env: { JLINK_NO_GUI: "1", NO_GUI: "1", DISPLAY: ":0" },
    });

    const stdout = result.stdout;
    log.info(`[updateFirmware] Output: ${stdout.slice(0, 400)}`);

    const firmwareMatch = stdout.match(FIRMWARE_REGEX);
    const firmware = firmwareMatch?.[1]?.trim();

    if (!firmware) {
      return { status: "failed", error: "Could not parse firmware version from output" };
    }

    const wasUpdated = stdout.includes("New firmware booted successfully");

    if (wasUpdated) {
      log.info(`[updateFirmware] Probe[${probeIndex}] updated → ${firmware}`);
      return { status: "updated", firmware };
    } else {
      log.info(`[updateFirmware] Probe[${probeIndex}] already current: ${firmware}`);
      return { status: "current", firmware };
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`[updateFirmware] Failed: ${msg}`);
    return { status: "failed", error: msg };
  }
}