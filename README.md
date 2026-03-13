# ProbeConfigurator

A Windows desktop application for managing SEGGER J-Link debug probes. Built with Electron, React, and TypeScript.

## Features

- **J-Link Detection** — Automatically detects SEGGER J-Link software installation and adds it to PATH
- **Download & Install** — Downloads and installs J-Link software directly from SEGGER if not found
- **Probe Scanning** — Lists all connected J-Link probes with serial numbers, product names, nicknames, and firmware versions
- **Firmware Update** — Updates probe firmware via J-Link CLI with one click
- **Set Nickname** — Set or clear a custom nickname for any connected probe
- **Driver Configuration** — Opens J-Link Configurator to switch USB driver to WinUSB for libusb-based tools
- **Modern UI** — Clean, responsive interface built with React and TailwindCSS
- **Extensible Architecture** — Easy to add support for other probe types (ST-Link, CMSIS-DAP, etc.)

## Prerequisites

- **Node.js** LTS (>=20.19.0)
- **Yarn** package manager (`npm install -g yarn`)
- **Windows 10/11** (x64)
- **SEGGER J-Link Software** — installed automatically by the app if not found

## Installation

```bash
git clone https://github.com/your-org/probe-configurator
cd probe-configurator
yarn install
```

## Development

```bash
yarn dev
```

Starts the Electron app with Vite dev server and hot-reload.

## Build

```bash
yarn build
```

Compiles TypeScript and bundles the app into `out/`. Use this to verify the build without packaging.

## Package

```bash
yarn dist
```

Creates distributable installers in `dist/`:
- `ProbeConfigurator Setup 1.0.0.exe` — NSIS installer with install/uninstall wizard *(recommended)*
- `ProbeConfigurator 1.0.0.exe` — Portable version, no installation required

> **Note:** Code signing is disabled. Windows SmartScreen may show a warning on first run — click "More info" → "Run anyway".

## Usage

### First Run (J-Link not installed)

1. Launch the app — it will detect that J-Link software is missing
2. Click **⬇️ Download & Install J-Link Software** to download from SEGGER automatically
3. Or click **🛠️ Install J-Link Software** if you already have the installer
4. Accept the UAC prompt to allow installation
5. The app navigates to the Dashboard automatically after install

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

- Enter any ASCII nickname (max 32 characters)
- Leave the field **empty** and click OK to **clear** the nickname
- Non-ASCII characters (e.g. Vietnamese, Chinese) are **not allowed**
- Double quotes `"` are not allowed
- After setting, **re-plug the probe** and click **Refresh list** to apply

## Project Structure

```
src/
├── main/                          # Electron main process
│   ├── ipc/
│   │   ├── probeHandlers.ts       # IPC handlers for probe operations
│   │   └── downloadHandlers.ts    # IPC handlers for download/install
│   ├── services/
│   │   └── probeManager.ts        # Orchestrates probe providers
│   ├── probes/
│   │   ├── ProbeProvider.ts       # Abstract provider interface
│   │   └── providers/jlink/
│   │       ├── JLinkProvider.ts
│   │       ├── detectInstallation.ts
│   │       ├── scanProbes.ts
│   │       ├── updateFirmware.ts
│   │       ├── setNickname.ts
│   │       └── openConfigurator.ts
│   └── utils/
│       ├── exec.ts                # CLI execution wrapper
│       └── logger.ts
├── preload/
│   └── preload.ts                 # Context bridge (ProbeAPI + DownloadAPI)
├── renderer/                      # React frontend
│   ├── components/
│   │   └── ProbeTable.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   └── InstallJLink.tsx
│   └── store/
│       └── probeStore.ts          # Zustand global state
└── shared/
    └── types.ts                   # Shared types between main and renderer
```

## Architecture

The app follows a clean provider pattern for extensibility:

```
renderer (React)
    ↕ contextBridge (preload.ts)
main process
    └── probeManager.ts
            └── JLinkProvider.ts
                    ├── detectInstallation.ts
                    ├── scanProbes.ts
                    ├── updateFirmware.ts
                    ├── setNickname.ts
                    └── openConfigurator.ts
```

To add support for a new probe type (e.g. ST-Link), implement `ProbeProvider` interface and register it in `probeManager.ts`.

## Troubleshooting

**"J-Link not found" after install**
The app may need to be restarted once after install for PATH changes to take effect. If UAC was denied during install, PATH is updated for the current session only — restart the app to re-detect.

**"Could not copy files to Temp folder"**
The J-Link installer requires administrator privileges. Accept the UAC prompt when it appears.

**Probes not detected**
- Ensure the probe is connected via USB
- Click **Refresh list**
- Check that J-Link software is detected (green indicator at top)

**SmartScreen warning on installer**
The installer is not code-signed. Click "More info" → "Run anyway" to proceed.

## License

MIT
