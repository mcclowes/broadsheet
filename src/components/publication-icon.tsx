"use client";

import { useState } from "react";
import styles from "./publication-icon.module.scss";

function faviconUrl(articleUrl: string): string | null {
  try {
    const { origin } = new URL(articleUrl);
    return `${origin}/favicon.ico`;
  } catch {
    return null;
  }
}

export function PublicationIcon({
  url,
  size = 16,
}: {
  url: string;
  size?: number;
}) {
  const src = faviconUrl(url);
  const [hidden, setHidden] = useState(!src);

  if (hidden || !src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={styles.icon}
      loading="lazy"
      onError={() => setHidden(true)}
    />
  );
}
