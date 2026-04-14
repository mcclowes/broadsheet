import { useColorScheme } from "react-native";
import { palette, type Palette } from "./theme";

export function useTheme(): Palette & { scheme: "light" | "dark" } {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return { ...palette[scheme], scheme };
}
