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
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
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
