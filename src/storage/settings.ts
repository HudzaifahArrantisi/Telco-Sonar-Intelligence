import AsyncStorage from "@react-native-async-storage/async-storage";
import { Settings } from "@/types/telephony";

const KEY = "telco-rf-monitor/settings";

export const defaultSettings: Settings = {
  updateIntervalSeconds: 35,
  defaultBeamwidth: 65,
  defaultRadius: 1200,
  loggingEnabled: false,
  themeMode: "dark"
};

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return defaultSettings;
  return { ...defaultSettings, ...JSON.parse(raw) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
