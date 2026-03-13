import { create } from "zustand";
import type { Probe, ProbeInstallationStatus } from "@shared/types";

// ─── Store Types ──────────────────────────────────────────────────────────────

type ProbeStore = {
  // State
  probes: Probe[];
  isLoading: boolean;
  isInstalled: boolean | null; // null = not yet checked
  installPath: string | undefined;
  installVersion: string;
  selectedProbeId: string | null; // single-selection
  error: string | null;

  // Actions
  /** On startup: detect installation + scan probes in one IPC call */
  checkInstallation: () => Promise<void>;
  /** Manual refresh: re-scan probes (installation already confirmed) */
  scanProbes: () => Promise<void>;
  /** Toggle selection — select if not selected, deselect if already selected */
  selectProbe: (id: string) => void;
  /** Open J-Link Configurator for the given probe */
  openConfigurator: (probeIndex: number) => Promise<void>;
  updateFirmware: (probeId: string) => Promise<void>;
  setNickname: (probeId: string, nickname: string) => Promise<void>;
  firmwareUpdateStatus: "idle" | "updating" | "updated" | "current" | "failed";
  nicknameStatus: "idle" | "setting" | "success" | "failed";
  nicknameMessage: string;
  firmwareUpdateMessage: string;
};

// ─── Store Implementation ─────────────────────────────────────────────────────

export const useProbeStore = create<ProbeStore>((set, get) => ({
  probes: [],
  isLoading: false,
  isInstalled: null,
  installPath: undefined,
  installVersion: "",
  selectedProbeId: null,
  error: null,
  firmwareUpdateStatus: "idle",
  nicknameStatus: "idle",
  nicknameMessage: "",
  firmwareUpdateMessage: "",

  checkInstallation: async () => {
    set({ isLoading: true, error: null });
    try {
      // Single IPC call — detect + scan in one round trip
      const { status, probes } = await window.probeAPI.detectAndScan();
      set({
        isInstalled: status.installed,
        installPath: status.path,
        installVersion: status.version ?? "",
        probes,
        isLoading: false,
      });
    } catch (err) {
      set({
        isInstalled: false,
        error: err instanceof Error ? err.message : "Detection failed",
        isLoading: false,
      });
    }
  },

  scanProbes: async () => {
    set({
      isLoading: true,
      error: null,
      selectedProbeId: null,
      firmwareUpdateStatus: "idle",
      firmwareUpdateMessage: "",
      nicknameStatus: "idle",
      nicknameMessage: "",
    });
    try {
      const probes = await window.probeAPI.scanProbes();
      set({ probes, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Scan failed",
        isLoading: false,
      });
    }
  },

  setNickname: async (probeId: string, nickname: string) => {
    const { probes } = get();
    const probeIndex = probes.findIndex((p) => p.id === probeId);
    if (probeIndex === -1) return;

    set({ nicknameStatus: "setting", nicknameMessage: "" });

    const result = await window.probeAPI.setNickname(probeIndex, nickname);
    if (result.success) {
      set({
        nicknameStatus: "success",
        nicknameMessage: nickname
          ? `Nickname "${nickname}" set successfully. Please re-plug the probe and click Refresh list to apply.`
          : `Nickname cleared. Please re-plug the probe and click Refresh list to apply.`,
      });
    } else {
      set({
        nicknameStatus: "failed",
        nicknameMessage: result.error ?? "Failed to set nickname",
      });
    }
  },

  selectProbe: (id: string) => {
    set((state) => ({
      selectedProbeId: state.selectedProbeId === id ? null : id,
      firmwareUpdateStatus: "idle",
      firmwareUpdateMessage: "",
      nicknameStatus: "idle",
      nicknameMessage: "",
    }));
  },

  updateFirmware: async (probeId: string) => {
    const { probes } = get();
    const probeIndex = probes.findIndex(p => p.id === probeId);
    if (probeIndex === -1) return;

    set({ firmwareUpdateStatus: "updating", firmwareUpdateMessage: "Updating firmware..." });
    try {
      const result = await window.probeAPI.updateFirmware(probeIndex);

      if (result.status === "failed") {
        set({ firmwareUpdateStatus: "failed", firmwareUpdateMessage: result.error ?? "Update failed" });
        return;
      }

      // Update firmware field in probe list
      if (result.firmware) {
        const updatedProbes = probes.map((p, i) =>
          i === probeIndex ? { ...p, firmware: result.firmware } : p
        );
        set({ probes: updatedProbes });
      }

      set({
        firmwareUpdateStatus: result.status,
        firmwareUpdateMessage: result.status === "updated"
          ? `Firmware updated: ${result.firmware}`
          : `Firmware already up to date: ${result.firmware}`,
      });
    } catch (err) {
      set({
        firmwareUpdateStatus: "failed",
        firmwareUpdateMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },

  openConfigurator: async (probeIndex: number) => {
    try {
      await window.probeAPI.openConfigurator(probeIndex);
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to open configurator",
      });
    }
  },
}));