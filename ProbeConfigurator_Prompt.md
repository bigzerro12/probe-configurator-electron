# ProbeConfigurator — Master Prompt

## Project Overview
A **cross-platform** desktop application for managing SEGGER J-Link debug probes.
Built with Electron + React + TypeScript. Communicates with J-Link probes
via the SEGGER J-Link Commander CLI (`JLink` / `JLinkExe`).

**Status:** Windows tested and working. macOS and Linux CI builds pass (v1.0.0 released) — not yet verified on real hardware.

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
├── .github/workflows/build.yml    ← CI/CD: build all 3 platforms + release
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
│   │       ├── logger.ts
│   │       └── platform/
│   │           ├── index.ts       ← PlatformStrategy interface + getPlatformStrategy()
│   │           ├── windows.ts
│   │           ├── macos.ts
│   │           └── linux.ts
│   ├── preload/
│   │   └── preload.ts
│   ├── renderer/
│   │   ├── components/ProbeTable.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   └── InstallJLink.tsx
│   │   ├── store/probeStore.ts
│   │   └── App.tsx, main.tsx
│   └── shared/
│       └── types.ts
├── resources/
│   └── icons/
│       ├── win/icon.ico
│       ├── mac/icon.icns
│       └── png/                   ← 16x16 → 1024x1024, used by Linux
├── electron-builder.json
├── package.json
└── tsconfig.json
```

---

## Cross-Platform Strategy (`src/main/utils/platform/`)

```typescript
interface PlatformStrategy {
  jlinkBin: string;           // "JLink" (win) | "JLinkExe" (mac/linux)
  jlinkExecutable: string;    // "JLink.exe" | "JLinkExe"
  pathSeparator: string;      // ";" | ":"
  getSearchDirs(): string[];
  addToSystemPath(dirPath: string): Promise<boolean>;
}
```

| Platform | jlinkBin | Search dirs | Elevation |
|---|---|---|---|
| Windows | `JLink` | `Program Files\SEGGER`, `AppData\Roaming\SEGGER` | PowerShell `Start-Process -Verb RunAs` → HKLM registry |
| macOS | `JLinkExe` | `/Applications/SEGGER`, `~/Applications/SEGGER`, `/usr/local/bin` | `osascript` with admin privileges → `/etc/paths.d/jlink` |
| Linux | `JLinkExe` | `/opt/SEGGER`, `/usr/local/SEGGER`, `~/SEGGER` | `pkexec tee /etc/environment` → fallback `~/.profile` |

**Critical:** `JLinkProvider` caches the **full resolved path** to `JLink[.exe]` after `detectInstallation()` and passes it to all subsequent calls (`scanProbes`, `updateFirmware`, `setNickname`, `openConfigurator`). This bypasses `process.env.PATH` propagation issues with execa on Windows.

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
  firmware?: string;
};

export type ProbeInstallationStatus = {
  installed: boolean;
  path?: string;     // full path to JLink[.exe] — cached by JLinkProvider
  version?: string;
};

export const IPC_CHANNELS = {
  DETECT_INSTALLATION: "probe:detectInstallation",
  SCAN_PROBES:         "probe:scanProbes",
  OPEN_CONFIGURATOR:   "probe:openConfigurator",
  DETECT_AND_SCAN:     "probe:detectAndScan",
  UPDATE_FIRMWARE:     "probe:updateFirmware",
  SET_NICKNAME:        "probe:setNickname",
  DOWNLOAD_JLINK:      "download:jlink",
  CANCEL_DOWNLOAD:     "download:cancel",
  INSTALL_JLINK:       "download:install",
  CANCEL_INSTALL:      "download:cancelInstall",
  SCAN_FOR_INSTALLER:  "download:scan",
  DOWNLOAD_PROGRESS:   "download:progress",
  DOWNLOAD_COMPLETED:  "download:completed",
  DOWNLOAD_CANCELLED:  "download:cancelled",
} as const;
```

---

## JLinkProvider — jlinkBin caching pattern
```typescript
class JLinkProvider {
  private jlinkBin: string = platform.jlinkBin; // default: "JLink" / "JLinkExe"

  async detectInstallation() {
    const status = await detectInstallation();
    if (status.installed && status.path) {
      this.jlinkBin = status.path; // cache full path e.g. "C:\...\JLink.exe"
    }
    return status;
  }

  async scanProbes()                    → scanProbes(this.jlinkBin)
  async updateFirmware(index)           → updateProbeFirmware(index, this.jlinkBin)
  async setNickname(index, name)        → setProbeNickname(index, name, this.jlinkBin)
  async switchToWinUSB(index)           → openConfigurator(index, this.jlinkBin)
}
```

