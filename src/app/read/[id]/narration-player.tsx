"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./read.module.scss";

type Status = "idle" | "loading" | "playing" | "paused" | "error";

interface Props {
  articleId: string;
}

export function NarrationPlayer({ articleId }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch(`/api/articles/${articleId}/narration`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      setTruncated(res.headers.get("X-Narration-Truncated") === "true");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener("ended", () => setStatus("idle"));
      audio.addEventListener("error", () => {
        setStatus("error");
        setError("Playback failed");
      });

      await audio.play();
      setStatus("playing");
    } catch (err) {
      setStatus("error");
      setError((err as Error).message);
    }
  }, [articleId]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio || status === "idle" || status === "error") {
      load();
      return;
    }
    if (status === "playing") {
      audio.pause();
      setStatus("paused");
    } else if (status === "paused") {
      audio.play();
      setStatus("playing");
    }
  }

  const label =
    status === "loading"
      ? "Loading…"
      : status === "playing"
        ? "Pause narration"
        : status === "paused"
          ? "Resume narration"
          : "Listen";

  return (
    <div className={styles.narration}>
      <button
        type="button"
        className={styles.narrationButton}
        onClick={toggle}
        disabled={status === "loading"}
      >
        {label}
      </button>
      {truncated && status !== "idle" ? (
        <span className={styles.narrationNote}>
          Article was too long — narrating an excerpt.
        </span>
      ) : null}
      {error ? <span className={styles.narrationError}>{error}</span> : null}
    </div>
  );
}
