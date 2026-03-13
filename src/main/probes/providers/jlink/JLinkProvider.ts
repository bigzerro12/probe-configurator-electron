import { ProbeProvider } from "../../../ProbeProvider";
import { Probe, ProbeInstallationStatus, ProviderType } from "@shared/types";
import { detectInstallation } from "./detectInstallation";
import { scanProbes } from "./scanProbes";
import { openConfigurator } from "./openConfigurator";
import { updateProbeFirmware } from "./updateFirmware";
import { setProbeNickname } from "./setNickname";
import { getPlatformStrategy } from "../../../utils/platform/index";
import log from "../../../utils/logger";

const platform = getPlatformStrategy();

/**
 * SEGGER J-Link probe provider implementation.
 * Caches the resolved JLink binary path after detectInstallation so all
 * subsequent calls use the full path — avoids relying on process.env.PATH.
 */
export class JLinkProvider implements ProbeProvider {
  readonly name = "SEGGER J-Link";
  readonly providerType: ProviderType = "JLink";

  /** Resolved path to JLink binary, e.g. "C:\...\JLink.exe" or "JLinkExe" if in PATH */
  private jlinkBin: string = platform.jlinkBin;

  async detectInstallation(): Promise<ProbeInstallationStatus> {
    log.info("[JLinkProvider] Detecting J-Link installation...");
    const status = await detectInstallation();
    if (status.installed && status.path) {
      // Cache full path so scanProbes/updateFirmware/setNickname don't rely on PATH
      this.jlinkBin = status.path;
      log.info(`[JLinkProvider] Cached JLink bin: ${this.jlinkBin}`);
    }
    return status;
  }

  async scanProbes(): Promise<Probe[]> {
    log.info("[JLinkProvider] Scanning for J-Link probes...");
    return scanProbes(this.jlinkBin);
  }

  async switchToWinUSB(probeIndex: number): Promise<void> {
    log.info(`[JLinkProvider] Opening J-Link Configurator for probe index: ${probeIndex}`);
    await openConfigurator(probeIndex, this.jlinkBin);
  }

  async updateFirmware(probeIndex: number) {
    log.info(`[JLinkProvider] Updating firmware for probe index: ${probeIndex}`);
    return updateProbeFirmware(probeIndex, this.jlinkBin);
  }

  async setNickname(probeIndex: number, nickname: string) {
    log.info(`[JLinkProvider] Setting nickname for probe index: ${probeIndex} → "${nickname}"`);
    return setProbeNickname(probeIndex, nickname, this.jlinkBin);
  }
}