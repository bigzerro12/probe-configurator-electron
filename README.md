# ProbeConfigurator

A cross-platform desktop application for managing SEGGER J-Link debug probes. Built with Electron, React, and TypeScript.

> **Platform status:** Windows fully tested. macOS and Linux CI builds pass and release artifacts are available — not yet verified on real hardware.

## Features

- **J-Link Detection** — Automatically detects SEGGER J-Link installation and adds it to PATH
- **Download & Install** — Downloads and installs J-Link directly from SEGGER if not found (Windows/macOS/Linux)
- **Probe Scanning** — Lists all connected J-Link probes with serial numbers, product names, nicknames, and firmware versions
- **Firmware Update** — Updates probe firmware via J-Link CLI with one click
- **Set Nickname** — Set or clear a custom nickname for any connected probe
- **Driver Configuration** — Opens J-Link Configurator to switch USB driver (useful for libusb-based tools)
- **Cross-Platform** — Windows, macOS, Linux (Windows fully tested; Mac/Linux builds available)
- **Extensible Architecture** — Easy to add support for other probe types (ST-Link, CMSIS-DAP, etc.)

## Download

Pre-built installers are available on the [Releases](../../releases) page:

| Platform | File | Notes |
|---|---|---|
| Windows | `ProbeConfigurator Setup x.x.x.exe` | NSIS installer (recommended) |
| Windows | `ProbeConfigurator x.x.x.exe` | Portable, no install needed |
| macOS (Intel) | `ProbeConfigurator-x.x.x.dmg` | |
| macOS (Apple Silicon) | `ProbeConfigurator-x.x.x-arm64.dmg` | |
| Linux | `ProbeConfigurator-x.x.x.AppImage` | Universal |
| Linux | `probe-configurator_x.x.x_amd64.deb` | Debian/Ubuntu |

> **Note:** Installers are not code-signed. Windows SmartScreen may show a warning — click "More info" → "Run anyway". macOS may require right-click → Open on first launch.

## Prerequisites (Development)

- **Node.js** LTS (≥ 20.19.0)
- **Yarn** package manager (`npm install -g yarn`)
- **SEGGER J-Link Software** — installed automatically by the app if not found

## Getting Started

```bash
git clone https://github.com/bigzerro12/probe-configurator-electron
cd probe-configurator-electron
yarn install
yarn dev
```

## Scripts

| Command | Description |
|---|---|
| `yarn dev` | Start app with Vite dev server + hot-reload |
| `yarn build` | Compile TypeScript + bundle into `out/` |
| `yarn dist:win` | Package for Windows → `dist/*.exe` |
| `yarn dist:mac` | Package for macOS → `dist/*.dmg` + `dist/*.zip` |
| `yarn dist:linux` | Package for Linux → `dist/*.AppImage` + `dist/*.deb` |

## Usage

### First Run (J-Link not installed)

1. Launch the app — it detects that J-Link software is missing
2. Click **⬇️ Download & Install J-Link Software** to download from SEGGER automatically
3. Accept the privilege prompt (UAC on Windows, admin password on macOS, pkexec on Linux)
4. The app navigates to the Dashboard automatically after install

### Managing Probes

1. Connect one or more J-Link probes via USB
2. The app scans and lists all detected probes automatically
3. Click a probe row to select it
4. Use the action buttons:

| Button | Description |
|---|---|
| **Refresh list** | Re-scan connected probes |
| **Switch to WinUSB** | Open J-Link Configurator to change USB driver |
| **⬆️ Update Probe Firmware** | Update selected probe to latest firmware |
| **✏️ Set Nickname** | Set or clear nickname for selected probe |

### Setting a Nickname

- Enter any ASCII nickname
- Leave the field **empty** and click OK to **clear** the nickname
- Non-ASCII characters (e.g. Vietnamese, Chinese) are **not allowed** by J-Link
- Double quotes `"` are not allowed
- After setting, **re-plug the probe** and click **Refresh list** to apply

## Project Structure

```
src/
├── main/                          # Electron main process
│   ├── ipc/
│   │   ├── probeHandlers.ts       # IPC handlers for probe operations
│   │   └── downloadHandlers.ts    # IPC handlers for download/install (cross-platform)
│   ├── services/
│   │   └── probeManager.ts        # Orchestrates probe providers
│   ├── probes/
│   │   ├── ProbeProvider.ts       # Abstract provider interface
│   │   └── providers/jlink/
│   │       ├── JLinkProvider.ts   # Caches resolved jlinkBin path
│   │       ├── detectInstallation.ts
│   │       ├── scanProbes.ts
│   │       ├── updateFirmware.ts
│   │       ├── setNickname.ts
│   │       └── openConfigurator.ts
│   └── utils/
│       ├── exec.ts                # CLI execution wrapper (execa)
│       ├── logger.ts
│       └── platform/              # Cross-platform strategy
│           ├── index.ts           # PlatformStrategy interface + factory
│           ├── windows.ts
│           ├── macos.ts
│           └── linux.ts
├── preload/
│   └── preload.ts                 # Context bridge (ProbeAPI + DownloadAPI + platform)
├── renderer/                      # React frontend
│   ├── components/
│   │   └── ProbeTable.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   └── InstallJLink.tsx       # Platform-aware install UI
│   └── store/
│       └── probeStore.ts          # Zustand global state
└── shared/
    └── types.ts                   # Shared types + IPC_CHANNELS constants
```

## Architecture

```
renderer (React + Zustand)
    ↕ contextBridge (preload.ts)
main process
    └── probeManager.ts
            └── JLinkProvider.ts  ← caches full jlinkBin path after detect
                    ├── detectInstallation.ts  ← PlatformStrategy for search dirs + PATH
                    ├── scanProbes.ts          ← uses cached jlinkBin
                    ├── updateFirmware.ts      ← uses cached jlinkBin
                    ├── setNickname.ts         ← uses cached jlinkBin
                    └── openConfigurator.ts    ← resolves JLinkConfig sibling
```

**To add a new probe type** (e.g. ST-Link): implement `ProbeProvider` interface and register in `probeManager.ts`.

## CI/CD

GitHub Actions (`.github/workflows/build.yml`) builds all 3 platforms in parallel on every tag push:

```bash
git tag v1.x.x
git push origin v1.x.x
# → triggers build-windows + build-macos + build-linux + release
```

> **Note:** The `release` job requires **Settings → Actions → General → Workflow permissions → Read and write permissions** to be enabled in the repository settings.

To trigger a manual build without releasing:
```
GitHub → Actions → Build ProbeConfigurator → Run workflow
```

## Troubleshooting

**J-Link not found after install**
Restart the app. If UAC was denied, PATH is updated for the current session only — restarting re-runs detection with the updated session PATH.

**Probes not detected**
- Ensure the probe is connected via USB
- Click **Refresh list**
- Verify J-Link software is detected (version shown in header)

**SmartScreen warning (Windows)**
The installer is not code-signed. Click "More info" → "Run anyway".

**macOS "app is damaged" / cannot open**
Run: `xattr -cr /Applications/ProbeConfigurator.app`

**Linux AppImage not launching**
Make the file executable: `chmod +x ProbeConfigurator-*.AppImage`

## Pending / Known Limitations

- macOS and Linux install flows not yet verified on real hardware
- Auto-update (`electron-updater`) not implemented
- Code signing not configured — Windows SmartScreen and macOS Gatekeeper will show warnings on first run
- Driver switching (Switch to WinUSB) most useful on Windows; behavior on macOS/Linux not verified
- Linux cancel-install only signals `cancelled=true` — does not forcefully kill the `dpkg` process

## License

MIT