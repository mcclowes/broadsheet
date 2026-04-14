import { ClerkProvider, ClerkLoaded } from "@clerk/clerk-expo";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import "react-native-reanimated";

import { tokenCache } from "@/lib/token-cache";
import { palette } from "@/lib/theme";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — set it in apps/mobile/.env",
  );
}

const lightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.light.bg,
    card: palette.light.bg,
    text: palette.light.fg,
    border: palette.light.rule,
    primary: palette.light.accent,
    notification: palette.light.accent,
  },
};

const darkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: palette.dark.bg,
    card: palette.dark.bg,
    text: palette.dark.fg,
    border: palette.dark.rule,
    primary: palette.dark.accent,
    notification: palette.dark.accent,
  },
};

export const unstable_settings = {
  anchor: "index",
};

export default function RootLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const theme = scheme === "dark" ? darkTheme : lightTheme;

  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
      <ClerkLoaded>
        <ThemeProvider value={theme}>
          <Stack screenOptions={{ headerShadowVisible: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
              name="sign-in"
              options={{ presentation: "modal", title: "Sign in" }}
            />
            <Stack.Screen
              name="add"
              options={{ presentation: "modal", title: "Add article" }}
            />
            <Stack.Screen
              name="read/[id]"
              options={{ title: "", headerBackTitle: "Library" }}
            />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
