import { ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { HUD } from "@/theme/hud";

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
    ...HUD.glow.panel,
    alignItems: "center",
    borderColor: HUD.colors.borderStrong,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14
  },
  primary: {
    backgroundColor: HUD.colors.cyanSoft
  },
  secondary: {
    backgroundColor: HUD.colors.panelElevated
  },
  danger: {
    backgroundColor: "rgba(255, 122, 0, 0.16)",
    borderColor: HUD.colors.amberStrong
  },
  pressed: {
    opacity: 0.75
  },
  text: {
    color: HUD.colors.text,
    fontSize: 14,
    fontWeight: "900"
  }
});
