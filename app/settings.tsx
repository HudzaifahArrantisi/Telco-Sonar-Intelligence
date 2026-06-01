import { useEffect, useState } from "react";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { defaultSettings, loadSettings, saveSettings } from "@/storage/settings";
import { Settings } from "@/types/telephony";
import { setLatestSettings } from "@/services/runtimeState";

export default function SettingsRoute() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  return (
    <SettingsScreen
      settings={settings}
      onChange={async (next) => {
        setSettings(next);
        setLatestSettings(next);
        await saveSettings(next);
      }}
    />
  );
}
