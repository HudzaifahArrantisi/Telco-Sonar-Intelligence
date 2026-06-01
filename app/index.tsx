import { useCallback, useEffect, useState } from "react";
import { PermissionScreen } from "@/screens/PermissionScreen";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { loadSettings, saveSettings, defaultSettings } from "@/storage/settings";
import { LocationPoint, Settings, TelephonyCell } from "@/types/telephony";
import { usePermissions } from "@/hooks/usePermissions";
import { setLatestCells, setLatestSettings } from "@/services/runtimeState";

export default function DashboardRoute() {
  const permissions = usePermissions();
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    void loadSettings().then((next) => {
      setLatestSettings(next);
      setSettings(next);
    });
  }, []);

  const handleCells = useCallback((cells: TelephonyCell[], location: LocationPoint | null) => {
    setLatestCells(cells, location);
  }, []);

  if (permissions.state !== "granted") {
    return <PermissionScreen onRequest={() => void permissions.request()} />;
  }

  return <DashboardScreen settings={settings} onCells={handleCells} />;
}

export async function updateSettings(settings: Settings) {
  setLatestSettings(settings);
  await saveSettings(settings);
}
