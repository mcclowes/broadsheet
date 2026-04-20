"use client";

import { useState } from "react";
import { SourceMark } from "@/components/source-mark";
import styles from "./library.module.scss";

interface Props {
  image: string | null;
  source: string | null;
  readMinutes: number;
}

export function LibraryThumb({ image, source, readMinutes }: Props) {
  const [failed, setFailed] = useState(false);

  if (image && !failed) {
    // Route through /api/image so the upstream is SSRF-checked, size-capped,
    // and cached at the edge — a library with 50 items would otherwise pull
    // dozens of multi-MB hero images straight from publisher CDNs.
    const proxied = `/api/image?url=${encodeURIComponent(image)}`;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxied}
        alt=""
        className={styles.thumbImage}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <SourceMark source={source} showSourceLabel meta={`${readMinutes}'`} />
  );
}
