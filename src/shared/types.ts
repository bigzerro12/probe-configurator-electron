export type DriverType = "SEGGER" | "WinUSB" | "Unknown";
export type ProviderType = "JLink"; // extend later: | "STLink" | "CMSIS-DAP"

export type Probe = {
  id: string;               // Use serialNumber as id
  serialNumber: string;
  productName: string;
  nickName: string;
  provider: ProviderType;
  connection: string;       // e.g. "USB"
  driver: DriverType;       // Always "Unknown" from ShowEmuList — USBDriver not reported by CLI
  firmware?: string;        // e.g. "Feb  2 2021 16:57:21" — fetched via selectprobe
};

export type ProbeInstallationStatus = {
  installed: boolean;
  path?: string;            // resolved install path if found
  version?: string;         // e.g. "SEGGER J-Link Commander V9.24" — parsed from JLink.exe -version
};

// IPC channel names — single source of truth
export const IPC_CHANNELS = {
  // Probe
  DETECT_INSTALLATION: "probe:detectInstallation",
  SCAN_PROBES:         "probe:scanProbes",
  OPEN_CONFIGURATOR:   "probe:openConfigurator",
  DETECT_AND_SCAN:     "probe:detectAndScan",
  UPDATE_FIRMWARE:     "probe:updateFirmware",
  SET_NICKNAME:        "probe:setNickname",
  // Download / Install
  DOWNLOAD_JLINK:      "download:jlink",
  CANCEL_DOWNLOAD:     "download:cancel",
  INSTALL_JLINK:       "download:install",
  CANCEL_INSTALL:      "download:cancelInstall",
  SCAN_FOR_INSTALLER:  "download:scan",
  // Download events (renderer-bound)
  DOWNLOAD_PROGRESS:   "download:progress",
  DOWNLOAD_COMPLETED:  "download:completed",
  DOWNLOAD_CANCELLED:  "download:cancelled",
} as const;