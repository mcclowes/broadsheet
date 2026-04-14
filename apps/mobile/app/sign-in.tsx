import { useSignIn } from "@clerk/clerk-expo";
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
  View,
} from "react-native";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!isLoaded) return;
    setPending(true);
    setError(null);
    try {
      await signIn.create({ identifier: email, strategy: "email_code" });
      setStage("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode() {
    if (!isLoaded) return;
    setPending(true);
    setError(null);
    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code,
      });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.back();
      } else {
        setError("Verification incomplete");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <Text style={styles.title}>Sign in</Text>
      {stage === "email" ? (
        <>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <Pressable
            disabled={pending || !email}
            onPress={sendCode}
            style={[styles.button, pending && styles.buttonDisabled]}
          >
            {pending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Send code</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.helper}>We sent a code to {email}.</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="number-pad"
            placeholder="123456"
            value={code}
            onChangeText={setCode}
            style={styles.input}
          />
          <Pressable
            disabled={pending || !code}
            onPress={verifyCode}
            style={[styles.button, pending && styles.buttonDisabled]}
          >
            {pending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Verify</Text>
            )}
          </Pressable>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  helper: { fontSize: 14, opacity: 0.7 },
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
