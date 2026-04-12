import type { ArticleSummary } from "./articles";
import type { Highlight } from "./highlights";
import type { Annotation } from "./annotations";

export type ExportFormat = "markdown" | "json" | "bibtex" | "text";

export interface ArticleExportData {
  article: ArticleSummary;
  highlights: Highlight[];
  annotations: Annotation[];
}

export function exportHighlightsMarkdown(data: ArticleExportData[]): string {
  const lines: string[] = ["# Highlights & annotations", ""];
  for (const { article, highlights, annotations } of data) {
    if (highlights.length === 0 && annotations.length === 0) continue;
    lines.push(`## ${article.title}`);
    lines.push("");
    if (article.source) lines.push(`Source: ${article.source}`);
    lines.push(`URL: ${article.url}`);
    lines.push(`Saved: ${article.savedAt.slice(0, 10)}`);
    lines.push("");

    for (const h of highlights) {
      lines.push(`> ${h.text}`);
      const linked = annotations.filter((a) => a.highlightId === h.id);
      for (const ann of linked) {
        lines.push("");
        lines.push(`*Note: ${ann.body}*`);
      }
      lines.push("");
    }

    const articleNotes = annotations.filter((a) => !a.highlightId);
    if (articleNotes.length > 0) {
      lines.push("### Notes");
      lines.push("");
      for (const ann of articleNotes) {
        lines.push(`- ${ann.body}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function exportHighlightsJson(data: ArticleExportData[]): string {
  const output = data.map(({ article, highlights, annotations }) => ({
    title: article.title,
    url: article.url,
    source: article.source,
    savedAt: article.savedAt,
    highlights: highlights.map((h) => ({
      text: h.text,
      createdAt: h.createdAt,
      annotations: annotations
        .filter((a) => a.highlightId === h.id)
        .map((a) => ({ body: a.body, createdAt: a.createdAt })),
    })),
    notes: annotations
      .filter((a) => !a.highlightId)
      .map((a) => ({ body: a.body, createdAt: a.createdAt })),
  }));
  return JSON.stringify(output, null, 2) + "\n";
}

export function exportHighlightsText(data: ArticleExportData[]): string {
  const lines: string[] = [];
  for (const { article, highlights, annotations } of data) {
    if (highlights.length === 0 && annotations.length === 0) continue;
    lines.push(article.title);
    lines.push(`(${article.url})`);
    lines.push("");

    for (const h of highlights) {
      lines.push(`  "${h.text}"`);
      const linked = annotations.filter((a) => a.highlightId === h.id);
      for (const ann of linked) {
        lines.push(`    Note: ${ann.body}`);
      }
    }

    const articleNotes = annotations.filter((a) => !a.highlightId);
    for (const ann of articleNotes) {
      lines.push(`  Note: ${ann.body}`);
    }

    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function escapeLatex(s: string): string {
  return s.replace(/[&%$#_{}~^\\]/g, (ch) => `\\${ch}`).replace(/\n/g, " ");
}

function domainToKey(url: string, savedAt: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").replace(/\./g, "");
    const year = savedAt.slice(0, 4);
    return `${host}${year}`;
  } catch {
    return `article${savedAt.slice(0, 4)}`;
  }
}

export function exportBibtex(articles: ArticleSummary[]): string {
  const entries: string[] = [];
  const usedKeys = new Set<string>();

  for (const a of articles) {
    let key = domainToKey(a.url, a.savedAt);
    if (usedKeys.has(key)) {
      let suffix = 2;
      while (usedKeys.has(`${key}${suffix}`)) suffix++;
      key = `${key}${suffix}`;
    }
    usedKeys.add(key);

    const fields: string[] = [];
    fields.push(`  title     = {${escapeLatex(a.title)}}`);
    if (a.byline) fields.push(`  author    = {${escapeLatex(a.byline)}}`);
    fields.push(`  url       = {${a.url}}`);
    if (a.source) fields.push(`  journal   = {${escapeLatex(a.source)}}`);
    fields.push(`  year      = {${a.savedAt.slice(0, 4)}}`);
    fields.push(`  note      = {Saved ${a.savedAt.slice(0, 10)}}`);

    entries.push(`@article{${key},\n${fields.join(",\n")}\n}`);
  }
  return entries.join("\n\n") + "\n";
}

export function exportArticles(
  format: ExportFormat,
  data: ArticleExportData[],
): string {
  switch (format) {
    case "markdown":
      return exportHighlightsMarkdown(data);
    case "json":
      return exportHighlightsJson(data);
    case "text":
      return exportHighlightsText(data);
    case "bibtex":
      return exportBibtex(data.map((d) => d.article));
  }
}
