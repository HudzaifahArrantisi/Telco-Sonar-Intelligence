import { ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

type Props = {
  title: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "danger";
  icon?: ReactNode;
};

export function PrimaryButton({ title, onPress, tone = "primary", icon }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "primary" && styles.primary,
        tone === "secondary" && styles.secondary,
        tone === "danger" && styles.danger,
        pressed && styles.pressed
      ]}
    >
      {icon}
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14
  },
  primary: {
    backgroundColor: "#0FB9A8"
  },
  secondary: {
    backgroundColor: "#162B38"
  },
  danger: {
    backgroundColor: "#C44757"
  },
  pressed: {
    opacity: 0.75
  },
  text: {
    color: "#F5FBFF",
    fontSize: 14,
    fontWeight: "800"
  }
});
