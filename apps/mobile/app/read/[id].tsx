import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import Markdown from "react-native-markdown-display";

import { useApi } from "@/lib/use-api";
import type { Article } from "@/lib/api";

export default function ReadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const navigation = useNavigation();
  const scheme = useColorScheme();
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getArticle(id)
      .then(setArticle)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [api, id]);

  useLayoutEffect(() => {
    if (article) {
      navigation.setOptions({ title: article.siteName ?? "" });
    }
  }, [article, navigation]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!article) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const mdStyles =
    scheme === "dark" ? markdownStyles.dark : markdownStyles.light;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.title, scheme === "dark" && styles.titleDark]}>
        {article.title}
      </Text>
      {article.byline ? (
        <Text style={styles.byline}>{article.byline}</Text>
      ) : null}
      <Pressable onPress={() => Linking.openURL(article.url)}>
        <Text style={styles.link} numberOfLines={1}>
          {article.siteName ?? article.url}
          {article.readingTimeMinutes
            ? ` · ${article.readingTimeMinutes} min read`
            : ""}
        </Text>
      </Pressable>
      <View style={styles.divider} />
      <Markdown style={mdStyles}>{article.contentMarkdown}</Markdown>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 20, paddingBottom: 64 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "700", lineHeight: 32 },
  titleDark: { color: "#fff" },
  byline: { fontSize: 14, opacity: 0.7, marginTop: 6 },
  link: { fontSize: 13, color: "#0a7", marginTop: 4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#8886",
    marginVertical: 16,
  },
  error: { color: "#c33" },
});

const sharedMd = {
  body: { fontSize: 17, lineHeight: 27 },
  heading1: {
    fontSize: 24,
    fontWeight: "700" as const,
    marginTop: 24,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 21,
    fontWeight: "700" as const,
    marginTop: 20,
    marginBottom: 6,
  },
  heading3: {
    fontSize: 19,
    fontWeight: "600" as const,
    marginTop: 16,
    marginBottom: 4,
  },
  paragraph: { marginTop: 0, marginBottom: 14 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "#8886",
    paddingLeft: 12,
    marginVertical: 8,
    opacity: 0.9,
  },
  code_inline: {
    fontFamily: "Menlo",
    fontSize: 15,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  code_block: {
    fontFamily: "Menlo",
    fontSize: 14,
    padding: 10,
    borderRadius: 6,
  },
  link: { color: "#0a7" },
  hr: { backgroundColor: "#8886", height: StyleSheet.hairlineWidth },
};

const markdownStyles = {
  light: {
    ...sharedMd,
    body: { ...sharedMd.body, color: "#111" },
    code_inline: { ...sharedMd.code_inline, backgroundColor: "#eee" },
    code_block: { ...sharedMd.code_block, backgroundColor: "#f4f4f4" },
  },
  dark: {
    ...sharedMd,
    body: { ...sharedMd.body, color: "#eee" },
    code_inline: { ...sharedMd.code_inline, backgroundColor: "#333" },
    code_block: { ...sharedMd.code_block, backgroundColor: "#222" },
  },
};
