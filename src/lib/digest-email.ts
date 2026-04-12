import type { ArticleSummary } from "./articles";

// ── Design tokens (mirroring globals.scss / page.module.scss) ───────

const C = {
  bg: "#fafaf7",
  fg: "#1a1a1a",
  fgMuted: "#6b6b6b",
  accent: "#b4451f",
  rule: "#e4e2dc",
  white: "#ffffff",
} as const;

const FONT_SERIF = "Georgia, 'Palatino Linotype', Palatino, serif";
const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

// ── Helpers ─────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatEditionDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function storyMeta(a: ArticleSummary): string {
  return `${formatShortDate(a.savedAt)} &middot; ${a.readMinutes} min read`;
}

// ── Section builders ────────────────────────────────────────────────

function mastheadHtml(date: Date, storyCount: number, baseUrl: string): string {
  const dateStr = formatEditionDate(date);
  const stories = `${storyCount} ${storyCount === 1 ? "story" : "stories"}`;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:3px double ${C.fg};border-bottom:3px double ${C.fg};margin-bottom:32px;">
      <tr><td style="padding:20px 8px 0;text-align:center;">
        <div style="font-family:${FONT_SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${C.fgMuted};">Vol. I</div>
        <h1 style="font-family:${FONT_SERIF};font-size:48px;font-weight:900;letter-spacing:-0.02em;line-height:1;margin:8px 0;">
          <a href="${esc(baseUrl)}" style="color:${C.fg};text-decoration:none;">Broadsheet</a>
        </h1>
        <p style="margin:8px 0 16px;font-style:italic;font-size:15px;color:${C.fgMuted};font-family:${FONT_SERIF};">
          &ldquo;All the articles worth reading.&rdquo;
        </p>
      </td></tr>
      <tr><td style="border-top:1px solid ${C.fg};padding:8px;text-align:center;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-family:${FONT_SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${C.fg};text-align:left;">${esc(dateStr)}</td>
            <td style="font-family:${FONT_SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${C.fg};font-weight:600;text-align:center;">Your daily edition</td>
            <td style="font-family:${FONT_SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${C.fg};text-align:right;">${esc(stories)} on the wire</td>
          </tr>
        </table>
      </td></tr>
    </table>`;
}

function leadHtml(a: ArticleSummary, baseUrl: string): string {
  const url = `${baseUrl}/read/${esc(a.id)}`;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-bottom:32px;border-bottom:1px solid ${C.fg};">
      <tr><td>
        ${a.source ? `<div style="font-family:${FONT_SANS};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${C.accent};margin-bottom:8px;">${esc(a.source)}</div>` : ""}
        <a href="${url}" style="text-decoration:none;color:${C.fg};">
          <h2 style="font-family:${FONT_SERIF};font-size:36px;font-weight:800;line-height:1.05;letter-spacing:-0.015em;margin:0 0 12px;">${esc(a.title)}</h2>
        </a>
        ${a.byline ? `<p style="font-family:${FONT_SANS};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:${C.fgMuted};margin:0 0 16px;">By ${esc(a.byline)}</p>` : ""}
        ${a.excerpt ? `<p style="font-family:${FONT_SERIF};font-size:19px;line-height:1.55;color:${C.fg};margin:0 0 16px;max-width:540px;">${esc(a.excerpt)}</p>` : ""}
        <p style="font-family:${FONT_SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${C.fgMuted};margin:0;">${storyMeta(a)}</p>
      </td></tr>
    </table>`;
}

