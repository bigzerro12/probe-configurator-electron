import React from "react";
import { Probe, DriverType } from "@shared/types";

interface ProbeTableProps {
  probes: Probe[];
  selectedProbeId: string | null;
  onSelectProbe: (id: string) => void;
}

export default function ProbeTable({ probes, selectedProbeId, onSelectProbe }: ProbeTableProps) {
  const getDriverBadge = (driver: DriverType) => {
    const baseClasses = "driver-badge";
    switch (driver) {
      case "SEGGER":
        return <span className={`${baseClasses} driver-segger`}>SEGGER</span>;
      case "WinUSB":
        return <span className={`${baseClasses} driver-winusb`}>WinUSB</span>;
      case "Unknown":
      default:
        return <span className={`${baseClasses} driver-unknown`}>Unknown</span>;
    }
  };

  return (
    <div className="table-container">
      <table id="probe-table" className="probe-table">
        <thead>
          <tr>
            <th>SERIAL</th>
            <th>PRODUCT</th>
            <th>NICKNAME</th>
            <th>CONNECTION</th>
            <th>USB DRIVER</th>
            <th>PROBE FIRMWARE</th>
          </tr>
        </thead>
        <tbody>
          {probes.length > 0 ? (
            probes.map((probe) => {
              const isSelected = selectedProbeId === probe.id;
              return (
                <tr
                  key={probe.id}
                  onClick={() => onSelectProbe(probe.id)}
                  className={`probe-row ${isSelected ? "selected" : ""}`}
                >
                  <td>{probe.serialNumber}</td>
                  <td>{probe.productName}</td>
                  <td>{probe.nickName}</td>
                  <td>
                    <div className="connection-status">
                      <span className="connection-dot"></span>
                      {probe.connection}
                    </div>
                  </td>
                  <td>{getDriverBadge(probe.driver)}</td>
                  <td>
                    {probe.firmware
                      ? <span className="firmware-date">{probe.firmware}</span>
                      : <span className="firmware-unknown">—</span>
                    }
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={6} className="text-center text-gray-500 py-8">
                No J-Link probes detected
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}