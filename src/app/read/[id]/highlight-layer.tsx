"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Highlight } from "@/lib/highlights";
import styles from "./highlights.module.scss";

interface Props {
  articleId: string;
  articleBody: string;
  initialHighlights: Highlight[];
  children: React.ReactNode;
  onHighlightSelect?: (highlightId: string) => void;
}

export function HighlightLayer({
  articleId,
  articleBody,
  initialHighlights,
  children,
  onHighlightSelect,
}: Props) {
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [popover, setPopover] = useState<{
    x: number;
    y: number;
    text: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const applyHighlights = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    // Remove existing marks
    el.querySelectorAll("mark[data-hl]").forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    });

    if (highlights.length === 0) return;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes: { node: Text; start: number; end: number }[] = [];
    let offset = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const len = node.textContent?.length ?? 0;
      textNodes.push({ node, start: offset, end: offset + len });
      offset += len;
    }

    const fullText = textNodes.map((t) => t.node.textContent ?? "").join("");

    // Sort highlights by startOffset descending so we apply from end to start
    // to avoid invalidating offsets
    const sorted = [...highlights].sort(
      (a, b) => b.startOffset - a.startOffset,
    );

    for (const hl of sorted) {
      // Try offset-based first, fall back to text search
      let matchStart = hl.startOffset;
      let matchEnd = hl.endOffset;

      const bodySlice = fullText.slice(matchStart, matchEnd);
      if (bodySlice !== hl.text) {
        // Fallback: find by text
        const idx = fullText.indexOf(hl.text);
        if (idx === -1) continue;
        matchStart = idx;
        matchEnd = idx + hl.text.length;
      }

      for (const tn of textNodes) {
        if (tn.end <= matchStart || tn.start >= matchEnd) continue;

        const nodeStart = Math.max(matchStart - tn.start, 0);
        const nodeEnd = Math.min(matchEnd - tn.start, tn.node.length);

        if (nodeStart >= nodeEnd) continue;

        const range = document.createRange();
        range.setStart(tn.node, nodeStart);
        range.setEnd(tn.node, nodeEnd);

        const mark = document.createElement("mark");
        mark.setAttribute("data-hl", hl.id);
        mark.className = styles.highlight;
        mark.addEventListener("click", () => onHighlightSelect?.(hl.id));

        try {
          range.surroundContents(mark);
        } catch {
          // surroundContents fails if range crosses element boundaries
          continue;
        }
        break; // only highlight first matching text node range
      }
    }
  }, [highlights, onHighlightSelect]);

  useEffect(() => {
    applyHighlights();
  }, [applyHighlights]);

  function handleMouseUp() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !contentRef.current) {
      setPopover(null);
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 3) {
      setPopover(null);
      return;
    }

    // Ensure selection is within our content
    const range = selection.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      setPopover(null);
      return;
    }

    // Calculate offset in the full text of the content element
    const startOffset = articleBody.indexOf(text);
    const endOffset = startOffset === -1 ? -1 : startOffset + text.length;

    const rect = range.getBoundingClientRect();
    const containerRect = contentRef.current.getBoundingClientRect();

    setPopover({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
      text,
      startOffset: Math.max(0, startOffset),
      endOffset: endOffset === -1 ? text.length : endOffset,
    });
  }

  async function saveHighlight() {
    if (!popover) return;

    const res = await fetch(`/api/articles/${articleId}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: popover.text,
        startOffset: popover.startOffset,
        endOffset: popover.endOffset,
      }),
    });

    if (res.ok) {
      const { highlight } = await res.json();
      setHighlights((prev) => [...prev, highlight]);
      window.getSelection()?.removeAllRanges();
    }
    setPopover(null);
  }

  async function removeHighlightById(highlightId: string) {
    const res = await fetch(
      `/api/articles/${articleId}/highlights/${highlightId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
    }
  }

  return (
    <div className={styles.highlightLayer} style={{ position: "relative" }}>
      <div
        ref={contentRef}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
      >
        {children}
      </div>

      {popover && (
        <div
          className={styles.popover}
          style={{
            position: "absolute",
            left: popover.x,
            top: popover.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <button
            type="button"
            className={styles.highlightButton}
            onClick={saveHighlight}
          >
            Highlight
          </button>
        </div>
      )}

      {highlights.length > 0 && (
        <aside className={styles.highlightList}>
          <h3 className={styles.highlightListTitle}>
            Highlights ({highlights.length})
          </h3>
          <ul className={styles.highlightItems}>
            {highlights.map((h) => (
              <li key={h.id} className={styles.highlightItem}>
                <blockquote
                  className={styles.highlightQuote}
                  onClick={() => onHighlightSelect?.(h.id)}
                >
                  {h.text}
                </blockquote>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeHighlightById(h.id)}
                  aria-label="Remove highlight"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