---

## detectInstallation.ts — 3-step fallback
```
Step 1: runCommand(platform.jlinkBin, ["-NoGUI", "1"])
        → found in PATH → parse version → return { installed: true, version }

Step 2: Scan platform.getSearchDirs() for platform.jlinkExecutable
        → platform.addToSystemPath(dir) → UAC/osascript/pkexec prompt
        → readJLinkVersion(fullPath)    ← pass FULL PATH, bypass PATH issues
        → return { installed: true, path: fullPath, version }

Step 3: return { installed: false } → show InstallJLink page
```

**Key:** Step 2 calls `readJLinkVersion(join(jlinkDir, platform.jlinkExecutable))` with the full path — does NOT rely on `process.env.PATH` being propagated to execa child process.

---

## scanProbes.ts — 2-step: list + firmware
```
Step 1: runCommand(jlinkBin, ["-NoGUI", "1"], { input: "ShowEmuList\nExit\n" })
        → parse each line: J-Link[N]: Connection: USB, Serial number: X, ProductName: Y, Nickname: Z

Step 2: Single session to fetch all firmware dates:
        exec DisableAutoUpdateFW
        selectprobe\n0 ... selectprobe\nN
        exit
        → split on "Select emulator index:" → parse "Firmware: ... compiled <date>"
```

---

## updateFirmware.ts
```
runCommand(jlinkBin, ["-NoGUI", "1"], {
  input: "exec EnableAutoUpdateFW\nselectprobe\n<index>\nexit\n",
  timeout: 60_000
})
```
- `"New firmware booted successfully"` → `{ status: "updated", firmware }`
- No update line, has `Firmware:` → `{ status: "current", firmware }`
- Error/timeout → `{ status: "failed", error }`

---

## setNickname.ts
```
runCommand(jlinkBin, ["-NoGUI", "1"], {
  input: "exec DisableAutoUpdateFW\nselectprobe\n<index>\nsetnickname <name>\nexit\n"
})
```
- `"was set"` → `{ success: true }`
- `"was unset"` → `{ success: true }` (nickname cleared)
- `"is not a valid nickname"` → `{ success: false, error: "Invalid nickname..." }`
- **Frontend validation:** non-ASCII → block; double quote `"` → block; empty → allow (clears)

---

## openConfigurator.ts
```
resolveConfiguratorBin(jlinkBin):
  1. join(dirname(jlinkBin), "JLinkConfig[.exe]")  ← sibling of resolved bin
  2. Platform well-known paths
  3. PATH fallback

spawn(bin, [], { detached: true, stdio: "ignore" })  ← GUI, don't wait for close
child.unref()
```

---

## downloadHandlers.ts — Cross-platform install

```typescript
getDownloadConfig() → { url, filename, savePath } per platform:
  win32:  JLink_Windows_x86_64.exe → AppData/Roaming/SEGGER/
  darwin: JLink_MacOSX_universal.pkg → ~/Downloads/
  linux:  JLink_Linux_x86_64.deb → ~/Downloads/
```

Install runners:
- **Windows:** `powershell Start-Process -Verb RunAs /S` → poll `JLink_x64.dll` mtime
- **macOS:** `osascript "do shell script installer -pkg ... with administrator privileges"`
- **Linux:** `pkexec dpkg -i <deb>`

Cancel behavior:
| Phase | keepInstaller | Cleanup |
|---|---|---|
| downloading | false | delete installer file |
| installing (Windows) | true | taskkill + rmdir JLink_V* folders |
| installing (Mac/Linux) | true | signal cancelled only |

---

## preload.ts — API Bridge
```typescript
contextBridge.exposeInMainWorld("probeAPI", { ... })    // probe operations
contextBridge.exposeInMainWorld("downloadAPI", { ... }) // download/install
contextBridge.exposeInMainWorld("platform", process.platform) // "win32"|"darwin"|"linux"

interface Window {
  probeAPI: ProbeAPI;
  downloadAPI: DownloadAPI;
  platform: "win32" | "darwin" | "linux";
}
```

