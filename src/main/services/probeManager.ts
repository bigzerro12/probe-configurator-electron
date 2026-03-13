import { Probe, ProbeInstallationStatus, ProviderType } from "@shared/types";
import { ProbeProvider } from "../probes/ProbeProvider";
import { JLinkProvider } from "../probes/providers/jlink/JLinkProvider";
import log from "../utils/logger";

export class ProbeManager {
  private providers: Map<ProviderType, ProbeProvider> = new Map();

  constructor() {
    this.registerProvider(new JLinkProvider());
    log.info("[ProbeManager] Initialized with J-Link provider");
  }

  private registerProvider(provider: ProbeProvider): void {
    this.providers.set(provider.providerType, provider);
  }

  getProviders(): ProbeProvider[] {
    return Array.from(this.providers.values());
  }

  async detectInstallation(): Promise<ProbeInstallationStatus> {
    log.info("[ProbeManager] Detecting probe software installations...");
    for (const provider of this.providers.values()) {
      try {
        const status = await provider.detectInstallation();
        if (status.installed) {
          log.info(`[ProbeManager] ${provider.name} detected: ${status.version || "unknown version"}`);
          return status;
        }
      } catch (error) {
        log.warn(`[ProbeManager] Failed to detect ${provider.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    log.info("[ProbeManager] No probe software detected");
    return { installed: false };
  }

  async detectAndScan(): Promise<{ status: ProbeInstallationStatus; probes: Probe[] }> {
    log.info("[ProbeManager] Detecting and scanning probes in single operation...");
    for (const provider of this.providers.values()) {
      try {
        const status = await provider.detectInstallation();
        if (status.installed) {
          const probes = await provider.scanProbes();
          log.info(`[ProbeManager] ${provider.name} detected with ${probes.length} probes`);
          return { status, probes };
        }
      } catch (error) {
        log.warn(`[ProbeManager] Failed to detect/scan ${provider.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    log.info("[ProbeManager] No probe software detected");
    return { status: { installed: false }, probes: [] };
  }

  async scanProbes(): Promise<Probe[]> {
    log.info("[ProbeManager] Scanning for probes...");
    const allProbes: Probe[] = [];
    for (const provider of this.providers.values()) {
      try {
        const probes = await provider.scanProbes();
        allProbes.push(...probes);
        log.info(`[ProbeManager] Found ${probes.length} probes from ${provider.name}`);
      } catch (error) {
        log.warn(`[ProbeManager] Failed to scan ${provider.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    log.info(`[ProbeManager] Total probes found: ${allProbes.length}`);
    return allProbes;
  }

  async openConfigurator(probeIndex: number): Promise<void> {
    log.info(`[ProbeManager] Opening configurator for probe index: ${probeIndex}`);
    const provider = this.providers.get("JLink");
    if (!provider?.switchToWinUSB) throw new Error(`Provider does not support configurator`);
    await provider.switchToWinUSB(probeIndex);
  }

  async updateFirmware(probeIndex: number): Promise<{
    status: "updated" | "current" | "failed";
    firmware?: string;
    error?: string;
  }> {
    log.info(`[ProbeManager] Updating firmware for probe index: ${probeIndex}`);
    // Always use JLink provider for firmware update
    const provider = this.providers.get("JLink");
    if (!provider?.updateFirmware) {
      return { status: "failed", error: "Provider does not support firmware update" };
    }
    return provider.updateFirmware(probeIndex);
  }

  async setNickname(probeIndex: number, nickname: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    log.info(`[ProbeManager] Setting nickname for probe index: ${probeIndex} → "${nickname}"`);
    const provider = this.providers.get("JLink");
    if (!provider?.setNickname) {
      return { success: false, error: "Provider does not support setNickname" };
    }
    return provider.setNickname(probeIndex, nickname);
  }

}