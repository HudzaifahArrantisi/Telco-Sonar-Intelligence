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
  // ── Advanced LTE Metrics ──────────────────────────────────────────
  /** Signal-to-Noise Ratio (dB). Same as sinr for LTE but more explicit. */
  rssnr?: number | null;
  /** Channel Quality Indicator (0–15). Higher = better channel quality. */
  cqi?: number | null;
  /** CQI table index (Android 12+). */
  cqiTableIndex?: number | null;
  // ── Advanced 5G/NR CSI Metrics (Channel State Information) ──────
  /** CSI Reference Signal Received Power (dBm, 5G/NR only). */
  csiRsrp?: number | null;
  /** CSI Reference Signal Received Quality (dB, 5G/NR only). */
  csiRsrq?: number | null;
  /** CSI Signal-to-Interference-plus-Noise Ratio (dB, 5G/NR only). */
  csiSinr?: number | null;
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

// ── New: Advanced Feature Types ────────────────────────────────────────────────

/** Emitted when the device registers on a different cell (handover). */
export type HandoverEvent = {
  fromCellId: string | null;
  toCellId: string;
  fromSignalDbm: number | null;
  toSignalDbm: number | null;
  fromNetworkType: string | null;
  toNetworkType: string | null;
  timestamp: number;
};

/** Battery status snapshot for thermal-signal correlation analysis. */
export type BatteryStatus = {
  available: boolean;
  /** Battery level as a percentage (0–100). */
  levelPercent: number | null;
  /** Battery temperature in degrees Celsius. */
  temperatureCelsius: number | null;
  /** Battery voltage in millivolts. */
  voltageMillivolts: number | null;
  isCharging: boolean;
  isPlugged: boolean;
  timestamp: number;
};

/** Estimated link bandwidth provided by the Android OS NetworkCapabilities. */
export type LinkBandwidth = {
  available: boolean;
  isCellular: boolean;
  isWifi: boolean;
  /** Estimated downstream (download) bandwidth in Kbps. */
  linkDownstreamBandwidthKbps: number;
  /** Estimated upstream (upload) bandwidth in Kbps. */
  linkUpstreamBandwidthKbps: number;
  /** Wi-Fi signal strength level (Android 10+, Wi-Fi only). */
  signalStrengthWifi: number | null;
  timestamp: number;
};

// ── Tower Classification & Neighbor Visualization ──────────────────────────────

/** Classification of detected cell tower infrastructure type. */
export type TowerType = "5G_POLE" | "LTE_MONOPOLE" | "MICROWAVE_HUB" | "SMALL_CELL";

/** Payload for a neighbor/serving tower to be drawn on the sonar radar map. */
export type NeighborTowerPayload = {
  /** Estimated GPS location derived from user position + bearing/distance heuristic. */
  location: LocationPoint;
  /** Deterministic bearing (degrees) from user to estimated tower position. */
  bearing: number;
  /** Estimated distance in meters from user. */
  distanceMeters: number;
  /** Classification of the tower type for icon selection. */
  towerType: TowerType;
  /** Whether this is the serving (registered) cell or a neighbor. */
  isServing: boolean;
  /** Network type label (LTE, NR, 5G SA, WCDMA, GSM). */
  networkType: string;
  /** Operator name. */
  operatorName: string;
  /** Physical Cell ID. */
  pci: string | null;
  /** Cell ID. */
  cellId: string | null;
  /** Band number string. */
  band: string | null;
  /** RSRP in dBm. */
  rsrp: number | null;
  /** RSRQ in dB. */
  rsrq: number | null;
  /** SINR in dB. */
  sinr: number | null;
  /** SIM slot index. */
  simSlot: number;
};