---

## probeStore.ts — Zustand State
```typescript
{
  probes: Probe[];
  isLoading: boolean;
  isInstalled: boolean | null;
  installPath: string | undefined;
  installVersion: string;
  selectedProbeId: string | null;
  error: string | null;
  firmwareUpdateStatus: "idle" | "updating" | "updated" | "current" | "failed";
  firmwareUpdateMessage: string;
  nicknameStatus: "idle" | "setting" | "success" | "failed";
  nicknameMessage: string;
}
```

`scanProbes()` — resets all status fields + deselects probe before scanning.
`selectProbe(id)` — toggles selection + resets firmware/nickname status.

---

## InstallJLink.tsx — Phase state machine
```
'checking'      → mount: scanForInstaller()
'no-installer'  → button: platform copy.downloadBtnLabel
'has-installer' → button: platform copy.installBtnLabel
'downloading'   → progress bar + Cancel
'installing'    → status panel (copy.elevationNote + copy.installingNote) + Cancel
'error'         → error panel + manual download link + Try Again
```

Platform copy (`PLATFORM_COPY`) provides per-OS strings for button labels, elevation note, and installing note. Reads `window.platform` exposed by preload.

---

## electron-builder.json
```json
{
  "win":   { "target": ["nsis", "portable"], "icon": "resources/icons/win/icon.ico" },
  "mac":   { "target": [dmg x64+arm64, zip x64+arm64], "icon": "resources/icons/mac/icon.icns" },
  "linux": { "target": ["AppImage", "deb"], "icon": "resources/icons/png" },
  "dmg":   { "background": null, "contents": [file, /Applications link] }
}
```

Icons generated by `electron-icon-builder` from `resources/icon-source.png`:
- `resources/icons/win/icon.ico`
- `resources/icons/mac/icon.icns`
- `resources/icons/png/16x16.png` ... `1024x1024.png`

---

## CI/CD (`.github/workflows/build.yml`)
- Trigger: `push` to `v*` tag OR `workflow_dispatch`
- Jobs: `build-windows`, `build-macos`, `build-linux` (parallel) → `release` (on tag only)
- `release` job requires `permissions: contents: write` in job definition
- Repo must have **Settings → Actions → General → Workflow permissions → Read and write** enabled
- Each build job uses `yarn dist:<platform>` — NOT raw `electron-builder` or `cross-env` directly (PATH issues in CI)
- `dist:mac` uses `cross-env CSC_IDENTITY_AUTO_DISCOVERY=false` to skip code signing
- DMG build requires `"background": null` in `electron-builder.json` — missing `background.tiff` causes build failure
- `.deb` build requires `author.email` in `package.json`

```bash
# Release flow:
git tag v1.x.x && git push origin v1.x.x

# Manual build test (no release):
# GitHub → Actions → Build ProbeConfigurator → Run workflow
```

---

## Known Behaviors & Edge Cases
- execa on Windows does NOT pick up runtime `process.env.PATH` changes → always pass full bin path
- SEGGER installer uses launcher pattern (exits immediately, real install runs in background) → poll `JLink_x64.dll` mtime
- `process.env.PATH` key on Windows may be `"Path"` not `"PATH"` → use `Object.keys(process.env).find(k => k.toLowerCase() === "path")`
- Nickname only supports ASCII, no double quotes; `setnickname` with trailing space clears → output `"was unset"`
- `firmwareUpdateStatus` and `nicknameStatus` reset on `selectProbe` toggle and on `scanProbes`
- DMG build requires `"background": null` in electron-builder config — missing background.tiff causes build failure
- `.deb` build requires `author.email` in `package.json` — electron-builder uses it as maintainer field
- CI must use `yarn dist:<platform>` scripts — calling `cross-env` or `electron-builder` directly in CI shell fails because they are in `node_modules/.bin/` not global PATH
- GitHub Actions `release` job gets 403 if repo Workflow permissions are Read-only — must enable Read and write in Settings

---

## Pending / TODO
- Verify macOS and Linux flows on real hardware
- Implement auto-update (electron-updater)
- Code signing (Windows SmartScreen + macOS Gatekeeper)
- `downloadHandlers.ts` Linux cancel: only signals `cancelled=true`, does not kill `dpkg` process
