import React, { useState, useEffect } from "react";
import { useProbeStore } from "../store/probeStore";

type Phase =
  | 'checking'      // scanning for installer on mount
  | 'no-installer'  // need to download + install
  | 'has-installer' // installer file found, can install directly
  | 'downloading'   // download in progress
  | 'installing'    // install in progress
  | 'error';        // unrecoverable error

// Detect platform from Electron's process.platform exposed via preload,
// falling back to navigator.platform for safety.
const currentPlatform: 'win32' | 'darwin' | 'linux' | 'unknown' =
  (window as any).platform ?? 'unknown';

// ── Platform-specific copy ────────────────────────────────────────────────────

const PLATFORM_COPY = {
  win32: {
    installerLabel: 'J-Link Windows Installer (.exe)',
    elevationNote: 'A UAC prompt will appear — click Yes to allow installation.',
    installingNote: 'Installing silently in the background...',
    downloadBtnLabel: '⬇️ Download & Install J-Link Software',
    installBtnLabel: '🛠️ Install J-Link Software',
  },
  darwin: {
    installerLabel: 'J-Link macOS Package (.pkg)',
    elevationNote: 'An administrator password prompt will appear.',
    installingNote: 'Running installer — this may take a minute...',
    downloadBtnLabel: '⬇️ Download & Install J-Link Software',
    installBtnLabel: '🛠️ Install J-Link Package',
  },
  linux: {
    installerLabel: 'J-Link Linux Package (.deb)',
    elevationNote: 'A privilege prompt (pkexec) will appear.',
    installingNote: 'Running dpkg installer — this may take a minute...',
    downloadBtnLabel: '⬇️ Download & Install J-Link Software',
    installBtnLabel: '🛠️ Install J-Link Package',
  },
  unknown: {
    installerLabel: 'J-Link Installer',
    elevationNote: 'Administrator privileges may be required.',
    installingNote: 'Installing...',
    downloadBtnLabel: '⬇️ Download J-Link Installer',
    installBtnLabel: '🛠️ Install J-Link',
  },
};

const copy = PLATFORM_COPY[currentPlatform] ?? PLATFORM_COPY.unknown;

// ─────────────────────────────────────────────────────────────────────────────

