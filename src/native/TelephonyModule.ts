import { requireNativeModule, EventEmitter } from "expo-modules-core";
import type { EventSubscription } from "expo-modules-core";
import { TelephonyCell, HandoverEvent, BatteryStatus, LinkBandwidth } from "@/types/telephony";

// ─── Native module type definition ────────────────────────────────────────────

type NativeTelephonyModule = {
  // Existing
  getCurrentCellsAsync(): Promise<TelephonyCell[]>;
  isTelephonyAvailableAsync(): Promise<boolean>;
  getActiveWifiSsidAsync(): Promise<string | null>;

  // Real-time listeners
  startCellListenerAsync(): Promise<void>;
  stopCellListenerAsync(): Promise<void>;

  // Background service
  startTrackingServiceAsync(): Promise<boolean>;
  stopTrackingServiceAsync(): Promise<boolean>;

  // Native ping
  runNativePingAsync(host: string, count: number): Promise<PingResult>;

  // Battery monitoring
  startBatteryMonitorAsync(): Promise<void>;
  stopBatteryMonitorAsync(): Promise<void>;
  getBatteryStatusAsync(): Promise<BatteryStatus>;

  // Link bandwidth
  getLinkBandwidthAsync(): Promise<LinkBandwidth>;
};

// ─── Exported types ───────────────────────────────────────────────────────────

export type PingResult = {
  sent: number;
  received: number;
  packetLoss: number;
  rttMin: number | null;
  rttAvg: number | null;
  rttMax: number | null;
  rawOutput?: string;
  error?: string;
};

export type CellInfoChangedEvent = {
  cells: TelephonyCell[];
};

export type SignalStrengthChangedEvent = {
  level: number;
  dbm: number | null;
  rsrp?: number | null;
  rsrq?: number | null;
  rssnr?: number | null;
  cqi?: number | null;
  timingAdvance?: number | null;
};

// ─── Module initialization ────────────────────────────────────────────────────

let nativeModule: NativeTelephonyModule | undefined;
let emitter: InstanceType<typeof EventEmitter> | undefined;

try {
  nativeModule = requireNativeModule("TelephonyModule");
  emitter      = new EventEmitter(nativeModule as any);
} catch {
  nativeModule = undefined;
  emitter      = undefined;
}

// ─── Existing functions ───────────────────────────────────────────────────────

export async function getCurrentCellsAsync(): Promise<TelephonyCell[]> {
  if (!nativeModule) {
    throw new Error(
      "TelephonyModule is not available. Build with Expo Dev Client on a physical Android device."
    );
  }
  return nativeModule.getCurrentCellsAsync();
}

export async function isTelephonyAvailableAsync(): Promise<boolean> {
  return nativeModule?.isTelephonyAvailableAsync() ?? false;
}

export async function getActiveWifiSsidAsync(): Promise<string | null> {
  if (!nativeModule) return null;
  try {
    return await nativeModule.getActiveWifiSsidAsync();
  } catch {
    return null;
  }
}

// ─── Real-time event listeners ────────────────────────────────────────────────

/**
 * Daftarkan listener real-time perubahan sel.
 * Panggil `startCellListenerAsync()` terlebih dahulu.
 */
export function addCellInfoListener(
  callback: (event: CellInfoChangedEvent) => void
): EventSubscription | null {
  return emitter?.addListener("onCellInfoChanged", callback) ?? null;
}

/**
 * Daftarkan listener real-time kekuatan sinyal.
 * Termasuk metrik lanjutan: rssnr, cqi, timingAdvance.
 */
export function addSignalStrengthListener(
  callback: (event: SignalStrengthChangedEvent) => void
): EventSubscription | null {
  return emitter?.addListener("onSignalStrengthChanged", callback) ?? null;
}

/**
 * Daftarkan listener event handover (perpindahan tower).
 * Dipanggil secara otomatis ketika Cell ID aktif berubah.
 */
export function addHandoverListener(
  callback: (event: HandoverEvent) => void
): EventSubscription | null {
  return emitter?.addListener("onHandoverOccurred", callback) ?? null;
}

/**
 * Daftarkan listener perubahan estimasi bandwidth jaringan.
 */
export function addBandwidthListener(
  callback: (event: LinkBandwidth) => void
): EventSubscription | null {
  return emitter?.addListener("onBandwidthChanged", callback) ?? null;
}

/**
 * Daftarkan listener perubahan status baterai (level & suhu).
 * Aktif setelah memanggil `startBatteryMonitorAsync()`.
 */
export function addBatteryListener(
  callback: (event: BatteryStatus) => void
): EventSubscription | null {
  return emitter?.addListener("onBatteryChanged", callback) ?? null;
}

export async function startCellListenerAsync(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.startCellListenerAsync();
}

export async function stopCellListenerAsync(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.stopCellListenerAsync();
}

// ─── Background Foreground Service ────────────────────────────────────────────

export async function startTrackingServiceAsync(): Promise<boolean> {
  return nativeModule?.startTrackingServiceAsync() ?? false;
}

export async function stopTrackingServiceAsync(): Promise<boolean> {
  return nativeModule?.stopTrackingServiceAsync() ?? false;
}

// ─── Battery & Thermal Monitoring ─────────────────────────────────────────────

/**
 * Mulai memantau perubahan status baterai secara real-time.
 * Subscribe ke event via `addBatteryListener()`.
 */
export async function startBatteryMonitorAsync(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.startBatteryMonitorAsync();
}

/**
 * Hentikan pemantauan baterai dan bebaskan BroadcastReceiver.
 */
export async function stopBatteryMonitorAsync(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.stopBatteryMonitorAsync();
}

/**
 * Baca status baterai saat ini (one-shot, tanpa listener).
 * @returns BatteryStatus dengan suhu, persentase, dan status pengisian
 */
export async function getBatteryStatusAsync(): Promise<BatteryStatus> {
  if (!nativeModule) {
    return {
      available: false,
      levelPercent: null,
      temperatureCelsius: null,
      voltageMillivolts: null,
      isCharging: false,
      isPlugged: false,
      timestamp: Date.now()
    };
  }
  return nativeModule.getBatteryStatusAsync();
}

// ─── Link Bandwidth ────────────────────────────────────────────────────────────

/**
 * Baca estimasi bandwidth jaringan aktif dari OS (one-shot).
 * @returns LinkBandwidth dengan nilai downstream & upstream dalam Kbps
 */
export async function getLinkBandwidthAsync(): Promise<LinkBandwidth> {
  if (!nativeModule) {
    return {
      available: false,
      isCellular: false,
      isWifi: false,
      linkDownstreamBandwidthKbps: 0,
      linkUpstreamBandwidthKbps: 0,
      signalStrengthWifi: null,
      timestamp: Date.now()
    };
  }
  return nativeModule.getLinkBandwidthAsync();
}

// ─── Native Ping ───────────────────────────────────────────────────────────────

/**
 * Jalankan ping ICMP native ke sebuah host.
 * @param host  - Hostname atau IP address target (contoh: "8.8.8.8")
 * @param count - Jumlah paket yang dikirim (1–20, default: 4)
 */
export async function runNativePingAsync(
  host: string,
  count: number = 4
): Promise<PingResult> {
  if (!nativeModule) {
    return {
      sent: count,
      received: 0,
      packetLoss: 100,
      rttMin: null,
      rttAvg: null,
      rttMax: null,
      error: "TelephonyModule not available on this platform"
    };
  }
  return nativeModule.runNativePingAsync(host, count);
}
