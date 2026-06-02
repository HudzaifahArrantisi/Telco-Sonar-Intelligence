import { StyleSheet, Text, View } from "react-native";
import { HUD } from "@/theme/hud";
import { SignalStatus } from "@/types/telephony";
import { getSignalColor } from "@/utils/signal";

export function SignalBadge({ status }: { status: SignalStatus }) {
  const color = getSignalColor(status);
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: `${color}22` }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    ...HUD.glow.cyan,
    alignItems: "center",
    borderRadius: HUD.radius,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  dot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  text: {
    fontFamily: HUD.fonts.mono,
    fontSize: 12,
    fontWeight: "900"
  }
});
