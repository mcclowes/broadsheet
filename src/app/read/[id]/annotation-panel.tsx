"use client";

import { useState } from "react";
import type { Annotation } from "@/lib/annotations";
import type { Highlight } from "@/lib/highlights";
import styles from "./annotations.module.scss";

interface Props {
  articleId: string;
  initialAnnotations: Annotation[];
  highlights: Highlight[];
  selectedHighlightId: string | null;
}

export function AnnotationPanel({
  articleId,
  initialAnnotations,
  highlights,
  selectedHighlightId,
}: Props) {
  const [annotations, setAnnotations] =
    useState<Annotation[]>(initialAnnotations);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pending, setPending] = useState(false);

  const linkedHighlightId = selectedHighlightId ?? null;

  async function addAnnotation(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setPending(true);
    const res = await fetch(`/api/articles/${articleId}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, highlightId: linkedHighlightId }),
    });

    if (res.ok) {
      const { annotation } = await res.json();
      setAnnotations((prev) => [...prev, annotation]);
      setDraft("");
    }
    setPending(false);
  }

  async function updateAnnotation(annotationId: string) {
    const body = editDraft.trim();
    if (!body) return;

    setPending(true);
    const res = await fetch(
      `/api/articles/${articleId}/annotations/${annotationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      },
    );

    if (res.ok) {
      const { annotation } = await res.json();
      setAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? annotation : a)),
      );
      setEditingId(null);
      setEditDraft("");
    }
    setPending(false);
  }

  async function removeAnnotation(annotationId: string) {
    const res = await fetch(
      `/api/articles/${articleId}/annotations/${annotationId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    }
  }

  function startEditing(ann: Annotation) {
    setEditingId(ann.id);
    setEditDraft(ann.body);
  }

  function highlightTextFor(highlightId: string | null): string | null {
    if (!highlightId) return null;
    const h = highlights.find((hl) => hl.id === highlightId);
    return h?.text ?? null;
  }

  const articleNotes = annotations.filter((a) => !a.highlightId);
  const highlightNotes = annotations.filter((a) => a.highlightId);

  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>Notes</h3>

      <form onSubmit={addAnnotation} className={styles.addForm}>
        {linkedHighlightId && (
          <p className={styles.linkHint}>
            Linked to highlight:{" "}
            <em>{highlightTextFor(linkedHighlightId)?.slice(0, 60)}...</em>
          </p>
        )}
        <textarea
          className={styles.textarea}
          placeholder={
            linkedHighlightId
              ? "Add a note to this highlight..."
              : "Add a note about this article..."
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={pending}
          rows={3}
        />
        <button
          type="submit"
          className={styles.addButton}
          disabled={pending || !draft.trim()}
        >
          Add note
        </button>
      </form>

      {articleNotes.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Article notes</h4>
          {articleNotes.map((ann) => (
            <div key={ann.id} className={styles.note}>
              {editingId === ann.id ? (
                <div className={styles.editForm}>
                  <textarea
                    className={styles.textarea}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                  />
                  <div className={styles.editActions}>
                    <button
                      type="button"
                      className={styles.saveButton}
                      onClick={() => updateAnnotation(ann.id)}
                      disabled={pending}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className={styles.noteBody}>{ann.body}</p>
                  <div className={styles.noteActions}>
                    <button
                      type="button"
                      className={styles.noteAction}
                      onClick={() => startEditing(ann)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.noteAction}
                      onClick={() => removeAnnotation(ann.id)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {highlightNotes.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Highlight notes</h4>
          {highlightNotes.map((ann) => (
            <div key={ann.id} className={styles.note}>
              <p className={styles.highlightRef}>
                On: &ldquo;{highlightTextFor(ann.highlightId)?.slice(0, 80)}
                ...&rdquo;
              </p>
              {editingId === ann.id ? (
                <div className={styles.editForm}>
                  <textarea
                    className={styles.textarea}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                  />
                  <div className={styles.editActions}>
                    <button
                      type="button"
                      className={styles.saveButton}
                      onClick={() => updateAnnotation(ann.id)}
                      disabled={pending}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className={styles.noteBody}>{ann.body}</p>
                  <div className={styles.noteActions}>
                    <button
                      type="button"
                      className={styles.noteAction}
                      onClick={() => startEditing(ann)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.noteAction}
                      onClick={() => removeAnnotation(ann.id)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
