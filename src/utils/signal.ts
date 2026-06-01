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
      return "#1FE0A2";
    case "Good":
      return "#8FE35F";
    case "Fair":
      return "#FFB84D";
    case "Poor":
      return "#FF5F6D";
    default:
      return "#7E8A99";
  }
}

export function formatValue(value: string | number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "N/A";
  return `${value}${suffix}`;
}
