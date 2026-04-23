"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./annotator.module.scss";

let tempHighlightCounter = 0;
function nextOptimisticStamp() {
  tempHighlightCounter += 1;
  return {
    tempId: `tmp-${Date.now()}-${tempHighlightCounter}`,
    now: new Date().toISOString(),
  };
}

type HighlightColor = "yellow" | "green" | "blue" | "pink";

export interface Highlight {
  id: string;
  start: number;
  end: number;
  text: string;
  note: string | null;
  color: HighlightColor;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  articleId: string;
  html: string;
  initial: Highlight[];
}

interface Selection {
  start: number;
  end: number;
  text: string;
  rect: DOMRect;
}

export function Annotator({ articleId, html, initial }: Props) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>(initial);
  const [pending, setPending] = useState<Selection | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const render = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    paintHighlights(el, highlights);
  }, [highlights]);

  useEffect(() => {
    render();
  }, [render]);

  // Mobile browsers don't fire `mouseup` when text is selected via the native
  // touch selection handles, so listen to `selectionchange` on document — that
  // fires for both mouse and touch. It fires on every tick while the user
  // drags a selection handle, hence the debounce.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const readSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPending(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) {
        setPending(null);
        return;
      }
      const offsets = rangeToOffsets(el, range);
      if (!offsets) return;
      const text = sel.toString().trim();
      if (!text) return;
      setPending({
        start: offsets.start,
        end: offsets.end,
        text,
        rect: range.getBoundingClientRect(),
      });
      setActive(null);
    };

    let timer: number | null = null;
    const onSelectionChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        readSelection();
      }, 250);
    };
    // pointerup covers both mouse-up and touch-end, giving us an immediate
    // read once the user releases — the debounced selectionchange is the
    // safety net for cases where pointerup is suppressed (e.g. iOS handles).
    const onPointerUp = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      // Defer one frame so the selection has settled before we measure it.
      window.requestAnimationFrame(readSelection);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerup", onPointerUp);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setPending(null);
  };

  const createHighlight = async (color: HighlightColor) => {
    if (!pending) return;
    setError(null);

    // Paint immediately with a temp id so the user sees the colour on the
    // page as soon as they pick a swatch — reconcile with the server id once
    // the POST resolves, and revert if it fails.
    const { tempId, now } = nextOptimisticStamp();
    const optimistic: Highlight = {
      id: tempId,
      start: pending.start,
      end: pending.end,
      text: pending.text,
      note: null,
      color,
      createdAt: now,
      updatedAt: now,
    };
    setHighlights((prev) => [...prev, optimistic]);
    clearSelection();

    const revert = () =>
      setHighlights((prev) => prev.filter((h) => h.id !== tempId));

    try {
      const res = await fetch(`/api/articles/${articleId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: optimistic.start,
          end: optimistic.end,
          text: optimistic.text,
          color,
        }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        setError(p.error ?? `Failed (${res.status})`);
        revert();
        return;
      }
      const { highlight } = (await res.json()) as { highlight: Highlight };
      setHighlights((prev) =>
        prev.map((h) => (h.id === tempId ? highlight : h)),
      );
    } catch {
      setError("Network error");
      revert();
    }
  };

  const activeHighlight = highlights.find((h) => h.id === active) ?? null;

  const saveNote = async (id: string, note: string | null) => {
    setError(null);
    const res = await fetch(`/api/articles/${articleId}/annotations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch: { note } }),
    });
    if (!res.ok) {
      const p = await res.json().catch(() => ({}));
      setError(p.error ?? `Failed (${res.status})`);
      return;
    }
    const { highlight } = (await res.json()) as { highlight: Highlight };
    setHighlights((prev) =>
      prev.map((h) => (h.id === highlight.id ? highlight : h)),
    );
  };

  const removeHighlight = async (id: string) => {
    setError(null);
    const res = await fetch(
      `/api/articles/${articleId}/annotations?hid=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const p = await res.json().catch(() => ({}));
      setError(p.error ?? `Failed (${res.status})`);
      return;
    }
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    setActive(null);
  };

  const onClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const mark = target.closest<HTMLElement>("[data-highlight-id]");
    if (mark) {
      setActive(mark.dataset.highlightId ?? null);
      setPending(null);
    }
  }, []);

  return (
    <>
      <article
        ref={(el) => {
          containerRef.current = el;
        }}
        className="reader-body"
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {pending ? (
        <div
          className={styles.toolbar}
          // Positioning is consumed via CSS vars so the narrow-viewport
          // media query in the stylesheet can dock the toolbar to the
          // bottom of the screen instead, without fighting inline styles.
          style={
            {
              // Prefer above the selection; flip below when there isn't room
              // (e.g. selection near the top of the viewport on mobile).
              "--toolbar-top": `${
                pending.rect.top < 56
                  ? pending.rect.bottom + window.scrollY + 8
                  : pending.rect.top + window.scrollY - 44
              }px`,
              "--toolbar-left": `${Math.max(
                8 + window.scrollX,
                pending.rect.left + window.scrollX,
              )}px`,
            } as React.CSSProperties
          }
          role="toolbar"
          aria-label="Create highlight"
        >
          {(["yellow", "green", "blue", "pink"] as HighlightColor[]).map(
            (c) => (
              <button
                key={c}
                type="button"
                className={styles.swatch}
                data-color={c}
                aria-label={`Highlight ${c}`}
                onClick={() => createHighlight(c)}
              />
            ),
          )}
          <button
            type="button"
            className={styles.close}
            aria-label="Cancel"
            onClick={clearSelection}
          >
            ×
          </button>
        </div>
      ) : null}

      {activeHighlight ? (
        <NotePanel
          key={activeHighlight.id}
          highlight={activeHighlight}
          onSave={saveNote}
          onRemove={() => removeHighlight(activeHighlight.id)}
          onClose={() => setActive(null)}
        />
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function NotePanel({
  highlight,
  onSave,
  onRemove,
  onClose,
}: {
  highlight: Highlight;
  onSave: (id: string, note: string | null) => void | Promise<void>;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(highlight.note ?? "");
  return (
    <aside className={styles.notePanel} aria-label="Edit highlight">
      <blockquote className={styles.quote}>{highlight.text}</blockquote>
      <textarea
        className={styles.noteInput}
        placeholder="Add a note…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={4000}
      />
      <div className={styles.noteActions}>
        <button
          type="button"
          onClick={() => onSave(highlight.id, draft.trim() || null)}
        >
          Save note
        </button>
        <button type="button" className={styles.danger} onClick={onRemove}>
          Remove
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </aside>
  );
}

function rangeToOffsets(
  root: HTMLElement,
  range: Range,
): { start: number; end: number } | null {
  const start = nodeOffsetToPlain(
    root,
    range.startContainer,
    range.startOffset,
  );
  const end = nodeOffsetToPlain(root, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

function nodeOffsetToPlain(
  root: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current === node) return total + offset;
    total += (current.textContent ?? "").length;
    current = walker.nextNode();
  }
  // Element node (e.g. selection ending in an element): approximate via its
  // own textContent walk up to `offset` children.
  if (node.nodeType === Node.ELEMENT_NODE && root.contains(node)) {
    const el = node as HTMLElement;
    const before = Array.from(el.childNodes)
      .slice(0, offset)
      .map((n) => n.textContent ?? "")
      .join("").length;
    return nodeOffsetToPlain(root, el, 0) !== null
      ? (nodeOffsetToPlain(root, el, 0) as number) + before
      : null;
  }
  return null;
}

function paintHighlights(root: HTMLElement, highlights: Highlight[]) {
  // Remove any previously painted marks.
  root.querySelectorAll("mark[data-highlight-id]").forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });

  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  for (const h of sorted) {
    wrapRange(root, h);
  }
}

function wrapRange(root: HTMLElement, h: Highlight) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  let n: Node | null = walker.nextNode();
  while (n) {
    const text = n as Text;
    const len = text.data.length;
    if (!startNode && pos + len > h.start) {
      startNode = text;
      startOffset = h.start - pos;
    }
    if (!endNode && pos + len >= h.end) {
      endNode = text;
      endOffset = h.end - pos;
      break;
    }
    pos += len;
    n = walker.nextNode();
  }
  if (!startNode || !endNode) return;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    // Surround only works for ranges inside a single parent; fall back to a
    // manual wrap across nodes if it throws.
    const mark = document.createElement("mark");
    mark.dataset.highlightId = h.id;
    mark.dataset.color = h.color;
    try {
      range.surroundContents(mark);
    } catch {
      // Cross-element selection — split into per-text-node marks.
      wrapCrossNode(root, h);
    }
  } catch {
    // Range construction failed — skip this highlight silently.
  }
}

function wrapCrossNode(root: HTMLElement, h: Highlight) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  const toWrap: { node: Text; start: number; end: number }[] = [];
  let n: Node | null = walker.nextNode();
  while (n) {
    const text = n as Text;
    const len = text.data.length;
    const nodeStart = pos;
    const nodeEnd = pos + len;
    if (nodeEnd > h.start && nodeStart < h.end) {
      toWrap.push({
        node: text,
        start: Math.max(0, h.start - nodeStart),
        end: Math.min(len, h.end - nodeStart),
      });
    }
    pos = nodeEnd;
    if (pos >= h.end) break;
    n = walker.nextNode();
  }

  for (const { node, start, end } of toWrap) {
    if (start >= end) continue;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const mark = document.createElement("mark");
    mark.dataset.highlightId = h.id;
    mark.dataset.color = h.color;
    try {
      range.surroundContents(mark);
    } catch {
      // Skip — shouldn't happen since we split per text node.
    }
  }
}
