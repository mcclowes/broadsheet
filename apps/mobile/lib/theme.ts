import { Platform } from "react-native";

export const palette = {
  light: {
    bg: "#fafaf7",
    bgElevated: "#f3f1ec",
    fg: "#1a1a1a",
    fgMuted: "#6b6b6b",
    fgOnAccent: "#ffffff",
    accent: "#b4451f",
    rule: "#e4e2dc",
  },
  dark: {
    bg: "#131311",
    bgElevated: "#1f1e1b",
    fg: "#ece9df",
    fgMuted: "#9a968b",
    fgOnAccent: "#131311",
    accent: "#e8794f",
    rule: "#2e2c27",
  },
} as const;

export type Palette = (typeof palette)[keyof typeof palette];

export const fonts = {
  serif: Platform.select({
    ios: "Iowan Old Style",
    android: "serif",
    default: "Georgia",
  })!,
  sans: Platform.select({
    ios: "System",
    android: "sans-serif",
    default: "System",
  })!,
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "Menlo",
  })!,
};
