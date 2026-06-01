import { requireNativeModule } from "expo-modules-core";
import { TelephonyCell } from "@/types/telephony";

type NativeTelephonyModule = {
  getCurrentCellsAsync(): Promise<TelephonyCell[]>;
  isTelephonyAvailableAsync(): Promise<boolean>;
  getActiveWifiSsidAsync(): Promise<string | null>;
};

let nativeModule: NativeTelephonyModule | undefined;
try {
  nativeModule = requireNativeModule("TelephonyModule");
} catch {
  nativeModule = undefined;
}

export async function getCurrentCellsAsync(): Promise<TelephonyCell[]> {
  if (!nativeModule) {
    throw new Error("TelephonyModule is not available. Build with Expo Dev Client on a physical Android device.");
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