export default function InstallJLink() {
  const { checkInstallation, isLoading } = useProbeStore();

  const [phase, setPhase]                       = useState<Phase>('checking');
  const [installContext, setInstallContext]      = useState<'from-download' | 'install-only'>('install-only');
  const [installerPath, setInstallerPath]        = useState<string>('');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [progressLabel, setProgressLabel]        = useState<string>('');
  const [statusMessage, setStatusMessage]        = useState<string>('');
  const [errorMessage, setErrorMessage]          = useState<string>('');

  // On mount: scan for an already-downloaded installer
  useEffect(() => {
    (async () => {
      try {
        const result = await window.downloadAPI.scanForInstaller();
        if (result.found) {
          setInstallerPath(result.path);
          setPhase('has-installer');
        } else {
          setPhase('no-installer');
        }
      } catch {
        setPhase('no-installer');
      }
    })();
  }, []);

  // ── Download & Install ────────────────────────────────────────────────────

  const handleDownloadAndInstall = async () => {
    try {
      setPhase('downloading');
      setDownloadProgress(0);
      setProgressLabel('Starting download...');

      window.downloadAPI.onProgress((data) => {
        setDownloadProgress(data.percent);
        setProgressLabel(
          `${data.percent}%  —  ${Math.round(data.transferred / 1024 / 1024)} MB / ${Math.round(data.total / 1024 / 1024)} MB`
        );
      });

      window.downloadAPI.onCancelled(() => {
        setPhase('no-installer');
        setProgressLabel('');
      });

      const dlResult = await window.downloadAPI.downloadJLink();

      if (dlResult.cancelled) {
        setPhase('no-installer');
        return;
      }

      // Download complete → proceed to install
      setInstallerPath(dlResult.path);
      setInstallContext('from-download');
      setPhase('installing');
      setStatusMessage(copy.elevationNote);

      const instResult = await window.downloadAPI.installJLink(dlResult.path);

      if (instResult.success) {
        setTimeout(() => checkInstallation(), 1500);
      } else if (instResult.cancelled) {
        setPhase('has-installer');
        setStatusMessage('');
      } else {
        setErrorMessage(instResult.message);
        setPhase('error');
      }

    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    }
  };

  // ── Install only (installer already downloaded) ───────────────────────────

  const handleInstallOnly = async () => {
    if (!installerPath) return;
    try {
      setInstallContext('install-only');
      setPhase('installing');
      setStatusMessage(copy.elevationNote);

      const result = await window.downloadAPI.installJLink(installerPath);

      if (result.success) {
        setTimeout(() => checkInstallation(), 1500);
      } else if (result.cancelled) {
        setPhase('has-installer');
        setStatusMessage('');
      } else {
        setErrorMessage(result.message);
        setPhase('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    }
  };

  // ── Cancel ────────────────────────────────────────────────────────────────

  const handleCancel = async () => {
    if (phase === 'downloading') {
      await window.downloadAPI.cancelDownload();
      // onCancelled listener resets phase
    } else if (phase === 'installing') {
      await window.downloadAPI.cancelInstall(true);
      setPhase('has-installer');
      setStatusMessage('');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isBusy = phase === 'downloading' || phase === 'installing';

  return (
    <div className="container">
      <div className="not-installed-message">
        <div className="message-card">

          <h2>J-Link Software Not Found</h2>
          <p>SEGGER J-Link Software is required to use this application.</p>

          {/* Platform badge */}
          {currentPlatform !== 'unknown' && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#6c757d' }}>
              {currentPlatform === 'win32' && '🪟 Windows — will download ' + copy.installerLabel}
              {currentPlatform === 'darwin' && '🍎 macOS — will download ' + copy.installerLabel}
              {currentPlatform === 'linux'  && '🐧 Linux — will download ' + copy.installerLabel}
            </div>
          )}

          <div style={{ marginTop: '24px' }}>

            {/* Checking */}
            {phase === 'checking' && (
              <div style={{ color: '#6c757d', fontSize: '14px' }}>
                🔍 Checking for existing installer...
              </div>
            )}

            {/* Download progress */}
            {phase === 'downloading' && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#495057' }}>
                  📥 Downloading J-Link...
                </div>
                <div style={{
                  width: '100%', height: '8px',
                  backgroundColor: '#e9ecef', borderRadius: '4px',
                  overflow: 'hidden', marginBottom: '8px',
                }}>
                  <div style={{
                    width: `${downloadProgress}%`, height: '100%',
                    backgroundColor: '#007bff', borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: '13px', color: '#6c757d' }}>{progressLabel}</div>
              </div>
            )}

            {/* Installing */}
            {phase === 'installing' && (
              <div style={{
                marginBottom: '20px', padding: '14px',
                backgroundColor: '#f8f9fa', borderRadius: '8px',
                border: '1px solid #e9ecef',
              }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#495057' }}>
                  ⚙️ Installing J-Link...
                </div>
                <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '4px' }}>
                  {statusMessage}
                </div>
                <div style={{ fontSize: '12px', color: '#adb5bd' }}>
                  {copy.installingNote}
                </div>
              </div>
            )}

            {/* Error */}
            {phase === 'error' && (
              <div style={{
                marginBottom: '20px', padding: '14px',
                backgroundColor: '#fff0f0', borderRadius: '8px',
                border: '1px solid #ffcccc',
              }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#721c24' }}>
                  ❌ Error
                </div>
                <div style={{ fontSize: '13px', color: '#721c24', marginBottom: '8px' }}>
                  {errorMessage}
                </div>
                <div style={{ fontSize: '12px', color: '#6c757d' }}>
                  You can also install J-Link manually from{' '}
                  <a
                    href="https://www.segger.com/downloads/jlink/"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#007bff' }}
                  >
                    segger.com/downloads/jlink
                  </a>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>

              {(phase === 'no-installer' || phase === 'downloading') && (
                <button
                  className="btn btn-primary"
                  onClick={handleDownloadAndInstall}
                  disabled={isBusy || isLoading}
                  style={{ flex: 1, minWidth: '260px' }}
                >
                  {phase === 'downloading' ? '⏳ Downloading...' : copy.downloadBtnLabel}
                </button>
              )}

              {(phase === 'has-installer' || phase === 'installing') && (
                <button
                  className="btn btn-primary"
                  onClick={handleInstallOnly}
                  disabled={isBusy || isLoading}
                  style={{ flex: 1, minWidth: '260px' }}
                >
                  {phase === 'installing' ? '⚙️ Installing...' : copy.installBtnLabel}
                </button>
              )}

              {phase === 'error' && (
                <button
                  className="btn btn-secondary"
                  onClick={() => { setPhase('no-installer'); setErrorMessage(''); }}
                  style={{ flex: 1, minWidth: '160px' }}
                >
                  🔄 Try Again
                </button>
              )}

              {isBusy && (
                <button
                  className="btn btn-danger"
                  onClick={handleCancel}
                  style={{ minWidth: '100px' }}
                >
                  ✕ Cancel
                </button>
              )}

            </div>

            {/* Manual install fallback link — always visible when not busy */}
            {!isBusy && phase !== 'checking' && (
              <div style={{ marginTop: '16px', fontSize: '12px', color: '#adb5bd', textAlign: 'center' }}>
                Prefer to install manually?{' '}
                <a
                  href="https://www.segger.com/downloads/jlink/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#6c757d' }}
                >
                  Download from SEGGER
                </a>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}