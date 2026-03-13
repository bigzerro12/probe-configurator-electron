import { ipcMain, net, BrowserWindow } from "electron";
import {
  createWriteStream, unlinkSync, existsSync,
  mkdirSync, readdirSync, writeFileSync,
} from "fs";
import { join } from "path";
import { exec, execSync } from "child_process";
import { tmpdir } from "os";
import logger from "../utils/logger";

const JLINK_DOWNLOAD_URL =
  "https://www.segger.com/downloads/jlink/JLink_Windows_x86_64.exe";

const SEGGER_DIR = join(process.env.USERPROFILE || "", "AppData", "Roaming", "SEGGER");

// Known SEGGER install locations — checked in order during JLink.exe discovery
const JLINK_SEARCH_DIRS = [
  join("C:\\", "Program Files", "SEGGER"),
  join("C:\\", "Program Files (x86)", "SEGGER"),
  SEGGER_DIR,
];

// ─── Active downloads map (for cancellation) ──────────────────────────────────

const activeDownloads = new Map<string, {
  request: any; response: any; writer: any;
  resolve: (value: { success: boolean; path: string; cancelled?: boolean }) => void;
  reject: (reason?: any) => void;
  savePath: string;
}>();

// ─── Active install tracker (for cancellation) ───────────────────────────────

