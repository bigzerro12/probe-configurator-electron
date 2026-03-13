import { app, BrowserWindow } from "electron";
import { join } from "path";
import { registerProbeHandlers } from "./ipc/probeHandlers";
import { registerDownloadHandlers } from "./ipc/downloadHandlers";
import { ProbeManager } from "./services/probeManager";
import logger from "./utils/logger";

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 950,
    minWidth: 700,
    minHeight: 650,
    webPreferences: {
      //FileName is "preload" per electron.vite.config.ts lib.fileName
      // __dirname = out/main/ → ../preload/preload.js = out/preload/preload.js ✅
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,   // REQUIRED
      nodeIntegration: false,   // REQUIRED — never enable
      sandbox: false,           // required for preload Node API access
    },
  });

  // Always open DevTools in dev — critical for catching renderer errors
  if (process.env.NODE_ENV === "development") {
    win.webContents.openDevTools();
  }

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);  // dev: Vite dev server
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));  // prod: built file
  }

  logger.info("[main] Main window created");
  return win;
}

app.whenReady().then(() => {
  logger.info("[main] Electron app ready");
  const probeManager = new ProbeManager();
  registerProbeHandlers(probeManager);
  registerDownloadHandlers();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
