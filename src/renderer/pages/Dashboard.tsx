import React from "react";
import { useProbeStore } from "../store/probeStore";
import ProbeTable from "../components/ProbeTable";

export default function Dashboard() {
  const {
    probes,
    isLoading,
    isInstalled,
    installVersion,
    selectedProbeId,
    error,
    scanProbes,
    selectProbe,
    openConfigurator,
    updateFirmware,
    firmwareUpdateStatus,
    firmwareUpdateMessage,
    nicknameStatus,
    nicknameMessage,
    setNickname,
  } = useProbeStore();

  const [showNicknameDialog, setShowNicknameDialog] = React.useState(false);
  const [nicknameInput, setNicknameInput] = React.useState("");

  const selectedProbe = probes.find(p => p.id === selectedProbeId);
  const canSwitchToWinUSB = selectedProbe && selectedProbe.driver !== "WinUSB";
  const canUpdateFirmware = !!selectedProbe && firmwareUpdateStatus !== "updating";

  const handleRefresh = () => scanProbes();

  const handleUpdateFirmware = () => {
    if (selectedProbeId) updateFirmware(selectedProbeId);
  };

  const handleSwitchDriver = () => {
    if (selectedProbeId) openConfigurator(probes.findIndex(p => p.id === selectedProbeId));
  };

  const handleSetNickname = async () => {
    if (!selectedProbeId) return;
    setShowNicknameDialog(false);
    await setNickname(selectedProbeId, nicknameInput.trim());
    setNicknameInput("");
  };

  return (
    <div className="container">
      <div className="app-card">

        {/* Header */}
        <header className="app-header">
          <h1>Probe Configurator</h1>
          <p className="app-description">
            A tool for viewing information and performing basic configuration of all connected hardware debug probes.
          </p>
          <div className="platform-badge">Windows - Electron</div>
        </header>

        {/* Error Display */}
        {error && (
          <div className="error-message">{error}</div>
        )}

        {/* J-LINK SOFTWARE Section */}
        <section className="software-section">
          <h2>J-LINK SOFTWARE</h2>
          <div className="software-info">
            <div className="software-details">
              <div className="software-version">
                {installVersion || "SEGGER J-Link (version unknown)"}
              </div>
              <div className="software-status">
                <span className={`status-indicator ${isInstalled ? "detected" : "error"}`}></span>
                <span className="status-text">
                  {isInstalled ? "Detected" : "Not found"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* CONNECTED J-LINK PROBES Section */}
        <section className="probes-section">
          <h2>CONNECTED J-LINK PROBES</h2>
          <div className="probes-info">
            <div className="probes-status">
              <span className={`status-indicator ${probes.length > 0 ? "detected" : "error"}`}></span>
              <span className="status-text">
                {probes.length > 0 ? `${probes.length} detected` : "No probes found"}
              </span>
            </div>
            <div className="probes-selection">
              {selectedProbe
                ? `Selected: ${selectedProbe.serialNumber} - ${selectedProbe.productName}`
                : "No probe selected"
              }
            </div>
            <button
              id="refresh-button"
              onClick={handleRefresh}
              disabled={isLoading || firmwareUpdateStatus === "updating"}
              className="btn btn-secondary"
            >
              {isLoading ? "Scanning..." : "Refresh list"}
            </button>
          </div>

          <ProbeTable
            probes={probes}
            selectedProbeId={selectedProbeId}
            onSelectProbe={selectProbe}
          />
        </section>

        {/* DRIVER CONFIGURATION Section */}
        <section className="driver-section">
          <h2>DRIVER CONFIGURATION</h2>
          <div className="driver-info">
            <p className="driver-description">
              Select a probe and switch its USB driver to WinUSB when you need access from custom tools or libusb-based stacks.
              The J-Link Configurator will open so you can perform the change.
            </p>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                id="switch-button"
                onClick={handleSwitchDriver}
                disabled={!canSwitchToWinUSB || isLoading || firmwareUpdateStatus === "updating"}
                className="btn btn-primary"
              >
                {selectedProbe && selectedProbe.driver === "WinUSB"
                  ? "Already using WinUSB"
                  : "Switch to WinUSB"
                }
              </button>

              <button
                id="update-firmware-button"
                onClick={handleUpdateFirmware}
                disabled={!canUpdateFirmware || isLoading}
                className="btn btn-secondary"
              >
                {firmwareUpdateStatus === "updating" ? "⏳ Updating Firmware..." : "⬆️ Update Probe Firmware"}
              </button>

              <button
                id="set-nickname-button"
                onClick={() => { setNicknameInput(""); setShowNicknameDialog(true); }}
                disabled={!selectedProbeId || firmwareUpdateStatus === "updating" || nicknameStatus === "setting"}
                className="btn btn-secondary"
              >
                ✏️ Set Nickname
              </button>
            </div>

            {/* Firmware update status */}
            {firmwareUpdateStatus !== "idle" && firmwareUpdateMessage && (
              <div style={{
                marginTop: "12px", padding: "10px 14px", borderRadius: "6px",
                backgroundColor:
                  firmwareUpdateStatus === "updated" ? "#d4edda" :
                  firmwareUpdateStatus === "current" ? "#d1ecf1" :
                  firmwareUpdateStatus === "failed"  ? "#fff0f0" : "#f8f9fa",
                border: `1px solid ${
                  firmwareUpdateStatus === "updated" ? "#c3e6cb" :
                  firmwareUpdateStatus === "current" ? "#bee5eb" :
                  firmwareUpdateStatus === "failed"  ? "#ffcccc" : "#e9ecef"}`,
                fontSize: "13px",
                color:
                  firmwareUpdateStatus === "updated" ? "#155724" :
                  firmwareUpdateStatus === "current" ? "#0c5460" :
                  firmwareUpdateStatus === "failed"  ? "#721c24" : "#495057",
              }}>
                {firmwareUpdateStatus === "updated" && "✅ "}
                {firmwareUpdateStatus === "current" && "ℹ️ "}
                {firmwareUpdateStatus === "failed"  && "❌ "}
                {firmwareUpdateStatus === "updating" && "⏳ "}
                {firmwareUpdateMessage}
              </div>
            )}

            {/* Nickname status */}
            {nicknameStatus !== "idle" && (
              <div style={{
                marginTop: "12px", padding: "10px 14px", borderRadius: "6px",
                backgroundColor:
                  nicknameStatus === "success" ? "#d4edda" :
                  nicknameStatus === "setting"  ? "#d1ecf1" : "#fff0f0",
                border: `1px solid ${
                  nicknameStatus === "success" ? "#c3e6cb" :
                  nicknameStatus === "setting"  ? "#bee5eb" : "#ffcccc"}`,
                fontSize: "13px",
                color:
                  nicknameStatus === "success" ? "#155724" :
                  nicknameStatus === "setting"  ? "#0c5460" : "#721c24",
              }}>
                {nicknameStatus === "setting" && "⏳ Setting nickname..."}
                {nicknameStatus === "success" && `✅ ${nicknameMessage}`}
                {nicknameStatus === "failed"  && `❌ ${nicknameMessage}`}
              </div>
            )}

            <div className="driver-note">
              {selectedProbe
                ? selectedProbe.driver === "WinUSB"
                  ? "This probe is already using the WinUSB driver."
                  : "Click to open J-Link Configurator and switch the driver to WinUSB."
                : "Select a probe to open J-Link Configurator for driver changes."
              }
            </div>
          </div>
        </section>

      </div>

      {/* Set Nickname Dialog */}
      {showNicknameDialog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "#fff", borderRadius: 8, padding: "24px",
            minWidth: 320, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>Set Nickname</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#666" }}>
              Enter a nickname for the selected probe. Leave empty to clear.
            </p>
            <input
              type="text"
              placeholder="Enter nickname... (leave empty to clear)"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSetNickname();
                if (e.key === "Escape") setShowNicknameDialog(false);
              }}
              autoFocus
              maxLength={32}
              style={{
                width: "100%", padding: "8px 10px",
                border: `1px solid ${nicknameInput && (/[^\x00-\x7F]/.test(nicknameInput) || nicknameInput.includes('"')) ? "#f0a500" : "#ccc"}`,
                borderRadius: 6, fontSize: 14, boxSizing: "border-box",
                marginBottom: 6, outline: "none",
              }}
            />
            {/* Warn if non-ASCII or quote char detected */}
            {nicknameInput && /[^\x00-\x7F]/.test(nicknameInput) && (
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#c0392b" }}>
                ❌ Non-ASCII characters are not allowed (e.g. ư, ơ, ắ...).
              </p>
            )}
            {nicknameInput && nicknameInput.includes('"') && (
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#c0392b" }}>
                ❌ Nickname cannot contain double quotes (").
              </p>
            )}
            {!(nicknameInput && (/[^\x00-\x7F]/.test(nicknameInput) || nicknameInput.includes('"'))) && (
              <div style={{ marginBottom: 12 }} />
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setShowNicknameDialog(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSetNickname}
                disabled={nicknameInput.includes('"') || /[^\x00-\x7F]/.test(nicknameInput)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}