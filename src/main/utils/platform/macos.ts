import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
import log from "../logger";
import type { PlatformStrategy } from "./index";

export class MacOSPlatform implements PlatformStrategy {
  readonly jlinkBin        = "JLinkExe";
  readonly jlinkExecutable = "JLinkExe";
  readonly pathSeparator   = ":";

  getSearchDirs(): string[] {
    return [
      join("/Applications", "SEGGER"),
      join(homedir(), "Applications", "SEGGER"),
      join("/usr", "local", "bin"),
      join("/opt", "SEGGER"),
    ];
  }

  /**
   * Add dirPath to /etc/paths.d/jlink (system-wide) via osascript elevation.
   * Falls back to updating process.env.PATH for the current session only.
   */
  addToSystemPath(dirPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Write to /etc/paths.d/jlink — picked up by path_helper on next login
        const script = `do shell script "echo '${dirPath}' > /etc/paths.d/jlink" with administrator privileges`;
        execSync(`osascript -e '${script}'`, { encoding: "utf8" });

        process.env.PATH = `${process.env.PATH}:${dirPath}`;
        log.info(`[platform/macos] System PATH updated via /etc/paths.d/jlink: ${dirPath}`);
        resolve(true);
      } catch (err) {
        // User cancelled the password prompt
        log.warn(`[platform/macos] Elevation cancelled or failed: ${err}`);
        process.env.PATH = `${process.env.PATH}:${dirPath}`;
        resolve(false);
      }
    });
  }
}