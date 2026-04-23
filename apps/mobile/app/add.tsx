import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";

import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { fonts } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

export default function AddScreen() {
  const api = useApi();
  const router = useRouter();
  const theme = useTheme();
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const { article } = await api.saveArticle(url.trim());
      router.replace(`/read/${article.id}`);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message || `Save failed (${err.status})`
          : err instanceof Error
            ? err.message
            : "Save failed";
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { backgroundColor: theme.bg }]}
    >
      <Text style={[styles.title, { color: theme.fg }]}>Add article</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="url"
        autoCorrect={false}
        autoFocus
        keyboardType="url"
        placeholder="https://example.com/article"
        placeholderTextColor={theme.fgMuted}
        value={url}
        onChangeText={setUrl}
        style={[
          styles.input,
          {
            borderColor: theme.rule,
            backgroundColor: theme.bgElevated,
            color: theme.fg,
          },
        ]}
      />
      <Pressable
        disabled={pending || !url}
        onPress={submit}
        style={[
          styles.button,
          { backgroundColor: theme.accent },
          (pending || !url) && styles.buttonDisabled,
        ]}
      >
        {pending ? (
          <ActivityIndicator color={theme.fgOnAccent} />
        ) : (
          <Text style={[styles.buttonText, { color: theme.fgOnAccent }]}>
            Save
          </Text>
        )}
      </Pressable>
      {error ? (
        <Text style={[styles.error, { color: theme.accent }]}>{error}</Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  input: { borderWidth: 1, borderRadius: 6, padding: 12, fontSize: 16 },
  button: { padding: 14, borderRadius: 6, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontWeight: "600", fontSize: 15 },
  error: { fontSize: 14 },
});
