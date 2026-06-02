import { Tabs } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { initLogStore } from "@/storage/logStore";
import { HUD } from "@/theme/hud";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initLogStore();
    setReady(true);
    void SplashScreen.hideAsync();
  }, []);

  if (!ready) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: HUD.colors.cyan,
        tabBarInactiveTintColor: HUD.colors.textMuted,
        tabBarStyle: {
          backgroundColor: HUD.colors.bgAlt,
          borderTopColor: HUD.colors.border
        },
        tabBarLabelStyle: {
          fontWeight: "800"
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Dashboard", tabBarIcon: ({ color }: { color: string }) => <Ionicons name="speedometer" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: "Map", tabBarIcon: ({ color }: { color: string }) => <Ionicons name="map" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color }: { color: string }) => <Ionicons name="settings" size={22} color={color} /> }}
      />
    </Tabs>
  );
}
