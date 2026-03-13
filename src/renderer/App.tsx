import { useEffect } from "react";
import { useProbeStore } from "./store/probeStore";
import Dashboard from "./pages/Dashboard";
import InstallJLink from "./pages/InstallJLink";

export default function App() {
  const { isInstalled, isLoading, checkInstallation } = useProbeStore();

  useEffect(() => {
    // MUST call checkInstallation on mount
    // MUST catch errors — uncaught Promise rejections = blank screen
    checkInstallation().catch((err) => {
      console.error("[App] checkInstallation failed:", err);
    });
  }, []); // empty deps — run once on mount only

  // Phase 1: still checking — show spinner
  if (isInstalled === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-gray-400 text-sm">Checking J-Link installation...</div>
      </div>
    );
  }

  // Phase 2: checked but not installed
  if (!isInstalled) {
    return <InstallJLink />;
  }

  // Phase 3: installed — show main dashboard
  return <Dashboard />;
}
