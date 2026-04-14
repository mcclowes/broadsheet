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

export default function AddScreen() {
  const api = useApi();
  const router = useRouter();
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
      style={styles.container}
    >
      <Text style={styles.title}>Add article</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="url"
        autoCorrect={false}
        autoFocus
        keyboardType="url"
        placeholder="https://example.com/article"
        value={url}
        onChangeText={setUrl}
        style={styles.input}
      />
      <Pressable
        disabled={pending || !url}
        onPress={submit}
        style={[styles.button, (pending || !url) && styles.buttonDisabled]}
      >
        {pending ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#8886",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#111",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "white", fontWeight: "600" },
  error: { color: "#c33", fontSize: 14 },
});
