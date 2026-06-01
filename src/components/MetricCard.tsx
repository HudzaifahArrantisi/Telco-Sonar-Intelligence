import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  label: string;
  value: string;
  accent?: string;
  icon?: ReactNode;
};

export function MetricCard({ label, value, accent = "#42D9C8", icon }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
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
    flex: 1,
    minWidth: "47%",
    backgroundColor: "#0C1A24",
    borderColor: "#183341",
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  label: {
    color: "#8795A6",
    fontSize: 12,
    fontWeight: "600"
  },
  value: {
    fontSize: 19,
    fontWeight: "800",
    marginTop: 8
  }
});
