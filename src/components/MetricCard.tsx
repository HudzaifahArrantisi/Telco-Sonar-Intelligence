import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { HUD } from "@/theme/hud";

type Props = {
  label: string;
  value: string;
  description?: string;
  accent?: string;
  icon?: ReactNode;
};

export function MetricCard({ label, value, description, accent = HUD.colors.cyan, icon }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.labelBlock}>
          <Text style={styles.label}>{label}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
        {icon}
      </View>
      <Text style={[styles.value, { color: accent }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flex: 1,
    minWidth: "47%",
    padding: 14
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  labelBlock: {
    flex: 1,
    paddingRight: 8
  },
  label: {
    color: HUD.colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  description: {
    color: HUD.colors.textDim,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2
  },
  value: {
    fontFamily: HUD.fonts.mono,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 8
  }
});
