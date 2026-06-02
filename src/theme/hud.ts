export const HUD = {
  colors: {
    bg: "#000000",
    bgAlt: "#050505",
    panel: "#0B0B0B",
    panelElevated: "#141414",
    panelSoft: "#1C1C1C",
    border: "#303030",
    borderStrong: "#F5F5F5",
    cyan: "#FFFFFF",
    cyanSoft: "rgba(255, 255, 255, 0.12)",
    amber: "#FFFFFF",
    amberStrong: "#D7D7D7",
    text: "#FFFFFF",
    textMuted: "#A7A7A7",
    textDim: "#6B6B6B",
    phosphor: "rgba(57, 255, 20, 0.85)",
    danger: "#FFFFFF"
  },
  radius: 6,
  fonts: {
    mono: "monospace"
  },
  glow: {
    panel: {
      elevation: 3,
      shadowColor: "#FFFFFF",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 12
    },
    cyan: {
      elevation: 5,
      shadowColor: "#FFFFFF",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.22,
      shadowRadius: 14
    },
    amber: {
      elevation: 5,
      shadowColor: "#FFFFFF",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 14
    }
  }
} as const;
