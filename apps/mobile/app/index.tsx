import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApi } from "@/lib/use-api";
import type { ArticleSummary } from "@/lib/api";
import { fonts } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

export default function LibraryScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: theme.bg }]}
    >
      <SignedIn>
        <Library />
      </SignedIn>
      <SignedOut>
        <SignedOutView />
      </SignedOut>
    </SafeAreaView>
  );
}

function SignedOutView() {
  const theme = useTheme();
  return (
    <View style={styles.centered}>
      <Text style={[styles.brand, { color: theme.fg }]}>Broadsheet</Text>
      <Text style={[styles.subtitle, { color: theme.fgMuted }]}>
        Sign in to see your library.
      </Text>
      <Link href="/sign-in" asChild>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: theme.accent }]}
        >
          <Text style={[styles.primaryButtonText, { color: theme.fgOnAccent }]}>
            Sign in
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}

function Library() {
  const theme = useTheme();
  const api = useApi();
  const { signOut } = useAuth();
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const items = await api.listArticles({ archived: false });
      setArticles(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (articles === null && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.fgMuted} />
      </View>
    );
  }

  return (
    <FlatList
      data={articles ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.fgMuted}
        />
      }
      ListHeaderComponent={
        <View style={[styles.header, { borderBottomColor: theme.rule }]}>
          <Text style={[styles.brand, { color: theme.fg }]}>Broadsheet</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push("/add")}
              style={[styles.addButton, { borderColor: theme.rule }]}
              hitSlop={8}
            >
              <Text style={[styles.addButtonText, { color: theme.fgMuted }]}>
                +
              </Text>
            </Pressable>
            <Pressable onPress={() => signOut()} hitSlop={8}>
              <Text style={[styles.linkText, { color: theme.fgMuted }]}>
                Sign out
              </Text>
            </Pressable>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={[styles.subtitle, { color: theme.fgMuted }]}>
            {error ?? "No saved articles yet."}
          </Text>
        </View>
      }
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: theme.rule }]} />
      )}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/read/${item.id}`)}
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: theme.bgElevated },
          ]}
        >
          <Text
            style={[styles.rowTitle, { color: theme.fg }]}
            numberOfLines={2}
          >
            {item.title || item.url}
          </Text>
          <View style={styles.rowMetaRow}>
            {item.source ? (
              <Text style={[styles.rowMeta, { color: theme.fgMuted }]}>
                {item.source}
              </Text>
            ) : null}
            {item.readMinutes ? (
              <Text style={[styles.rowMeta, { color: theme.fgMuted }]}>
                {" · "}
                {item.readMinutes} min
              </Text>
            ) : null}
          </View>
          {item.excerpt ? (
            <Text
              style={[styles.rowExcerpt, { color: theme.fgMuted }]}
              numberOfLines={2}
            >
              {item.excerpt}
            </Text>
          ) : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  brand: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 15, textAlign: "center" },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    marginTop: 8,
  },
  primaryButtonText: { fontWeight: "600", fontSize: 15 },
  list: { paddingHorizontal: 20, paddingBottom: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { fontSize: 20, lineHeight: 22, marginTop: -2 },
  linkText: { fontSize: 14, fontWeight: "500" },
  separator: { height: StyleSheet.hairlineWidth, opacity: 0.7 },
  row: { paddingVertical: 16, gap: 4 },
  rowTitle: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  rowMetaRow: { flexDirection: "row" },
  rowMeta: { fontSize: 12 },
  rowExcerpt: { fontSize: 14, lineHeight: 19, marginTop: 2 },
});
