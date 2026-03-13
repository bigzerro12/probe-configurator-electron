import os from "os";
import { WindowsPlatform } from "./windows";
import { MacOSPlatform }   from "./macos";
import { LinuxPlatform }   from "./linux";

export interface PlatformStrategy {
  /** Executable name to call — "JLink" on Windows, "JLinkExe" on macOS/Linux */
  readonly jlinkBin: string;

  /** All directories to scan for a JLink installation folder */
  getSearchDirs(): string[];

  /**
   * Add a directory to the system-wide PATH permanently.
   * Returns true if successful, false if user cancelled/denied elevation.
   * Also updates process.env.PATH for the current session on success or failure.
   */
  addToSystemPath(dirPath: string): Promise<boolean>;

  /** Executable filename inside the install dir, e.g. "JLink.exe" / "JLinkExe" */
  readonly jlinkExecutable: string;

  /** Path separator for PATH env var — ";" on Windows, ":" elsewhere */
  readonly pathSeparator: string;
}

export function getPlatformStrategy(): PlatformStrategy {
  switch (process.platform) {
    case "win32":  return new WindowsPlatform();
    case "darwin": return new MacOSPlatform();
    case "linux":  return new LinuxPlatform();
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}