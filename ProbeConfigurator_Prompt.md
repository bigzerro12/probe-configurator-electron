# ProbeConfigurator — Master Prompt

## Project Overview
A Windows desktop application for managing SEGGER J-Link debug probes.
Built with Electron + React + TypeScript. Communicates with J-Link probes
via the SEGGER J-Link Commander CLI (`JLink.exe`).

---

## Technology Stack
| Layer | Technology |
|---|---|
| Desktop | Electron ^32.x |
| Language | TypeScript strict |
| UI | React 18, TailwindCSS |
| State | Zustand ^5.x |
| Build | electron-vite ^5.0.0 |
| CLI exec | execa ^5.1.1 (CJS) |
| Logging | electron-log ^5.x |
| Package mgr | Yarn |
| Packaging | electron-builder ^25.x + cross-env |

---

## Project Structure
```
probe-configurator/
├── src/
│   ├── main/
│   │   ├── main.ts
│   │   ├── ipc/
│   │   │   ├── probeHandlers.ts
│   │   │   └── downloadHandlers.ts
│   │   ├── services/
│   │   │   └── probeManager.ts
│   │   ├── probes/
│   │   │   ├── ProbeProvider.ts
│   │   │   └── providers/jlink/
│   │   │       ├── JLinkProvider.ts
│   │   │       ├── detectInstallation.ts
│   │   │       ├── scanProbes.ts
│   │   │       ├── updateFirmware.ts
│   │   │       ├── setNickname.ts
│   │   │       └── openConfigurator.ts
│   │   └── utils/
│   │       ├── exec.ts
│   │       └── logger.ts
│   ├── preload/
│   │   └── preload.ts
│   ├── renderer/
│   │   ├── components/
│   │   │   └── ProbeTable.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   └── InstallJLink.tsx
│   │   ├── store/
│   │   │   └── probeStore.ts
│   │   └── App.tsx, main.tsx
│   └── shared/
│       └── types.ts
├── electron.vite.config.ts
├── electron-builder.json
├── package.json
└── tsconfig.json
```

---

## Shared Types (`src/shared/types.ts`)
```typescript
export type DriverType = "SEGGER" | "WinUSB" | "Unknown";
export type ProviderType = "JLink";

export type Probe = {
  id: string;
  serialNumber: string;
  productName: string;
  nickName: string;
  provider: ProviderType;
  connection: string;
  driver: DriverType;
  firmware?: string; // e.g. "Dec 10 2025 15:52:46"
};

export type ProbeInstallationStatus = {
  installed: boolean;
  path?: string;
  version?: string;
};

export const IPC_CHANNELS = {
  DETECT_INSTALLATION: "probe:detectInstallation",
  SCAN_PROBES:         "probe:scanProbes",
  OPEN_CONFIGURATOR:   "probe:openConfigurator",
  DETECT_AND_SCAN:     "probe:detectAndScan",
} as const;
```

---

## IPC Channels
| Channel | Direction | Description |
|---|---|---|
| `probe:detectInstallation` | renderer→main | Detect JLink installation |
| `probe:scanProbes` | renderer→main | List connected probes |
| `probe:detectAndScan` | renderer→main | Combined detect + scan |
| `probe:openConfigurator` | renderer→main | Open JLink Configurator for driver change |
| `probe:updateFirmware` | renderer→main | Update probe firmware via EnableAutoUpdateFW |
| `probe:setNickname` | renderer→main | Set/clear probe nickname via setnickname |
| `download:jlink` | renderer→main | Download JLink installer from SEGGER |
| `download:cancel` | renderer→main | Cancel active download |
| `download:install` | renderer→main | Install JLink (elevated via RunAs) |
| `download:cancelInstall` | renderer→main | Cancel install + cleanup |
| `download:scan` | renderer→main | Check if installer .exe exists |

---

