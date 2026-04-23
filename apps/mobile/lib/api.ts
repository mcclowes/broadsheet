import Constants from "expo-constants";

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "https://broadsheet.marginalutility.dev";

export type ArticleSummary = {
  id: string;
  url: string;
  title: string;
  source: string | null;
  byline: string | null;
  excerpt: string | null;
  image: string | null;
  wordCount: number;
  readMinutes: number;
  savedAt: string;
  readAt: string | null;
  archivedAt: string | null;
  tags: string[];
};

export type Article = ArticleSummary & { body: string };

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export function createApi(getToken: () => Promise<string | null>) {
  const fetcher: Fetcher = async (path, init = {}) => {
    const token = await getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", "application/json");
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(res.status, body || res.statusText);
    }
    return res;
  };

  return {
    async listArticles(params?: {
      archived?: boolean;
      read?: boolean;
    }): Promise<ArticleSummary[]> {
      const qs = new URLSearchParams();
      if (params?.archived !== undefined)
        qs.set("archived", String(params.archived));
      if (params?.read !== undefined) qs.set("read", String(params.read));
      const res = await fetcher(
        `/api/articles${qs.toString() ? `?${qs}` : ""}`,
      );
      const json = (await res.json()) as { articles: ArticleSummary[] };
      return json.articles;
    },

    async getArticle(id: string): Promise<Article> {
      const res = await fetcher(`/api/articles/${id}`);
      const json = (await res.json()) as { article: Article };
      return json.article;
    },

    async saveArticle(
      url: string,
    ): Promise<{ article: ArticleSummary; created: boolean }> {
      const res = await fetcher(`/api/articles`, {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      return (await res.json()) as {
        article: ArticleSummary;
        created: boolean;
      };
    },

    async patchArticle(
      id: string,
      patch: { read?: boolean; archived?: boolean; tags?: string[] },
    ): Promise<ArticleSummary> {
      const res = await fetcher(`/api/articles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { article: ArticleSummary };
      return json.article;
    },
  };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const API_BASE_URL = API_BASE;
