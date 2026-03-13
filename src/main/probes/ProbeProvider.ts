import { Probe, ProbeInstallationStatus, ProviderType } from "../../shared/types";

export interface ProbeProvider {
  /** Human-readable name, e.g. "SEGGER J-Link" */
  name: string;

  /** Provider type key — used to register/lookup in ProbeManager */
  providerType: ProviderType;

  /** Check if the required software is installed on the system */
  detectInstallation(): Promise<ProbeInstallationStatus>;

  /** Scan and return all currently connected probes of this type */
  scanProbes(): Promise<Probe[]>;

  /** Optional: open the vendor GUI configurator to switch USB driver */
  switchToWinUSB?(probeIndex: number): Promise<void>;

  /** Optional: update firmware of a probe by its index in ShowEmuList order */
  updateFirmware?(probeIndex: number): Promise<{
    status: "updated" | "current" | "failed";
    firmware?: string;
    error?: string;
  }>;

  /** Optional: set or clear a probe nickname */
  setNickname?(probeIndex: number, nickname: string): Promise<{
    success: boolean;
    error?: string;
  }>;
}