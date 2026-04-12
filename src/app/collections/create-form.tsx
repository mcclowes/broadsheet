"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./collections.module.scss";

export function CreateCollectionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;

    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        description: description.trim() || undefined,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? `Failed (${res.status})`);
      return;
    }

    setName("");
    setDescription("");
    startTransition(() => router.refresh());
  }

  return (
    <form className={styles.createForm} onSubmit={handleSubmit}>
      <input
        className={styles.createInput}
        type="text"
        placeholder="Collection name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        disabled={pending}
        maxLength={100}
      />
      <input
        className={styles.createInput}
        type="text"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={pending}
        maxLength={500}
      />
      <button
        className={styles.createButton}
        type="submit"
        disabled={pending || !name.trim()}
      >
        {pending ? "Creating..." : "Create"}
      </button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  );
}
