/**
 * Pure helpers for the library list swipe-to-toggle-read gesture.
 * Kept in a separate module so they can be unit-tested without pulling in
 * React / Next client-only code.
 */

/** Horizontal distance (px) past which a swipe commits the toggle. */
export const SWIPE_COMMIT_PX = 80;

/** Horizontal distance (px) before we start treating the gesture as a swipe. */
export const SWIPE_START_PX = 8;

/** Max vertical drift relative to horizontal before we bail out as a scroll. */
export const VERTICAL_CANCEL_RATIO = 0.75;

export function shouldCommitSwipe(deltaX: number): boolean {
  return Math.abs(deltaX) >= SWIPE_COMMIT_PX;
}

export function isHorizontalSwipe(deltaX: number, deltaY: number): boolean {
  if (Math.abs(deltaX) < SWIPE_START_PX) return false;
  return Math.abs(deltaY) <= Math.abs(deltaX) * VERTICAL_CANCEL_RATIO;
}
