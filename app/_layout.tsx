import { Tabs } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { initLogStore } from "@/storage/logStore";

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
        tabBarActiveTintColor: "#40E0C9",
        tabBarInactiveTintColor: "#718091",
        tabBarStyle: {
          backgroundColor: "#07131D",
          borderTopColor: "#183341"
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
        name="logs"
        options={{ title: "Logs", tabBarIcon: ({ color }: { color: string }) => <Ionicons name="list" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color }: { color: string }) => <Ionicons name="settings" size={22} color={color} /> }}
      />
    </Tabs>
  );
}
