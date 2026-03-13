import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/types";
import logger from "../utils/logger";
import { ProbeManager } from "../services/probeManager";

/**
 * Register all probe-related IPC handlers.
 * Called once from main.ts after ProbeManager is initialized.
 */
export function registerProbeHandlers(probeManager: ProbeManager): void {
  // Returns: ProbeInstallationStatus
  ipcMain.handle(IPC_CHANNELS.DETECT_INSTALLATION, async () => {
    logger.info("[IPC] Detecting probe installation...");
    return probeManager.detectInstallation();
  });

  // Returns: Probe[]
  ipcMain.handle(IPC_CHANNELS.SCAN_PROBES, async () => {
    logger.info("[IPC] Scanning for probes...");
    return probeManager.scanProbes();
  });

  // Returns: { status: ProbeInstallationStatus; probes: Probe[] }
  // Single round trip used by App.tsx on startup — avoids 2 sequential IPC calls
  ipcMain.handle(IPC_CHANNELS.DETECT_AND_SCAN, async () => {
    logger.info("[IPC] Detect and scan...");
    const status = await probeManager.detectInstallation();
    const probes = status.installed ? await probeManager.scanProbes() : [];
    return { status, probes };
  });

  // Returns: void
  ipcMain.handle(IPC_CHANNELS.OPEN_CONFIGURATOR, async (_event, probeIndex: number) => {
    logger.info(`[IPC] Opening configurator for probe index: ${probeIndex}`);
    return probeManager.openConfigurator(probeIndex);
  });

  ipcMain.handle(IPC_CHANNELS.SET_NICKNAME, async (_event, probeIndex: number, nickname: string) => {
    logger.info(`[IPC] Setting nickname for probe index: ${probeIndex}`);
    return probeManager.setNickname(probeIndex, nickname);
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_FIRMWARE, async (_event, probeIndex: number) => {
    logger.info(`[IPC] Updating firmware for probe index: ${probeIndex}`);
    return probeManager.updateFirmware(probeIndex);
  });

  logger.info("[IPC] Probe handlers registered");
}