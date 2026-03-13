import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { runCommand } from "../../../utils/exec";
import log from "../../../utils/logger";
import { ProbeInstallationStatus } from "@shared/types";
import { getPlatformStrategy } from "../../../utils/platform/index";

const platform = getPlatformStrategy();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Scan all platform-specific SEGGER directories for a JLink install folder.
 * Returns the first directory that contains the JLink executable.
 */
function findJLinkDir(): string | null {
  for (const searchDir of platform.getSearchDirs()) {
    if (!existsSync(searchDir)) continue;
    try {
      const entries = readdirSync(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = join(searchDir, entry.name);
        if (existsSync(join(candidate, platform.jlinkExecutable))) {
          log.info(`[detectInstallation] Found ${platform.jlinkExecutable} in: ${candidate}`);
          return candidate;
        }
      }
    } catch (err) {
      log.warn(`[detectInstallation] Error scanning ${searchDir}: ${err}`);
    }
  }
  return null;
}

/**
 * Run JLink briefly to extract the version string from its stdout banner.
 * Accepts an optional explicit binary path to bypass PATH lookup issues.
 */
async function readJLinkVersion(binPath?: string): Promise<string | undefined> {
  const bin = binPath ?? platform.jlinkBin;
  try {
    const result = await runCommand(bin, ["-NoGUI", "1"], {
      input: "\n\nExit\n",
      timeout: 10_000,
      windowsHide: true,
      env: { JLINK_NO_GUI: "1", NO_GUI: "1", DISPLAY: ":0" },
    });
    const match = result.stdout.match(/SEGGER J-Link Commander (V[\d.]+)/i);
    return match ? `SEGGER J-Link Commander ${match[1]}` : undefined;
  } catch {
    return undefined;
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Detect J-Link installation using a 3-step fallback strategy:
 *
 * Step 1: JLink binary found in PATH → return immediately with version
 * Step 2: JLink binary found in platform search dirs
 *         → try to add to system PATH (elevation prompt)
 *         → update process.env.PATH for current session regardless
 *         → read version, return installed:true
 * Step 3: Not found → return installed:false → renderer shows install screen
 */
export async function detectInstallation(): Promise<ProbeInstallationStatus> {
  log.info("[detectInstallation] Detecting J-Link installation...");

  // ── Step 1: Check PATH ────────────────────────────────────────────────────
  try {
    const result = await runCommand(platform.jlinkBin, ["-NoGUI", "1"], {
      input: "\n\nExit\n",
      timeout: 10_000,
      windowsHide: true,
      env: { JLINK_NO_GUI: "1", NO_GUI: "1", DISPLAY: ":0" },
    });

    const notFound =
      result.stderr.includes("not recognized") ||
      result.stderr.includes("command not found") ||
      result.stderr.includes("ENOENT");

    if (!notFound) {
      const match   = result.stdout.match(/SEGGER J-Link Commander (V[\d.]+)/i);
      const version = match ? `SEGGER J-Link Commander ${match[1]}` : undefined;
      log.info(`[detectInstallation] Found in PATH: ${version ?? "unknown version"}`);
      return { installed: true, version };
    }

    log.warn("[detectInstallation] JLink binary not found in PATH");
  } catch (error) {
    if (error instanceof Error && !error.message.includes("ENOENT") && !error.message.includes("timeout")) {
      log.error(`[detectInstallation] Unexpected error in Step 1: ${error.message}`);
    }
  }

  // ── Step 2: Check platform search dirs ───────────────────────────────────
  const jlinkDir = findJLinkDir();

  if (jlinkDir) {
    log.info(`[detectInstallation] Found in search dirs — adding to system PATH...`);

    const added = await platform.addToSystemPath(jlinkDir);
    if (!added) {
      // Elevation denied/cancelled — process.env.PATH already updated by strategy
      log.warn("[detectInstallation] Elevation denied — PATH updated for current session only");
    }

    // On Windows, the PATH env var key may be "Path" not "PATH" — normalize both
    const pathKey = Object.keys(process.env).find(k => k.toLowerCase() === "path") ?? "PATH";
    const fullPath = process.env[pathKey] ?? "";
    const hasJLink = fullPath.toLowerCase().includes("jlink");
    log.info(`[detectInstallation] PATH key="${pathKey}", hasJLink=${hasJLink}, tail: ${fullPath.slice(-200)}`);
    // Pass full path directly — avoids relying on process.env.PATH propagation to execa
    const version = await readJLinkVersion(join(jlinkDir, platform.jlinkExecutable));
    log.info(`[detectInstallation] Version: ${version ?? "unknown"}`);
    return { installed: true, path: join(jlinkDir, platform.jlinkExecutable), version };
  }

  // ── Step 3: Not found ─────────────────────────────────────────────────────
  log.warn("[detectInstallation] J-Link not found anywhere on this system");
  return { installed: false };
}