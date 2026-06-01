import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { PermissionsAndroid, Platform } from "react-native";

export type PermissionState = "unknown" | "granted" | "denied";

export function usePermissions() {
  const [state, setState] = useState<PermissionState>("unknown");

  const request = useCallback(async () => {
    const location = await Location.requestForegroundPermissionsAsync();
    const phone =
      Platform.OS === "android"
        ? await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE)
        : PermissionsAndroid.RESULTS.GRANTED;
    const granted =
      location.status === "granted" &&
      (Platform.OS !== "android" || phone === PermissionsAndroid.RESULTS.GRANTED);
    setState(granted ? "granted" : "denied");
    return granted;
  }, []);

  useEffect(() => {
    void (async () => {
      const location = await Location.getForegroundPermissionsAsync();
      const phone =
        Platform.OS === "android"
          ? await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE)
          : true;
      setState(location.status === "granted" && phone ? "granted" : "unknown");
    })();
  }, []);

  return { state, request };
}
