import { StyleSheet, Text, View } from "react-native";
import { HUD } from "@/theme/hud";

export function Disclaimer() {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        Coverage, azimuth, and beamwidth visualization are high-precision estimations based on available Android
        telephony data and user-defined parameters. They are not absolute measurements.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    padding: 12
  },
  text: {
    color: HUD.colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  }
});
