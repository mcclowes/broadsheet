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
} from "react-native";
import Markdown from "react-native-markdown-display";

import { useApi } from "@/lib/use-api";
import type { Article } from "@/lib/api";
import { fonts } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

export default function ReadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const navigation = useNavigation();
  const theme = useTheme();
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
    if (article?.source) {
      navigation.setOptions({ title: article.source });
    }
  }, [article, navigation]);

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.accent }}>{error}</Text>
      </View>
    );
  }

  if (!article) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.fgMuted} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={[styles.title, { color: theme.fg }]}>{article.title}</Text>
      {article.byline ? (
        <Text style={[styles.byline, { color: theme.fgMuted }]}>
          By {article.byline}
        </Text>
      ) : null}
      <View style={styles.metaRow}>
        <Pressable onPress={() => Linking.openURL(article.url)} hitSlop={4}>
          <Text
            style={[styles.source, { color: theme.accent }]}
            numberOfLines={1}
          >
            {article.source ?? article.url}
          </Text>
        </Pressable>
        {article.readMinutes ? (
          <Text style={[styles.meta, { color: theme.fgMuted }]}>
            {" · "}
            {article.readMinutes} min read
          </Text>
        ) : null}
      </View>
      <View style={[styles.divider, { backgroundColor: theme.rule }]} />
      <Markdown style={markdownStylesFor(theme)}>{article.body}</Markdown>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 20, paddingBottom: 64 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  byline: { fontSize: 14, marginTop: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  source: { fontSize: 13, fontWeight: "500" },
  meta: { fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 20 },
});

function markdownStylesFor(theme: ReturnType<typeof useTheme>) {
  return {
    body: {
      fontFamily: fonts.serif,
      fontSize: 19,
      lineHeight: 31,
      color: theme.fg,
    },
    heading1: {
      fontFamily: fonts.serif,
      fontSize: 26,
      fontWeight: "700" as const,
      marginTop: 24,
      marginBottom: 10,
      color: theme.fg,
      letterSpacing: -0.3,
    },
    heading2: {
      fontFamily: fonts.serif,
      fontSize: 22,
      fontWeight: "700" as const,
      marginTop: 22,
      marginBottom: 8,
      color: theme.fg,
    },
    heading3: {
      fontFamily: fonts.serif,
      fontSize: 19,
      fontWeight: "600" as const,
      marginTop: 18,
      marginBottom: 6,
      color: theme.fg,
    },
    paragraph: { marginTop: 0, marginBottom: 16 },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: theme.rule,
      paddingLeft: 14,
      marginVertical: 10,
      backgroundColor: "transparent",
    },
    code_inline: {
      fontFamily: fonts.mono,
      fontSize: 15,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 3,
      backgroundColor: theme.bgElevated,
      color: theme.fg,
    },
    code_block: {
      fontFamily: fonts.mono,
      fontSize: 14,
      lineHeight: 20,
      padding: 12,
      borderRadius: 6,
      backgroundColor: theme.bgElevated,
      color: theme.fg,
    },
    fence: {
      fontFamily: fonts.mono,
      fontSize: 14,
      lineHeight: 20,
      padding: 12,
      borderRadius: 6,
      backgroundColor: theme.bgElevated,
      color: theme.fg,
    },
    link: { color: theme.accent },
    hr: { backgroundColor: theme.rule, height: StyleSheet.hairlineWidth },
    bullet_list: { marginBottom: 12 },
    ordered_list: { marginBottom: 12 },
    list_item: { marginBottom: 4 },
  };
}
