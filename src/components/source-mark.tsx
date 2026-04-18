import { sourceInitial, sourcePalette } from "@/lib/library-stats";
import styles from "./source-mark.module.scss";

type Size = "sm" | "md" | "lg";

interface Props {
  source: string | null | undefined;
  size?: Size;
  /** Short label rendered along the bottom-right of the tile (eg. "15'"). */
  meta?: string;
  /** Whether to show the source name across the bottom of the tile. */
  showSourceLabel?: boolean;
}

export function SourceMark({
  source,
  size = "md",
  meta,
  showSourceLabel = false,
}: Props) {
  const name = source?.trim() || "?";
  const palette = sourcePalette(name);
  const initial = sourceInitial(name);

  return (
    <span
      className={`${styles.mark} ${styles[size]}`}
      style={{
        // Custom props consumed by the module so the stripe overlay can
        // tint itself off the same hue without re-deriving the hash in CSS.
        ["--source-bg" as string]: palette.bg,
        ["--source-fg" as string]: palette.fg,
      }}
      aria-hidden="true"
    >
      <span className={styles.stripes} />
      <span className={styles.glyph}>{initial}</span>
      {showSourceLabel ? (
        <span className={styles.sourceLabel}>{name}</span>
      ) : null}
      {meta ? <span className={styles.meta}>{meta}</span> : null}
    </span>
  );
}