## detectInstallation.ts — 3-step fallback
```
Step 1: Run JLink -NoGUI 1 → found in PATH
        → parse version from stdout via /SEGGER J-Link Commander (V[\d.]+)/i
        → return { installed: true, version }

Step 2: Scan JLINK_SEARCH_DIRS for JLink.exe
        → Found → addToSystemPath (UAC elevated)
        → If UAC denied → update process.env.PATH for current session only
        → Re-run JLink -NoGUI 1 to parse version (PATH now updated)
        → return { installed: true, path, version }

Step 3: Not found → return { installed: false } → show InstallJLink page
```

**Version parsing** — same regex used in both Step 1 and Step 2:
```typescript
result.stdout.match(/SEGGER J-Link Commander (V[\d.]+)/i)
// → "SEGGER J-Link Commander V9.26"
```

**JLINK_SEARCH_DIRS:**
```typescript
const JLINK_SEARCH_DIRS = [
  join("C:\\", "Program Files", "SEGGER"),
  join("C:\\", "Program Files (x86)", "SEGGER"),
  SEGGER_DIR, // AppData/Roaming/SEGGER
];
```

---

## scanProbes.ts — 2-step: list + firmware
**Step 1:** `ShowEmuList\nExit\n` → parse probe list via regex on stdout

**Step 2:** Single JLink session to fetch all firmware:
```
exec DisableAutoUpdateFW
selectprobe\n0
selectprobe\n1
...
exit
```
Split output on `Select emulator index:` → each section has `Firmware:` line.

**FIRMWARE_REGEX:** `/Firmware:.*compiled\s+(.+)/`

---

## updateFirmware.ts
```
exec EnableAutoUpdateFW
selectprobe
<probeIndex>
exit
```
- `"New firmware booted successfully"` → `status: "updated"`
- No update line → `status: "current"`
- Error/timeout → `status: "failed"`
- timeout: 60_000ms

---

## setNickname.ts
```
exec DisableAutoUpdateFW
selectprobe
<probeIndex>
setnickname <nickname>   ← empty string clears nickname
exit
```
- `"was set"` in output → `success: true`
- `"was unset"` in output → `success: true` (nickname cleared)
- `"is not a valid nickname"` → `success: false` with specific error message
- Frontend validates: no non-ASCII characters, no double quotes `"`

---

## downloadHandlers.ts — Install flow
```
1. Kill leftover installer processes (taskkill)
2. Record installStartTime = Date.now()
3. Spawn: powershell Start-Process -Verb RunAs → triggers UAC
4. Poll for JLink_x64.dll with mtime >= installStartTime
5. On cancel: taskkill JLink.exe + rmdir JLink_V* folders
6. On success: addToSystemPathElevated
```

**Cancel behavior:**
| Phase | keepInstaller | Cleanup |
|---|---|---|
| downloading | false | delete .exe |
| installing (from download) | true | delete JLink_V*, keep .exe |
| installing (install-only) | true | delete JLink_V*, keep .exe |

---

## preload.ts — API Bridge
```typescript
interface ProbeAPI {
  detectInstallation(): Promise<ProbeInstallationStatus>;
  scanProbes(): Promise<Probe[]>;
  detectAndScan(): Promise<{ status: ProbeInstallationStatus; probes: Probe[] }>;
  openConfigurator(probeId: string): Promise<void>;
  updateFirmware(probeIndex: number): Promise<{
    status: "updated" | "current" | "failed";
    firmware?: string; error?: string;
  }>;
  setNickname(probeIndex: number, nickname: string): Promise<{
    success: boolean; error?: string;
  }>;
}

interface DownloadAPI {
  downloadJLink(): Promise<{ success: boolean; path: string; cancelled?: boolean }>;
  cancelDownload(): Promise<{ success: boolean; error?: string }>;
  installJLink(installerPath: string): Promise<{ success: boolean; cancelled?: boolean; message: string; path?: string }>;
  cancelInstall(keepInstaller: boolean): Promise<{ success: boolean }>;
  scanForInstaller(): Promise<{ found: boolean; path: string; message: string }>;
  onProgress(callback: (data: { percent: number; transferred: number; total: number }) => void): void;
  onCompleted(callback: (data: { path: string }) => void): void;
  onCancelled(callback: () => void): void;
}
```

