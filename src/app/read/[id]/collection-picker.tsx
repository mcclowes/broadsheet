"use client";

import { useState, useEffect } from "react";
import styles from "./read.module.scss";

interface CollectionStub {
  id: string;
  name: string;
}

interface Props {
  articleId: string;
  initialCollections: CollectionStub[];
}

export function CollectionPicker({ articleId, initialCollections }: Props) {
  const [memberOf, setMemberOf] =
    useState<CollectionStub[]>(initialCollections);
  const [allCollections, setAllCollections] = useState<CollectionStub[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/collections")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.collections)) {
          setAllCollections(
            data.collections.map((c: CollectionStub) => ({
              id: c.id,
              name: c.name,
            })),
          );
        }
      })
      .catch(() => {});
  }, [open]);

  async function toggle(collection: CollectionStub) {
    setPending(true);
    const isMember = memberOf.some((c) => c.id === collection.id);

    const res = await fetch(`/api/collections/${collection.id}/articles`, {
      method: isMember ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId }),
    });

    if (res.ok) {
      setMemberOf((prev) =>
        isMember
          ? prev.filter((c) => c.id !== collection.id)
          : [...prev, collection],
      );
    }
    setPending(false);
  }

  return (
    <div className={styles.collectionPicker}>
      {memberOf.length > 0 && (
        <div className={styles.tagRow}>
          {memberOf.map((c) => (
            <span key={c.id} className={styles.tag}>
              {c.name}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        className={styles.actionButton}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close" : "Collections"}
      </button>

      {open && (
        <div className={styles.collectionDropdown}>
          {allCollections.length === 0 ? (
            <p className={styles.collectionEmpty}>
              No collections yet. Create one from the collections page.
            </p>
          ) : (
            <ul className={styles.collectionList}>
              {allCollections.map((c) => {
                const isMember = memberOf.some((m) => m.id === c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={
                        isMember
                          ? styles.collectionItemActive
                          : styles.collectionItem
                      }
                      onClick={() => toggle(c)}
                      disabled={pending}
                    >
                      {isMember ? "✓ " : ""}
                      {c.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
