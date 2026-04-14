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

import { useApi } from "@/lib/use-api";
import type { ArticleSummary } from "@/lib/api";

export default function LibraryScreen() {
  return (
    <View style={styles.container}>
      <SignedIn>
        <Library />
      </SignedIn>
      <SignedOut>
        <SignedOutView />
      </SignedOut>
    </View>
  );
}

function SignedOutView() {
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Broadsheet</Text>
      <Text style={styles.subtitle}>Sign in to see your library.</Text>
      <Link href="/sign-in" asChild>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Sign in</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function Library() {
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
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={articles ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Library</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push("/add")}>
              <Text style={styles.linkText}>Add</Text>
            </Pressable>
            <Pressable onPress={() => signOut()}>
              <Text style={styles.linkText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.subtitle}>
            {error ?? "No saved articles yet."}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/read/${item.id}`)}
          style={styles.row}
        >
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.title || item.url}
          </Text>
          {item.siteName ? (
            <Text style={styles.rowMeta}>{item.siteName}</Text>
          ) : null}
          {item.excerpt ? (
            <Text style={styles.rowExcerpt} numberOfLines={2}>
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
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 15, opacity: 0.6, textAlign: "center" },
  primaryButton: {
    backgroundColor: "#111",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 8,
  },
  primaryButtonText: { color: "white", fontWeight: "600" },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  headerTitle: { fontSize: 28, fontWeight: "700" },
  headerActions: { flexDirection: "row", gap: 16 },
  linkText: { color: "#0a7", fontWeight: "600" },
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#8884",
    gap: 4,
  },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowMeta: { fontSize: 12, opacity: 0.6 },
  rowExcerpt: { fontSize: 13, opacity: 0.75 },
});
