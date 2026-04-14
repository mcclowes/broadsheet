import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useApi } from "@/lib/use-api";
import type { Article } from "@/lib/api";

export default function ReadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{article.title}</Text>
      {article.byline ? (
        <Text style={styles.byline}>{article.byline}</Text>
      ) : null}
      <Pressable onPress={() => Linking.openURL(article.url)}>
        <Text style={styles.link} numberOfLines={1}>
          {article.siteName ?? article.url}
        </Text>
      </Pressable>
      <View style={styles.divider} />
      <Text style={styles.placeholder}>
        Markdown rendering lands in issue #2 — tap the source link above to read
        for now.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 10 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700" },
  byline: { fontSize: 14, opacity: 0.7 },
  link: { fontSize: 13, color: "#0a7" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#8886",
    marginVertical: 12,
  },
  placeholder: { fontSize: 14, opacity: 0.6 },
  error: { color: "#c33" },
});
