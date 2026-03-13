import { existsSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { exec, execSync } from "child_process";
import { tmpdir, homedir } from "os";
import log from "../logger";
import type { PlatformStrategy } from "./index";

export class WindowsPlatform implements PlatformStrategy {
  readonly jlinkBin        = "JLink";
  readonly jlinkExecutable = "JLink.exe";
  readonly pathSeparator   = ";";

  getSearchDirs(): string[] {
    const seggerAppData = join(homedir(), "AppData", "Roaming", "SEGGER");
    return [
      join("C:\\", "Program Files",        "SEGGER"),
      join("C:\\", "Program Files (x86)",  "SEGGER"),
      seggerAppData,
    ];
  }

  /**
   * Add dirPath to Windows system PATH (HKLM) via UAC-elevated PowerShell.
   * Uses a .ps1 temp file to avoid semicolon/space escaping issues.
   */
  addToSystemPath(dirPath: string): Promise<boolean> {
    const scriptPath = join(tmpdir(), "jlink_add_path.ps1");

    return new Promise((resolve) => {
      try {
        const currentSystemPath = execSync(
          `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('PATH', 'Machine')"`,
          { encoding: "utf8" }
        ).trim();

        if (currentSystemPath.toLowerCase().includes(dirPath.toLowerCase())) {
          log.info(`[platform/windows] Already in system PATH: ${dirPath}`);
          const pathKey = Object.keys(process.env).find(k => k.toLowerCase() === "path") ?? "PATH";
          if (!process.env[pathKey]?.toLowerCase().includes(dirPath.toLowerCase())) {
            process.env[pathKey] = `${process.env[pathKey]};${dirPath}`;
          }
          return resolve(true);
        }

        const ps1Content = [
          `$newPath = @'`, `${currentSystemPath};${dirPath}`, `'@`,
          `[Environment]::SetEnvironmentVariable('PATH', $newPath, 'Machine')`,
        ].join("\r\n");

        writeFileSync(scriptPath, ps1Content, { encoding: "utf8" });

        const cmd = `powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \\"${scriptPath}\\"' -Verb RunAs -Wait"`;

        exec(cmd, { encoding: "utf8" }, (error) => {
          try { if (existsSync(scriptPath)) unlinkSync(scriptPath); } catch {}
          if (error) {
            log.error(`[platform/windows] addToSystemPath failed: ${error.message}`);
            return resolve(false);
          }
          const pathKey2 = Object.keys(process.env).find(k => k.toLowerCase() === "path") ?? "PATH";
          process.env[pathKey2] = `${process.env[pathKey2]};${dirPath}`;
          log.info(`[platform/windows] System PATH updated: ${dirPath}`);
          resolve(true);
        });

      } catch (err) {
        try { if (existsSync(scriptPath)) unlinkSync(scriptPath); } catch {}
        log.error(`[platform/windows] addToSystemPath error: ${err}`);
        resolve(false);
      }
    });
  }
}