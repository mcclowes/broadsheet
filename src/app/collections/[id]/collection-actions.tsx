"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../collections.module.scss";

interface Props {
  collectionId: string;
}

export function CollectionActions({ collectionId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setPending(true);
    const res = await fetch(`/api/collections/${collectionId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/collections");
    }
    setPending(false);
  }

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={
          confirmDelete ? styles.deleteButtonConfirm : styles.deleteButton
        }
        onClick={handleDelete}
        disabled={pending}
      >
        {confirmDelete ? "Confirm delete" : "Delete collection"}
      </button>
      {confirmDelete && (
        <button
          type="button"
          className={styles.cancelButton}
          onClick={() => setConfirmDelete(false)}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
