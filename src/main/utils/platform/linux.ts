import { existsSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
import log from "../logger";
import type { PlatformStrategy } from "./index";

export class LinuxPlatform implements PlatformStrategy {
  readonly jlinkBin        = "JLinkExe";
  readonly jlinkExecutable = "JLinkExe";
  readonly pathSeparator   = ":";

  getSearchDirs(): string[] {
    return [
      join("/opt", "SEGGER"),
      join("/usr", "local", "SEGGER"),
      join(homedir(), "SEGGER"),
    ];
  }

  /**
   * Add dirPath to /etc/environment (system-wide) via pkexec.
   * Falls back to ~/.profile for current user if pkexec unavailable.
   * Always updates process.env.PATH for the current session.
   */
  addToSystemPath(dirPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Try system-wide via pkexec (PolicyKit — most distros have this)
        const envFile = "/etc/environment";
        const currentContent = existsSync(envFile)
          ? execSync(`cat ${envFile}`, { encoding: "utf8" })
          : "";

        const pathLineMatch = currentContent.match(/^PATH="(.*)"/m);
        const currentPath   = pathLineMatch?.[1] ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

        if (currentPath.includes(dirPath)) {
          log.info(`[platform/linux] Already in system PATH: ${dirPath}`);
          process.env.PATH = `${process.env.PATH}:${dirPath}`;
          return resolve(true);
        }

        const newPathLine = `PATH="${currentPath}:${dirPath}"`;
        const newContent  = pathLineMatch
          ? currentContent.replace(/^PATH=".*"/m, newPathLine)
          : `${currentContent.trim()}\n${newPathLine}\n`;

        // Write via pkexec tee
        execSync(
          `echo '${newContent}' | pkexec tee ${envFile} > /dev/null`,
          { encoding: "utf8" }
        );

        process.env.PATH = `${process.env.PATH}:${dirPath}`;
        log.info(`[platform/linux] System PATH updated via /etc/environment: ${dirPath}`);
        resolve(true);

      } catch (err) {
        log.warn(`[platform/linux] pkexec failed or cancelled — falling back to ~/.profile: ${err}`);

        // Fallback: append to ~/.profile (current user only)
        try {
          const profilePath = join(homedir(), ".profile");
          const exportLine  = `\nexport PATH="$PATH:${dirPath}"\n`;
          writeFileSync(profilePath, exportLine, { flag: "a", encoding: "utf8" });
          log.info(`[platform/linux] Appended to ~/.profile: ${dirPath}`);
        } catch (profileErr) {
          log.warn(`[platform/linux] ~/.profile fallback also failed: ${profileErr}`);
        }

        process.env.PATH = `${process.env.PATH}:${dirPath}`;
        resolve(false);
      }
    });
  }
}