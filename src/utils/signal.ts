import { SignalStatus, TelephonyCell } from "@/types/telephony";

export function getSignalStatus(cell?: TelephonyCell | null): SignalStatus {
  if (!cell) return "Unknown";
  const rsrp = cell.rsrp;
  if (typeof rsrp !== "number") return "Unknown";
  if (rsrp >= -85) return "Excellent";
  if (rsrp >= -95) return "Good";
  if (rsrp >= -105) return "Fair";
  return "Poor";
}

export function getSignalColor(status: SignalStatus): string {
  switch (status) {
    case "Excellent":
      return "#FFFFFF";
    case "Good":
      return "#D7D7D7";
    case "Fair":
      return "#B8B8B8";
    case "Poor":
      return "#8A8A8A";
    default:
      return "#A7A7A7";
  }
}

export function formatValue(value: string | number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "N/A";
  return `${value}${suffix}`;
}