---

## probeStore.ts — Zustand State
```typescript
{
  // Data
  probes: Probe[];
  isLoading: boolean;
  isInstalled: boolean | null;   // null = not yet checked
  installPath: string | undefined;
  installVersion: string;        // e.g. "SEGGER J-Link Commander V9.24"
  selectedProbeId: string | null;
  error: string | null;

  // Firmware update
  firmwareUpdateStatus: "idle" | "updating" | "updated" | "current" | "failed";
  firmwareUpdateMessage: string;

  // Nickname
  nicknameStatus: "idle" | "setting" | "success" | "failed";
  nicknameMessage: string;

  // Actions
  scanProbes(): Promise<void>;       // also resets all status + deselects
  selectProbe(id: string): void;     // toggle; resets firmware + nickname status
  updateFirmware(probeId: string): Promise<void>;
  setNickname(probeId: string, nickname: string): Promise<void>;
  openConfigurator(probeId: string): Promise<void>;
}
```

---

## Dashboard.tsx — UI Sections
1. **Header** — app title + description + platform badge
2. **J-LINK SOFTWARE** — detected version + status indicator
3. **CONNECTED J-LINK PROBES** — probe table (Serial, Product, Nickname, Connection, USB Driver, Probe Firmware) + Refresh list button
4. **DRIVER CONFIGURATION** — 3 action buttons:
   - **Switch to WinUSB** (disabled during firmware update)
   - **⬆️ Update Probe Firmware** (disabled during nickname setting)
   - **✏️ Set Nickname** (opens dialog)
   - Status panels for firmware update result + nickname result
5. **Set Nickname Dialog** — input with validation:
   - Non-ASCII → red warning + OK disabled
   - Double quote → red warning + OK disabled
   - Empty → OK enabled (clears nickname)

**Button disable rules:**
| Button | Disabled when |
|---|---|
| Refresh list | isLoading OR firmwareUpdateStatus === "updating" |
| Switch to WinUSB | no probe selected OR isLoading OR updating firmware |
| Update Probe Firmware | no probe selected OR isLoading |
| Set Nickname | no probe selected OR updating firmware OR setting nickname |

---

## InstallJLink.tsx — Phase state machine
```
'checking'     → mount: scan for existing installer
'no-installer' → button: "⬇️ Download & Install J-Link Software"
'has-installer'→ button: "🛠️ Install J-Link Software"
'downloading'  → progress bar + "✕ Cancel"
'installing'   → status panel + "✕ Cancel"
'error'        → error panel + "🔄 Try Again"
```

---

## electron-builder.json
```json
{
  "win": {
    "target": ["nsis", "portable"],
    "sign": false,
    "signingHashAlgorithms": null
  },
  "publish": null
}
```

**Build command:** `yarn build && cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder`

**Output:**
- `dist/ProbeConfigurator Setup 1.0.0.exe` — NSIS installer (recommended)
- `dist/ProbeConfigurator 1.0.0.exe` — portable

---

## Known Behaviors & Edge Cases
- SEGGER installer V9.24a needs admin rights to copy to Temp → must use `Start-Process -Verb RunAs`
- SEGGER installer uses launcher pattern → spawned process exits immediately, real install runs in background
- Poll `JLink_x64.dll` mtime >= installStartTime to confirm install complete (not folder existence)
- `process.env.PATH` must be manually updated each session if system PATH UAC was denied
- Nickname only supports ASCII, no double quotes; `setnickname` with no arg clears nickname → output `"was unset"`
- `firmwareUpdateStatus` and `nicknameStatus` reset on `selectProbe` toggle and on `scanProbes`
