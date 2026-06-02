export type SignalStatus = "Excellent" | "Good" | "Fair" | "Poor" | "Unknown";

export type TelephonyCell = {
  simSlot: number;
  operatorName: string;
  mcc: string | null;
  mnc: string | null;
  networkType: "LTE" | "5G NSA" | "5G SA" | "NR" | "WCDMA" | "GSM" | "Unknown";
  cellId: string | null;
  tac: string | null;
  lac: string | null;
  pci: string | null;
  earfcn: string | null;
  nrarfcn: string | null;
  band: string | null;
  rsrp: number | null;
  rsrq: number | null;
  rssi: number | null;
  sinr: number | null;
  timingAdvance?: number | null;
  isRegistered: boolean;
  timestamp: number;
};

export type LocationPoint = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  altitude?: number | null;
  timestamp?: number | null;
};

export type DriveLog = {
  id?: number;
  timestamp: number;
  latitude: number | null;
  longitude: number | null;
  operator: string;
  networkType: string;
  cellId: string | null;
  tac: string | null;
  pci: string | null;
  band: string | null;
  rsrp: number | null;
  rsrq: number | null;
  sinr: number | null;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
};

export type SweetSpot = {
  id?: number;
  name: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  operator: string;
  rsrp: number | null;
  rsrq: number | null;
  pci: string | null;
  score: number;
};

export type Settings = {
  updateIntervalSeconds: number;
  defaultBeamwidth: number;
  defaultRadius: number;
  loggingEnabled: boolean;
  themeMode: "dark" | "system";
};
