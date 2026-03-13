import { existsSync } from "fs";
import { join, dirname } from "path";
import { spawn } from "child_process";
import log from "../../../utils/logger";
import { getPlatformStrategy } from "../../../utils/platform/index";

const platform = getPlatformStrategy();

/**
 * Resolve the JLink Configurator binary path.
 *
 * SEGGER ships a GUI configurator alongside JLink:
 *   Windows : JLinkConfig.exe  (same dir as JLink.exe)
 *   macOS   : JLinkConfig      (same dir as JLinkExe, or /Applications/SEGGER/...)
 *   Linux   : JLinkConfig      (same dir as JLinkExe)
 *
 * We try, in order:
 *   1. Same directory as the resolved jlinkBin (most reliable)
 *   2. Well-known absolute paths per platform
 *   3. PATH lookup (last resort)
 */
function resolveConfiguratorBin(jlinkBin: string): string | null {
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";

  const configBinName = isWin ? "JLinkConfig.exe" : "JLinkConfig";

  // 1. Sibling of the resolved jlinkBin
  if (jlinkBin && jlinkBin !== platform.jlinkBin) {
    const siblingPath = join(dirname(jlinkBin), configBinName);
    if (existsSync(siblingPath)) {
      log.info(`[openConfigurator] Found configurator alongside JLink: ${siblingPath}`);
      return siblingPath;
    }
  }

  // 2. Platform well-known paths
  const candidates: string[] = isWin
    ? [
        join("C:\\", "Program Files", "SEGGER", "JLink", configBinName),
        join("C:\\", "Program Files (x86)", "SEGGER", "JLink", configBinName),
        join(process.env.USERPROFILE ?? "", "AppData", "Roaming", "SEGGER", "JLink", configBinName),
      ]
    : isMac
    ? [
        `/Applications/SEGGER/JLink/${configBinName}`,
        `/usr/local/bin/${configBinName}`,
        `/opt/SEGGER/JLink/${configBinName}`,
      ]
    : [
        `/opt/SEGGER/JLink/${configBinName}`,
        `/usr/local/SEGGER/JLink/${configBinName}`,
        `/usr/local/bin/${configBinName}`,
      ];

  for (const c of candidates) {
    if (existsSync(c)) {
      log.info(`[openConfigurator] Found configurator at well-known path: ${c}`);
      return c;
    }
  }

  // 3. Assume it is in PATH
  log.warn(`[openConfigurator] Configurator not found on disk — trying PATH: ${configBinName}`);
  return configBinName;
}

/**
 * Open J-Link Configurator GUI for driver switching.
 * Launches the process detached so it outlives the IPC call.
 * Does NOT wait for the GUI to close.
 */
export async function openConfigurator(
  probeIndex: number,
  jlinkBin: string = platform.jlinkBin,
): Promise<void> {
  const bin = resolveConfiguratorBin(jlinkBin);
  if (!bin) {
    throw new Error(
      "J-Link Configurator not found. Please ensure J-Link software is properly installed."
    );
  }

  log.info(`[openConfigurator] Launching: ${bin} (probe index ${probeIndex})`);

  return new Promise((resolve, reject) => {
    const child = spawn(bin, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: false,
    });

    child.on("error", (err) => {
      log.error(`[openConfigurator] Failed to launch: ${err.message}`);
      reject(
        new Error(
          `Failed to open J-Link Configurator: ${err.message}. ` +
          `Please ensure J-Link software is properly installed.`
        )
      );
    });

    // Detach immediately — we do not wait for the GUI to close
    child.unref();
    log.info(`[openConfigurator] Configurator launched (pid ${child.pid})`);
    resolve();
  });
}