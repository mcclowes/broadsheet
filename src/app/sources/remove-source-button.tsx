"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./sources.module.scss";

export function RemoveSourceButton({
  sourceId,
  sourceTitle,
}: {
  sourceId: string;
  sourceTitle: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handleRemove() {
    if (
      !confirm(
        `Unfollow ${sourceTitle}? Already-saved articles will stay in your library.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/sources/${sourceId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Could not remove source");
      return;
    }
    startTransition(() => router.push("/sources"));
  }

  return (
    <button
      type="button"
      className={styles.removeButton}
      onClick={handleRemove}
      disabled={pending}
    >
      {pending ? "Removing…" : "Unfollow"}
    </button>
  );
}
