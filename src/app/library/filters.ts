import type { LibraryView, ReadState } from "@/lib/articles";

export type LengthBucket = "any" | "short" | "medium" | "long";
export type SortKey = "newest" | "oldest" | "longest" | "shortest" | "title";

export interface CurrentFilters {
  view: LibraryView;
  state: ReadState;
  tag?: string;
  source?: string;
  length: LengthBucket;
  sort: SortKey;
  q?: string;
  page: number;
}

export type FilterOverrides = Partial<{
  view: LibraryView;
  state: ReadState;
  tag: string | null;
  source: string | null;
  length: LengthBucket;
  sort: SortKey;
  q: string | null;
  page: number;
}>;

export function filterLink(
  current: CurrentFilters,
  overrides: FilterOverrides,
): string {
  const params = new URLSearchParams();
  const view = overrides.view ?? current.view;
  const state = overrides.state ?? current.state;
  const tag =
    overrides.tag === null ? undefined : (overrides.tag ?? current.tag);
  const source =
    overrides.source === null
      ? undefined
      : (overrides.source ?? current.source);
  const length = overrides.length ?? current.length;
  const sort = overrides.sort ?? current.sort;
  const q = overrides.q === null ? undefined : (overrides.q ?? current.q);
  const filtersChanged =
    overrides.view !== undefined ||
    overrides.state !== undefined ||
    overrides.tag !== undefined ||
    overrides.source !== undefined ||
    overrides.length !== undefined ||
    overrides.q !== undefined;
  const page = overrides.page ?? (filtersChanged ? 1 : current.page);

  if (view !== "inbox") params.set("view", view);
  if (state !== "unread") params.set("state", state);
  if (tag) params.set("tag", tag);
  if (source) params.set("source", source);
  if (length !== "any") params.set("length", length);
  if (sort !== "newest") params.set("sort", sort);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));

  const qs = params.toString();
  return qs ? `/library?${qs}` : "/library";
}
