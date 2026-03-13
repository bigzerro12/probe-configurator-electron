import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, ProbeInstallationStatus, Probe } from "@shared/types";

// ─── Probe API ────────────────────────────────────────────────────────────────

export interface ProbeAPI {
  detectInstallation(): Promise<ProbeInstallationStatus>;
  scanProbes(): Promise<Probe[]>;
  detectAndScan(): Promise<{ status: ProbeInstallationStatus; probes: Probe[] }>;
  openConfigurator(probeIndex: number): Promise<void>;
  updateFirmware(probeIndex: number): Promise<{
    status: "updated" | "current" | "failed";
    firmware?: string;
    error?: string;
  }>;
  setNickname(probeIndex: number, nickname: string): Promise<{
    success: boolean;
    error?: string;
  }>;
}

// ─── Download API ─────────────────────────────────────────────────────────────

export interface DownloadAPI {
  downloadJLink(): Promise<{ success: boolean; path: string; cancelled?: boolean }>;
  cancelDownload(): Promise<{ success: boolean; error?: string }>;
  installJLink(installerPath: string): Promise<{ success: boolean; cancelled?: boolean; message: string; path?: string }>;
  cancelInstall(keepInstaller: boolean): Promise<{ success: boolean }>;
  scanForInstaller(): Promise<{ found: boolean; path: string; message: string }>;
  onProgress(callback: (data: { percent: number; transferred: number; total: number }) => void): void;
  onCompleted(callback: (data: { path: string }) => void): void;
  onCancelled(callback: () => void): void;
}

// ─── Context Bridge ───────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld("probeAPI", {
  detectInstallation: () => ipcRenderer.invoke(IPC_CHANNELS.DETECT_INSTALLATION),
  scanProbes:         () => ipcRenderer.invoke(IPC_CHANNELS.SCAN_PROBES),
  detectAndScan:      () => ipcRenderer.invoke(IPC_CHANNELS.DETECT_AND_SCAN),
  openConfigurator:   (probeIndex: number) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_CONFIGURATOR, probeIndex),
  updateFirmware:     (probeIndex: number) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_FIRMWARE, probeIndex),
  setNickname:        (probeIndex: number, nickname: string) => ipcRenderer.invoke(IPC_CHANNELS.SET_NICKNAME, probeIndex, nickname),
} satisfies ProbeAPI);

contextBridge.exposeInMainWorld("downloadAPI", {
  downloadJLink:    () => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_JLINK),
  cancelDownload:   () => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_DOWNLOAD),
  installJLink:     (installerPath: string) => ipcRenderer.invoke(IPC_CHANNELS.INSTALL_JLINK, installerPath),
  cancelInstall:    (keepInstaller: boolean) => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_INSTALL, keepInstaller),
  scanForInstaller: () => ipcRenderer.invoke(IPC_CHANNELS.SCAN_FOR_INSTALLER),
  onProgress:  (callback) => ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_PROGRESS,  (_e, data) => callback(data)),
  onCompleted: (callback) => ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_COMPLETED, (_e, data) => callback(data)),
  onCancelled: (callback) => ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_CANCELLED, () => callback()),
} satisfies DownloadAPI);

// ─── Platform ────────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld("platform", process.platform);

// ─── Global Type Declaration ──────────────────────────────────────────────────

declare global {
  interface Window {
    probeAPI: ProbeAPI;
    downloadAPI: DownloadAPI;
    platform: "win32" | "darwin" | "linux";
  }
}