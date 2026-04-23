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
} from "react-native";

import { fonts } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const theme = useTheme();
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

  const inputStyle = [
    styles.input,
    {
      borderColor: theme.rule,
      backgroundColor: theme.bgElevated,
      color: theme.fg,
    },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { backgroundColor: theme.bg }]}
    >
      <Text style={[styles.title, { color: theme.fg }]}>Sign in</Text>
      {stage === "email" ? (
        <>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={theme.fgMuted}
            value={email}
            onChangeText={setEmail}
            style={inputStyle}
          />
          <Pressable
            disabled={pending || !email}
            onPress={sendCode}
            style={[
              styles.button,
              { backgroundColor: theme.accent },
              (pending || !email) && styles.buttonDisabled,
            ]}
          >
            {pending ? (
              <ActivityIndicator color={theme.fgOnAccent} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.fgOnAccent }]}>
                Send code
              </Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.helper, { color: theme.fgMuted }]}>
            We sent a code to {email}.
          </Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="number-pad"
            placeholder="123456"
            placeholderTextColor={theme.fgMuted}
            value={code}
            onChangeText={setCode}
            style={inputStyle}
          />
          <Pressable
            disabled={pending || !code}
            onPress={verifyCode}
            style={[
              styles.button,
              { backgroundColor: theme.accent },
              (pending || !code) && styles.buttonDisabled,
            ]}
          >
            {pending ? (
              <ActivityIndicator color={theme.fgOnAccent} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.fgOnAccent }]}>
                Verify
              </Text>
            )}
          </Pressable>
        </>
      )}
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
  helper: { fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 6, padding: 12, fontSize: 16 },
  button: { padding: 14, borderRadius: 6, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontWeight: "600", fontSize: 15 },
  error: { fontSize: 14 },
});
