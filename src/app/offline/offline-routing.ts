// The SW serves /offline's HTML when an auth-gated navigation (e.g.
// /read/:id) fails. The browser keeps the original URL — so this page
// switches into reader mode by sniffing window.location.pathname. Article
// IDs are sha256 truncated to 32 hex chars (see `articleIdForUrl`).
const READ_PATH_RE = /^\/read\/([a-f0-9]{32})\/?$/;

export function parseOfflineReaderPath(pathname: string): string | null {
  const match = pathname.match(READ_PATH_RE);
  return match ? match[1] : null;
}
