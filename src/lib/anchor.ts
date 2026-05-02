import { JSDOM } from "jsdom";
import { renderMarkdown } from "./markdown";

export interface AnchorMatch {
  start: number;
  end: number;
}

/**
 * Plain text in the offset space used by `highlightSchema.start`/`end` —
 * i.e. the concatenation of all text-node `textContent` inside the
 * rendered article body. Mirrors the browser-side TreeWalker approach
 * used by `paintHighlights`/`rangeToOffsets` in the reader so server and
 * client agree on positions.
 */
export function articlePlainText(markdown: string): string {
  const html = renderMarkdown(markdown);
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  return dom.window.document.body.textContent ?? "";
}

/**
 * Try to anchor `selectionText` to a character range in the rendered
 * article. Returns null if the text isn't found verbatim — callers
 * should fall back to an unanchored highlight in that case.
 *
 * Whitespace differences between `Selection.toString()` and a TreeWalker
 * walk over text nodes mean we can miss across-element selections. That's
 * acceptable: a miss just downgrades to an unanchored highlight.
 */
export function anchorSelection(
  markdown: string,
  selectionText: string,
): AnchorMatch | null {
  const trimmed = selectionText.trim();
  if (!trimmed) return null;
  const plain = articlePlainText(markdown);
  const idx = plain.indexOf(trimmed);
  if (idx === -1) return null;
  return { start: idx, end: idx + trimmed.length };
}
