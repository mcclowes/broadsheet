import { ClerkProvider, ClerkLoaded } from "@clerk/clerk-expo";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { tokenCache } from "@/lib/token-cache";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — set it in apps/mobile/.env",
  );
}

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
      <ClerkLoaded>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