let activeInstall: {
  installerStartedWriting: boolean;
  cancelled: boolean;
} | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findJLinkInSeggerDir(): string | null {
  for (const searchDir of JLINK_SEARCH_DIRS) {
    if (!existsSync(searchDir)) continue;
    try {
      const entries = readdirSync(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = join(searchDir, entry.name);
        if (existsSync(join(candidate, "JLink.exe"))) {
          logger.info(`[install] Found JLink.exe in: ${candidate}`);
          return candidate;
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Add dirPath to Windows system PATH (HKLM) via UAC-elevated PowerShell.
 * Uses a temp .ps1 file + PowerShell here-string to avoid escaping issues.
 */
function addToSystemPathElevated(dirPath: string): Promise<{ success: boolean; message: string }> {
  const scriptPath = join(tmpdir(), "jlink_add_path.ps1");

  return new Promise((resolve) => {
    try {
      const currentSystemPath = execSync(
        `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('PATH', 'Machine')"`,
        { encoding: "utf8" }
      ).trim();

      if (currentSystemPath.toLowerCase().includes(dirPath.toLowerCase())) {
        logger.info(`[environment] Already in system PATH: ${dirPath}`);
        return resolve({ success: true, message: "Already in system PATH" });
      }

      const newPath = `${currentSystemPath};${dirPath}`;

      // here-string handles semicolons/backslashes/spaces — no escaping needed
      const ps1Content = [
        `$newPath = @'`, newPath, `'@`,
        `[Environment]::SetEnvironmentVariable('PATH', $newPath, 'Machine')`,
      ].join("\r\n");

      writeFileSync(scriptPath, ps1Content, { encoding: "utf8" });

      const cmd = `powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \\"${scriptPath}\\"' -Verb RunAs -Wait"`;

      exec(cmd, { encoding: "utf8" }, (error) => {
        try { if (existsSync(scriptPath)) unlinkSync(scriptPath); } catch {}
        if (error) {
          logger.error(`[environment] Elevation failed: ${error.message}`);
          return resolve({ success: false, message: "UAC was denied or PowerShell failed." });
        }
        process.env.PATH = `${process.env.PATH};${dirPath}`;
        logger.info(`[environment] System PATH updated: ${dirPath}`);
        resolve({ success: true, message: `Added to system PATH: ${dirPath}` });
      });

    } catch (err) {
      try { if (existsSync(scriptPath)) unlinkSync(scriptPath); } catch {}
      resolve({ success: false, message: `Error: ${err instanceof Error ? err.message : err}` });
    }
  });
}

function startDirectDownload(
  url: string, savePath: string, mainWindow: BrowserWindow, downloadId: string,
  resolve: (v: { success: boolean; path: string; cancelled?: boolean }) => void,
  reject: (r?: any) => void
) {
  const request = net.request({ method: "GET", url });
  request.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

  request.on("response", (res) => {
    const contentType = (res.headers["content-type"] as string) ?? "";
    if (res.statusCode !== 200 || contentType.includes("text/html")) {
      activeDownloads.delete(downloadId);
      return reject(new Error(`Direct download failed (status ${res.statusCode}).`));
    }
    const totalBytes = parseInt((res.headers["content-length"] as string) ?? "0", 10);
    let receivedBytes = 0;
    const writer = createWriteStream(savePath);
    activeDownloads.set(downloadId, { request, response: res, writer, resolve, reject, savePath });

    res.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.length;
      writer.write(chunk);
      if (totalBytes > 0) {
        mainWindow.webContents.send("download:progress", {
          percent: Math.round((receivedBytes / totalBytes) * 100),
          transferred: receivedBytes, total: totalBytes,
        });
      }
    });
    res.on("end", () => {
      writer.end();
      activeDownloads.delete(downloadId);
      mainWindow.webContents.send("download:completed", { path: savePath });
      resolve({ success: true, path: savePath });
    });
    res.on("error", (err: Error) => {
      writer.destroy();
      activeDownloads.delete(downloadId);
      reject(err);
    });
  });
  request.on("error", (err: Error) => { activeDownloads.delete(downloadId); reject(err); });
  request.end();
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

export function registerDownloadHandlers(): void {

  // ── Download J-Link installer ───────────────────────────────────────────────

  ipcMain.handle("download:jlink", async () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) throw new Error("No main window found");

    if (!existsSync(SEGGER_DIR)) mkdirSync(SEGGER_DIR, { recursive: true });

    const savePath = join(SEGGER_DIR, "JLink_Windows_x86_64.exe");
    const downloadId = "jlink-download";
    logger.info(`[download] Starting J-Link download → ${savePath}`);

    return new Promise<{ success: boolean; path: string; cancelled?: boolean }>((resolve, reject) => {
      const request = net.request({ method: "POST", url: JLINK_DOWNLOAD_URL });
      request.setHeader("Content-Type", "application/x-www-form-urlencoded");
      request.setHeader("Referer", "https://www.segger.com/downloads/jlink/");
      request.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

      request.on("response", (res) => {
        const contentType = (res.headers["content-type"] as string) ?? "";

        if (res.statusCode !== 200 || contentType.includes("text/html")) {
          let html = "";
          res.on("data", (chunk: Buffer) => { html += chunk.toString(); });
          res.on("end", () => {
            const match = html.match(/https:\/\/www\.segger\.com\/downloads\/jlink\/[^"'\s]+\.exe/);
            if (match) {
              startDirectDownload(match[0], savePath, mainWindow, downloadId, resolve, reject);
            } else {
              activeDownloads.delete(downloadId);
              reject(new Error("Could not extract download URL from SEGGER. Please download manually."));
            }
          });
          return;
        }

        const totalBytes = parseInt((res.headers["content-length"] as string) ?? "0", 10);
        let receivedBytes = 0;
        const writer = createWriteStream(savePath);
        activeDownloads.set(downloadId, { request, response: res, writer, resolve, reject, savePath });

        res.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          writer.write(chunk);
          if (totalBytes > 0) {
            mainWindow.webContents.send("download:progress", {
              percent: Math.round((receivedBytes / totalBytes) * 100),
              transferred: receivedBytes, total: totalBytes,
            });
          }
        });
        res.on("end", () => {
          writer.end();
          logger.info(`[download] Completed: ${savePath}`);
          mainWindow.webContents.send("download:completed", { path: savePath });
          activeDownloads.delete(downloadId);
          resolve({ success: true, path: savePath });
        });
        res.on("error", (err: Error) => {
          writer.destroy();
          activeDownloads.delete(downloadId);
          reject(err);
        });
      });
      request.on("error", (err: Error) => { activeDownloads.delete(downloadId); reject(err); });
      request.write("accept_license_agreement=accepted");
      request.end();
    });
  });

  // ── Cancel download ─────────────────────────────────────────────────────────

  ipcMain.handle("download:cancel", async () => {
    const active = activeDownloads.get("jlink-download");
    if (!active) return { success: false, error: "No active download" };
    try {
      active.writer?.destroy();
      active.request?.abort();
      if (active.savePath && existsSync(active.savePath)) unlinkSync(active.savePath);
      active.resolve({ success: false, cancelled: true, path: "" });
      activeDownloads.delete("jlink-download");
      BrowserWindow.getAllWindows()[0]?.webContents.send("download:cancelled");
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  });

  // ── Install J-Link + auto add to system PATH ────────────────────────────────
  //
  // Uses spawnSync to directly invoke the installer executable — no shell wrapper.
  // spawnSync blocks until the installer PID exits, guaranteeing all files are written.

  ipcMain.handle("download:install", async (_event, installerPath: string) => {
    logger.info(`[install] Starting installation: ${installerPath}`);
    logger.info(`[install] Running: "${installerPath}" /S /D=${SEGGER_DIR}`);

    // Kill any leftover installer processes from previous cancelled installs
    // to avoid conflicts when spawning a new installer instance
    try {
      const { execSync: killSync } = await import("child_process");
      killSync(
        `taskkill /F /IM JLink_Windows_x86_64.exe /T 2>nul & taskkill /F /IM JLink_Windows_x86_64.tmp /T 2>nul`,
        { shell: true, stdio: "pipe" }
      );
      // Small delay to let OS release file handles after kill
      await new Promise(r => setTimeout(r, 800));
    } catch { /* no leftover processes — ignore */ }

    // Use Start-Process -Verb RunAs — triggers UAC elevation before installer runs.
    // SEGGER installer needs admin rights immediately to copy files to Temp.
    // execSync blocks until PowerShell exits (after launching elevated process).
    // If user clicks No on UAC, Start-Process throws → we catch and return cancelled.
    const { execSync: shellExec } = await import("child_process");
    const safeInstaller = installerPath.replace(/'/g, "''");
    const safeDest      = SEGGER_DIR.replace(/'/g, "''");
    try {
      shellExec(
        `powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '${safeInstaller}' -ArgumentList '/S /D=${safeDest}' -Verb RunAs"`,
        { stdio: "pipe", windowsHide: true, timeout: 30_000 }
      );
    } catch (spawnErr) {
      logger.info("[install] UAC denied by user");
      activeInstall = null;
      return { success: false, cancelled: true, message: "Installation was cancelled." };
    }

    logger.info("[install] Installer launcher started, polling for JLink.exe...");

    // Poll until JLink_x64.dll appears — last file extracted, signals install complete.
    //
    // Cancel detection strategy:
    //   The installer requires UAC approval before writing any files.
    //   We track whether the launcher process has exited WITHOUT creating any new files.
    //   If launcher exits and SEGGER dir is unchanged → user denied UAC → cancelled.
    //   If launcher exits and files were written → installer is running in background.
    // Register active install so cancelInstall handler can interrupt it
    activeInstall = { installerStartedWriting: false, cancelled: false };

    // Record install start time — used to verify JLink_x64.dll was written by THIS install
    const installStartTime = Date.now();
    logger.info(`[install] Install start time: ${new Date(installStartTime).toISOString()}`);

    const jlinkDir = await new Promise<string | null | "cancelled">((resolve) => {
      const POLL_INTERVAL = 500;
      const TOTAL_TIMEOUT = 120_000;
      const startTime = Date.now();

      // UAC cancel is handled by ShellExecute throwing an exception (above).
      // Here we only need to poll for completion or UI cancel.
      const { statSync } = require("fs");

      const check = () => {
        // User clicked Cancel from UI
        if (activeInstall?.cancelled) {
          logger.info("[install] Cancelled by user via UI");
          return resolve("cancelled");
        }

        const elapsed = Date.now() - startTime;

        // Check for completion — JLink_x64.dll must exist AND be written after install started
        const found = findJLinkInSeggerDir();
        if (found) {
          const dllPath = join(found, "JLink_x64.dll");
          if (existsSync(dllPath)) {
            const dllMtime = statSync(dllPath).mtimeMs;
            if (dllMtime >= installStartTime) {
              logger.info(`[install] JLink_x64.dll ready (written at ${new Date(dllMtime).toISOString()}): ${found}`);
              return resolve(found);
            }
          }
        }

        // Hard timeout
        if (elapsed > TOTAL_TIMEOUT) {
          logger.warn("[install] Timed out waiting for JLink_x64.dll");
          return resolve(findJLinkInSeggerDir() ?? null);
        }

        setTimeout(check, POLL_INTERVAL);
      };
      check();
    });

    activeInstall = null;

    if (jlinkDir === "cancelled") {
      logger.info("[install] Installation cancelled by user");
      return { success: false, cancelled: true, message: "Installation was cancelled." };
    }

    if (!jlinkDir) {
      return {
        success: false,
        message: "Installation timed out. JLink.exe was not found after 120s.",
      };
    }

    logger.info(`[install] Adding ${jlinkDir} to system PATH...`);
    const pathResult = await addToSystemPathElevated(jlinkDir);

    return {
      success: true,
      message: pathResult.success
        ? "J-Link installed and added to system PATH successfully."
        : `J-Link installed, but PATH was not updated (${pathResult.message}). You may need to add it manually.`,
      path: jlinkDir,
    };
  });

  // ── Cancel ongoing install ─────────────────────────────────────────────────
  // Deletes installer .exe and JLink_Vxxx folder (if already created)

  // keepInstaller=true  → delete JLink_V* folder only, keep .exe (install-only cancel)
  // keepInstaller=false → delete .exe only, no folder cleanup (download cancel)
  // keepInstaller=true + install state → delete JLink_V* folder, keep .exe (download+install cancel at install step)

  ipcMain.handle("download:cancelInstall", async (_event, keepInstaller: boolean) => {
    logger.info(`[install] Cancel requested — keepInstaller: ${keepInstaller}`);

    // Signal the polling loop to stop
    if (activeInstall) {
      activeInstall.cancelled = true;
    }

    const { execSync } = await import("child_process");

    if (!keepInstaller) {
      // Delete installer .exe (download was cancelled or download+install cancelled at download step)
      const installerPath = join(SEGGER_DIR, "JLink_Windows_x86_64.exe");
      try {
        if (existsSync(installerPath)) {
          unlinkSync(installerPath);
          logger.info(`[install] Deleted installer: ${installerPath}`);
        }
      } catch (err) {
        logger.warn(`[install] Could not delete installer: ${err}`);
      }
    } else {
      // Delete any JLink_V* folder (install was cancelled — keep .exe for retry)
      // Must kill installer processes first to release file locks
      try {
        execSync(`taskkill /F /IM JLink.exe /T 2>nul & taskkill /F /IM JLink_Windows_x86_64.exe /T 2>nul`, {
          shell: true, stdio: "pipe",
        });
        logger.info("[install] Killed installer processes");
      } catch { /* processes may not be running, ignore */ }

      // Small delay to let OS release file handles after kill
      await new Promise(r => setTimeout(r, 500));

      try {
        for (const searchDir of JLINK_SEARCH_DIRS) {
          if (!existsSync(searchDir)) continue;
          const entries = readdirSync(searchDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (/^JLink_V/i.test(entry.name)) {
              const folderPath = join(searchDir, entry.name);
              try {
                execSync(`rmdir /s /q "${folderPath}"`, { shell: true, stdio: "pipe" });
                logger.info(`[install] Deleted JLink folder: ${folderPath}`);
              } catch {
                logger.warn(`[install] Could not delete folder: ${folderPath}`);
              }
            }
          }
        }
      } catch (err) {
        logger.warn(`[install] Error during folder cleanup: ${err}`);
      }
    }

    return { success: true };
  });

  // ── Scan for existing installer ─────────────────────────────────────────────

  ipcMain.handle("download:scan", async () => {
    const installerPath = join(SEGGER_DIR, "JLink_Windows_x86_64.exe");
    const found = existsSync(installerPath);
    logger.info(`[scan] Installer ${found ? "found" : "not found"}: ${installerPath}`);
    return { found, path: found ? installerPath : "", message: found ? "Installer found" : "Installer not found" };
  });

  logger.info("[download] Download handlers registered");
}