function secondaryRowHtml(articles: ArticleSummary[], baseUrl: string): string {
  if (articles.length === 0) return "";
  // 2-column table layout for email compatibility
  const cells = articles.map((a) => {
    const url = `${baseUrl}/read/${esc(a.id)}`;
    return `
      <td style="vertical-align:top;padding:0 16px;width:${Math.floor(100 / Math.min(articles.length, 2))}%;border-left:1px solid ${C.rule};">
        ${a.source ? `<div style="font-family:${FONT_SANS};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${C.accent};margin-bottom:8px;">${esc(a.source)}</div>` : ""}
        <a href="${url}" style="text-decoration:none;color:${C.fg};">
          <h3 style="font-family:${FONT_SERIF};font-size:22px;font-weight:700;line-height:1.2;margin:0 0 8px;letter-spacing:-0.01em;">${esc(a.title)}</h3>
        </a>
        ${a.excerpt ? `<p style="font-family:${FONT_SERIF};font-size:15px;line-height:1.5;color:${C.fgMuted};margin:0 0 10px;">${esc(a.excerpt)}</p>` : ""}
        <p style="font-family:${FONT_SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${C.fgMuted};margin:0;">${storyMeta(a)}</p>
      </td>`;
  });

  // Split into rows of 2 for better email rendering
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const pair = cells.slice(i, i + 2);
    rows.push(`<tr>${pair.join("")}</tr>`);
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 0;border-bottom:1px solid ${C.fg};">
      ${rows.join("")}
    </table>`;
}

function wireHtml(articles: ArticleSummary[], baseUrl: string): string {
  if (articles.length === 0) return "";
  const items = articles
    .map((a) => {
      const url = `${baseUrl}/read/${esc(a.id)}`;
      const sourceBit = a.source ? `${esc(a.source)} &middot; ` : "";
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${C.rule};">
          <a href="${url}" style="text-decoration:none;color:${C.fg};">
            <div style="font-family:${FONT_SERIF};font-size:17px;font-weight:700;line-height:1.25;letter-spacing:-0.005em;margin-bottom:4px;">${esc(a.title)}</div>
          </a>
          <div style="font-family:${FONT_SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${C.fgMuted};">${sourceBit}${storyMeta(a)}</div>
        </td>
      </tr>`;
    })
    .join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-top:32px;">
      <tr><td>
        <h4 style="font-family:${FONT_SANS};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${C.fg};margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid ${C.fg};">More from the wire</h4>
      </td></tr>
      ${items}
    </table>`;
}

function footerHtml(baseUrl: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:48px;padding-top:24px;border-top:1px solid ${C.rule};">
      <tr><td style="text-align:center;font-family:${FONT_SANS};font-size:12px;color:${C.fgMuted};line-height:1.6;">
        <a href="${esc(baseUrl)}" style="color:${C.accent};text-decoration:none;">Open Broadsheet</a>
        &nbsp;&middot;&nbsp;
        <a href="${esc(baseUrl)}/library" style="color:${C.accent};text-decoration:none;">Library</a>
        <br>
        You&rsquo;re receiving this because you enabled the daily digest.
        <br>
        <a href="${esc(baseUrl)}/library" style="color:${C.fgMuted};text-decoration:underline;">Unsubscribe</a>
      </td></tr>
    </table>`;
}

function emptyHtml(baseUrl: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:64px 16px;text-align:center;font-family:${FONT_SERIF};font-size:18px;font-style:italic;color:${C.fgMuted};">
        No unread stories on the wire. Save something to your
        <a href="${esc(baseUrl)}/library" style="color:${C.accent};">library</a>!
      </td></tr>
    </table>`;
}

// ── Main export ─────────────────────────────────────────────────────

export interface DigestEmailOptions {
  articles: ArticleSummary[];
  date?: Date;
  baseUrl: string;
}

export function buildDigestHtml(opts: DigestEmailOptions): string {
  const { articles, baseUrl } = opts;
  const date = opts.date ?? new Date();
  const lead = articles[0] as ArticleSummary | undefined;
  const secondary = articles.slice(1, 5);
  const wire = articles.slice(5, 17);
  const storyCount = articles.length;

  let body: string;
  if (storyCount === 0) {
    body = emptyHtml(baseUrl);
  } else {
    body = [
      lead ? leadHtml(lead, baseUrl) : "",
      secondaryRowHtml(secondary, baseUrl),
      wireHtml(wire, baseUrl),
    ].join("");
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Broadsheet — ${esc(formatEditionDate(date))}</title>
  <!--[if mso]><style>table{border-collapse:collapse;}td{font-family:Arial,sans-serif;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.bg};color:${C.fg};font-family:${FONT_SANS};font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
    <tr><td align="center" style="padding:32px 24px 64px;">
      <table width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:100%;">
        <tr><td>
          ${mastheadHtml(date, storyCount, baseUrl)}
          ${body}
          ${footerHtml(baseUrl)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildDigestSubject(date?: Date): string {
  const d = date ?? new Date();
  return `Broadsheet — ${formatEditionDate(d)}`;
}
