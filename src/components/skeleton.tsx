import type { CSSProperties } from "react";
import styles from "./skeleton.module.scss";

type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
};

function toCssSize(v: string | number | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "number" ? `${v}px` : v;
}

export function Skeleton({
  width,
  height,
  radius,
  circle,
  className,
  style,
  ariaLabel,
}: SkeletonProps) {
  const composed: CSSProperties = {
    width: toCssSize(width),
    height: toCssSize(height),
    borderRadius: toCssSize(radius),
    ...style,
  };
  const classes = [styles.skeleton, circle ? styles.circle : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={classes}
      style={composed}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? "status" : undefined}
    />
  );
}

export function SkeletonText({
  width = "100%",
  height = "1em",
  className,
  style,
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Skeleton
      width={width}
      height={height}
      className={className}
      style={style}
    />
  );
}
