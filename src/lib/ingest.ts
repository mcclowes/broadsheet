import net from "node:net";
import dns from "node:dns/promises";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { tables } from "turndown-plugin-gfm";

export interface ParsedArticle {
  title: string;
  byline: string | null;
  excerpt: string | null;
  siteName: string | null;
  lang: string | null;
  image: string | null;
  markdown: string;
  wordCount: number;
}

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  td.addRule("stripScripts", {
    filter: ["script", "style", "iframe", "noscript"],
    replacement: () => "",
  });

  // <pre> without a <code> child is not matched by Turndown's built-in fenced
  // code-block rule, so the text passes through as a plain paragraph and the
  // browser collapses its whitespace. Wrap it in a fenced block ourselves.
  td.addRule("preWithoutCode", {
    filter(node) {
      return node.nodeName === "PRE" && !node.querySelector("code");
    },
    replacement(_content, node) {
      const text = (node as Element).textContent || "";
      return "\n\n```\n" + text + "\n```\n\n";
    },
  });

  // Turndown's default image rule drops <img> when `src` is falsy. Many sites
  // use `<img src="" data-src="…">` for lazy loading; Readability fixes some
  // but not all of these. Fall back to data-src / data-lazy-src.
  td.addRule("imgWithDataSrc", {
    filter(node) {
      if (node.nodeName !== "IMG") return false;
      const src = node.getAttribute("src");
      if (src) return false; // default rule handles it
      const fallback =
        node.getAttribute("data-src") || node.getAttribute("data-lazy-src");
      return !!fallback;
    },
    replacement(_content, node) {
      const src =
        (node as Element).getAttribute("data-src") ||
        (node as Element).getAttribute("data-lazy-src") ||
        "";
      const alt = (node as Element).getAttribute("alt") || "";
      const title = (node as Element).getAttribute("title");
      const titlePart = title ? ` "${title}"` : "";
      return `![${alt}](${src}${titlePart})`;
    },
  });

  // Convert <table> to GFM pipe tables. Tables without a heading row are
  // preserved as raw HTML via Turndown's `keep` fallback (registered by the
  // plugin), which marked passes through and DOMPurify sanitises.
  td.use(tables);

  // Preserve structural wrappers as raw HTML in the markdown so they survive
  // round-tripping through marked at read time. Without this, Turndown
  // flattens <figure>/<figcaption>/<picture>/<source> and we lose captions
  // and responsive image sources.
  td.keep(["figure", "figcaption", "picture", "source"]);

  return td;
}

// Matches markdown-style inline emphasis delimiters that some CMSes leave
// as literal characters in the rendered HTML (common on literary / poetry
// sites). Ordering matters: **strong** / __strong__ must be matched before
// the single-delimiter cases.
//
// Each pattern requires the delimiter to sit on a non-word boundary on the
// outside so we don't match things like snake_case or arithmetic 2 * 3 * 4.
// Group 1 is the leading boundary char, group 2 is the emphasised content.
const EMPHASIS_PATTERNS: Array<{ re: RegExp; tag: "em" | "strong" }> = [
  {
    re: /(^|[^\w*])\*\*([^\s*][^*]*?[^\s*]|[^\s*])\*\*(?=[^\w*]|$)/g,
    tag: "strong",
  },
  {
    re: /(^|[^\w_])__([^\s_][^_]*?[^\s_]|[^\s_])__(?=[^\w_]|$)/g,
    tag: "strong",
  },
  {
    re: /(^|[^\w*])\*([^\s*][^*]*?[^\s*]|[^\s*])\*(?=[^\w*]|$)/g,
    tag: "em",
  },
  {
    re: /(^|[^\w_])_([^\s_][^_]*?[^\s_]|[^\s_])_(?=[^\w_]|$)/g,
    tag: "em",
  },
];

/**
 * Splits a text string into DOM nodes, promoting markdown-style emphasis
 * delimiters (_foo_, *foo*, **foo**, __foo__) into <em>/<strong> elements.
 * Returns null if no emphasis was found (caller can skip the replacement).
 */
function emphasiseText(text: string, doc: Document): Node[] | null {
  let segments: Array<
    | { kind: "text"; value: string }
    | { kind: "tag"; tag: "em" | "strong"; inner: string }
  > = [{ kind: "text", value: text }];
  let matched = false;

  for (const { re, tag } of EMPHASIS_PATTERNS) {
    const next: typeof segments = [];
    for (const seg of segments) {
      if (seg.kind !== "text") {
        next.push(seg);
        continue;
      }
      re.lastIndex = 0;
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(seg.value)) !== null) {
        matched = true;
        const [full, lead, inner] = m;
        const start = m.index;
        // Anything before the match, plus the leading boundary char, stays as text.
        next.push({
          kind: "text",
          value: seg.value.slice(lastIndex, start) + lead,
        });
        next.push({ kind: "tag", tag, inner });
        lastIndex = start + full.length;
      }
      next.push({ kind: "text", value: seg.value.slice(lastIndex) });
    }
    segments = next;
  }

  if (!matched) return null;

  return segments
    .filter((s) => s.kind === "tag" || s.value.length > 0)
    .map((s) => {
      if (s.kind === "text") return doc.createTextNode(s.value);
      const el = doc.createElement(s.tag);
      el.textContent = s.inner;
      return el;
    });
}

/**
 * Walks text nodes in `root` and converts markdown-style emphasis
 * delimiters into <em>/<strong> elements in place. Skips text inside
 * <code>, <pre>, and <a> so we don't mangle code samples or link text
 * that happens to contain underscores / asterisks.
 */
function promoteMarkdownEmphasis(root: Element): void {
  const doc = root.ownerDocument;
  if (!doc) return;
  const NodeFilter = doc.defaultView?.NodeFilter;
  if (!NodeFilter) return;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p: Node | null = node.parentNode;
      while (p && p !== root) {
        if (p.nodeType === 1) {
          const tag = (p as Element).tagName.toLowerCase();
          if (tag === "code" || tag === "pre" || tag === "a") {
            return NodeFilter.FILTER_REJECT;
          }
        }
        p = p.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    textNodes.push(n as Text);
  }

  for (const text of textNodes) {
    const replacements = emphasiseText(text.nodeValue ?? "", doc);
    if (!replacements) continue;
    const parent = text.parentNode;
    if (!parent) continue;
    for (const node of replacements) parent.insertBefore(node, text);
    parent.removeChild(text);
  }
}

export class IngestError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    readonly publicMessage: string = message,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export const FETCH_TIMEOUT_MS = 15_000;
// Shorter budget for speculative probes (feed discovery candidates, etc.) so a
// cascade of misses can't monopolise a 300 s serverless invocation.
export const DISCOVERY_TIMEOUT_MS = 5_000;
// Images proxied for library thumbnails are often multi-MB hero images but
// render at 6×4rem — keep the cap tight to bound bandwidth per request.
export const IMAGE_FETCH_TIMEOUT_MS = 10_000;
export const MAX_BODY_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
// User-supplied HTML (extension snapshot) is parsed synchronously with JSDOM,
// which is a CPU DoS primitive if the cap matches remote-fetch size. Keep
// this an order of magnitude lower.
export const MAX_USER_HTML_BYTES = 512 * 1024;
export const MAX_REDIRECTS = 5;

// Frontmatter length caps — truncates with "…" to keep stored data bounded.
const MAX_TITLE = 500;
const MAX_BYLINE = 200;
const MAX_EXCERPT = 1000;
const MAX_SOURCE = 200;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// Articles shorter than this are likely paywall teasers or stub pages.
export const LOW_WORD_COUNT_THRESHOLD = 25;

const HTML_CONTENT_TYPE = /^(?:text\/html|application\/xhtml\+xml)\b/i;

export function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return HTML_CONTENT_TYPE.test(contentType);
}

// Allow common raster + SVG. svg+xml is intentionally listed: publisher CDNs
// return it for logos / placeholders, and DOMPurify never touches the
// proxied body (we just forward bytes), so the browser's image decoder
// treats it as inert.
const IMAGE_CONTENT_TYPE =
  /^image\/(?:png|jpe?g|webp|gif|avif|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon)\b/i;

export function isImageContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return IMAGE_CONTENT_TYPE.test(contentType);
}

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return true;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = nums;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/**
 * Expand an IPv6 string (possibly containing "::" and/or trailing dotted v4)
 * into 8 colon-separated hex groups. Returns null if malformed.
 */
function expandIPv6(ip: string): string[] | null {
  // Pull off trailing dotted-quad (::a.b.c.d or ::ffff:a.b.c.d forms) and
  // convert to two hex groups so we can reason in a uniform 8-group space.
  let work = ip;
  const dotMatch = work.match(
    /(.*?)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (dotMatch) {
    const [, prefix, a, b, c, d] = dotMatch;
    const nums = [a, b, c, d].map((n) => Number(n));
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const g6 = ((nums[0] << 8) | nums[1]).toString(16);
    const g7 = ((nums[2] << 8) | nums[3]).toString(16);
    work = `${prefix}${g6}:${g7}`;
  }
  const halves = work.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const total = left.length + right.length;
  if (total > 8) return null;
  if (halves.length === 1 && total !== 8) return null;
  const fill = new Array(8 - total).fill("0");
  const groups = [...left, ...fill, ...right];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
  }
  return groups;
}

function embeddedV4FromGroups(groups: string[]): string | null {
  const g6 = parseInt(groups[6], 16);
  const g7 = parseInt(groups[7], 16);
  if (!Number.isFinite(g6) || !Number.isFinite(g7)) return null;
  return `${(g6 >> 8) & 0xff}.${g6 & 0xff}.${(g7 >> 8) & 0xff}.${g7 & 0xff}`;
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/%.*$/, "");
  if (lower === "::" || lower === "::1") return true;
  // ULA fc00::/7
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // Link-local fe80::/10 + deprecated site-local fec0::/10 (covers fe80-feff)
  if (/^fe[89a-f]/.test(lower)) return true;
  // Documentation 2001:db8::/32
  if (/^2001:0*db8(:|$)/.test(lower)) return true;
  // IPv4-mapped ::ffff:a.b.c.d
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  const groups = expandIPv6(lower);
  if (groups) {
    // NAT64 well-known 64:ff9b::/96 and local-use 64:ff9b:1::/48
    const isNat64Wellknown =
      groups[0] === "64" &&
      groups[1] === "ff9b" &&
      groups.slice(2, 6).every((g) => g === "0");
    const isNat64Local =
      groups[0] === "64" && groups[1] === "ff9b" && groups[2] === "1";
    if (isNat64Wellknown || isNat64Local) {
      const v4 = embeddedV4FromGroups(groups);
      return v4 ? isPrivateIPv4(v4) : true;
    }
    // Deprecated IPv4-compatible ::a.b.c.d (top 96 bits zero, not ::ffff form)
    if (groups.slice(0, 6).every((g) => g === "0")) {
      const v4 = embeddedV4FromGroups(groups);
      if (v4 && v4 !== "0.0.0.0" && v4 !== "0.0.0.1") {
        return isPrivateIPv4(v4);
      }
    }
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const stripped = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(stripped)) {
    if (isPrivateAddress(stripped)) {
      throw new IngestError(
        `Refusing to fetch private address ${stripped}`,
        undefined,
        "Refusing to fetch a non-public address",
      );
    }
    return;
  }
  let results: { address: string; family: number }[];
  try {
    results = await dns.lookup(stripped, { all: true });
  } catch (err) {
    throw new IngestError(
      `DNS lookup failed for ${stripped}: ${(err as Error).message}`,
      err,
      "Could not resolve the host",
    );
  }
  if (results.length === 0) {
    throw new IngestError(
      `No addresses for ${stripped}`,
      undefined,
      "Could not resolve the host",
    );
  }
  for (const { address } of results) {
    if (isPrivateAddress(address)) {
      throw new IngestError(
        `Refusing to fetch private address ${address} (${stripped})`,
        undefined,
        "Refusing to fetch a non-public address",
      );
    }
  }
}

/**
 * Extract charset from Content-Type header or fall back to utf-8.
 * Handles forms like "text/html; charset=iso-8859-1".
 */
export function charsetFromContentType(
  contentType: string | null,
): string | undefined {
  if (!contentType) return undefined;
  const match = contentType.match(/charset\s*=\s*"?([^";,\s]+)/i);
  return match?.[1];
}

async function readBoundedBytes(
  res: Response,
  maxBytes: number,
  tooLargeMessage: string,
): Promise<Buffer> {
  if (!res.body) {
    throw new IngestError(
      "Response had no body",
      undefined,
      "Empty response from upstream",
    );
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new IngestError(
          `Body exceeded ${maxBytes} bytes`,
          undefined,
          tooLargeMessage,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export async function readBoundedBody(
  res: Response,
  contentType?: string | null | undefined,
): Promise<string> {
  const buf = await readBoundedBytes(
    res,
    MAX_BODY_BYTES,
    "Page is too large to save",
  );
  const charset = charsetFromContentType(contentType ?? null) ?? "utf-8";
  try {
    const decoder = new TextDecoder(charset, { fatal: false });
    return decoder.decode(buf);
  } catch {
    // Unknown charset — fall back to utf-8
    return buf.toString("utf8");
  }
}

export async function readBoundedBinaryBody(
  res: Response,
  maxBytes: number = MAX_IMAGE_BYTES,
): Promise<Buffer> {
  return readBoundedBytes(res, maxBytes, "Image is too large to proxy");
}

/**
 * Extract the article's hero image from Open Graph / Twitter Card meta tags.
 * Returns an absolute URL or null.
 */
export function extractMetaImage(
  doc: {
    querySelector: (
      sel: string,
    ) => { getAttribute: (a: string) => string | null } | null;
  },
  baseUrl: string,
): string | null {
  const selectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'meta[property="twitter:image"]',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const raw = el?.getAttribute("content");
    if (raw) {
      try {
        return new URL(raw, baseUrl).href;
      } catch {
        // malformed URL — try next selector
      }
    }
  }
  return null;
}

// Some sites (Docusaurus, Prism, highlight.js) render code blocks as
// `<pre><code><div class="token-line">…<br></div>…</code></pre>`. Turndown's
// default fenced rule reads `code.textContent`, which flattens the structure
// onto a single line (since <br> and block boundaries contribute no newlines
// to textContent). Flatten the highlighted tree to plain text ourselves,
// preserving line breaks, so Turndown emits a well-formed fenced block.
function normalizeHighlightedCodeBlocks(document: Document): void {
  for (const pre of document.querySelectorAll("pre")) {
    const code = pre.querySelector("code");
    if (!code) continue;
    if (!code.querySelector("div, br, p, span")) continue;
    const lineContainers = code.querySelectorAll(
      "div.token-line, .code-line, div[class*='line']",
    );
    let text: string;
    if (lineContainers.length > 0) {
      text = Array.from(lineContainers)
        .map((el) => el.textContent ?? "")
        .join("\n");
    } else {
      const html = code.innerHTML.replace(/<br\s*\/?>(\s*)/gi, "\n");
      const tmp = code.ownerDocument.createElement("div");
      tmp.innerHTML = html;
      text = tmp.textContent ?? "";
    }
    code.textContent = text;
  }
}

// Readability scores by text density, which fails on short-content pages
// (poetry, recipe cards, TIL posts) where the surrounding chrome has more
// words than the article itself. Strip elements that are unambiguously site
// chrome by their semantics — tag name, ARIA role, or the conventional
// "breadcrumb" class — before scoring. We intentionally avoid class-name
// guesses beyond that: real articles use <nav>/<header>/<footer>/<aside>
// inside content far less often than sites use them for chrome, and when
// they do it's usually for things we're happy to drop (author nav, tag list).
const CHROME_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  "[role='complementary']",
  "[role='search']",
  "[aria-label*='breadcrumb' i]",
  ".breadcrumb",
];

function stripNonArticleChrome(document: Document): void {
  // If the page has an explicit article container, leave its descendants
  // alone — articles legitimately use <header> for title blocks, <nav> for
  // table-of-contents, <aside> for pull quotes, <footer> for citations.
  // We only want to kill chrome *outside* the article root.
  const articleRoots = Array.from(
    document.querySelectorAll("main, article, [role='main']"),
  );
  const isInsideArticle = (el: Element): boolean =>
    articleRoots.some((root) => root !== el && root.contains(el));

  for (const sel of CHROME_SELECTORS) {
    for (const el of document.querySelectorAll(sel)) {
      if (isInsideArticle(el)) continue;
      el.remove();
    }
  }
}

export function parseArticleFromHtml(html: string, url: string): ParsedArticle {
  const dom = new JSDOM(html, { url });
  stripNonArticleChrome(dom.window.document);
  normalizeHighlightedCodeBlocks(dom.window.document);
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article || !article.content) {
    throw new IngestError(
      "Could not extract readable content from page",
      undefined,
      "Could not extract a readable article from this page",
    );
  }

  // Extract the hero / og:image from <head> meta tags before we discard the
  // full document. Preference: og:image > twitter:image > twitter:image:src.
  const image = extractMetaImage(dom.window.document, url);

  // Readability resolves most relative URLs and fixes most lazy-loaded images,
  // but misses <img src="" data-src="…"> (attribute present but empty). Do a
  // second pass so these survive Turndown's default image rule.
  const contentDom = new JSDOM(article.content, { url });
  for (const img of contentDom.window.document.querySelectorAll("img")) {
    if (!img.getAttribute("src")) {
      const fallback =
        img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
      if (fallback) {
        try {
          img.setAttribute("src", new URL(fallback, url).href);
        } catch {
          img.setAttribute("src", fallback);
        }
      }
    }
  }
  // Some publishers (commonly literary / poetry sites with markdown-based
  // CMSes) emit italics and bold as literal _text_ / *text* / **text** in
  // the rendered HTML rather than wrapping them in <em>/<strong>. Promote
  // those to real tags before Turndown runs, otherwise Turndown escapes
  // the delimiters (`\_foo\_`) and the reader ends up with literal
  // underscores instead of emphasis.
  promoteMarkdownEmphasis(contentDom.window.document.body);
  const fixedContent = contentDom.window.document.body.innerHTML;

  const markdown = createTurndown().turndown(fixedContent).trim();
  if (!markdown) {
    throw new IngestError(
      "Parsed article was empty",
      undefined,
      "The extracted article was empty",
    );
  }
  const wordCount = countWords(markdown);

  if (wordCount < LOW_WORD_COUNT_THRESHOLD) {
    throw new IngestError(
      `Article has only ${wordCount} words — likely a paywall teaser or stub`,
      undefined,
      "This article appears to be a paywall teaser or stub page (too short to save)",
    );
  }

  const title = truncate((article.title ?? "").trim() || "Untitled", MAX_TITLE);
  const byline = article.byline?.trim()
    ? truncate(article.byline.trim(), MAX_BYLINE)
    : null;
  const excerpt = article.excerpt?.trim()
    ? truncate(article.excerpt.trim(), MAX_EXCERPT)
    : null;
  const siteName = article.siteName?.trim()
    ? truncate(article.siteName.trim(), MAX_SOURCE)
    : null;

  return {
    title,
    byline,
    excerpt,
    siteName,
    lang: article.lang ?? null,
    image,
    markdown,
    wordCount,
  };
}

export function publicMessageForStatus(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return "The site blocked the request — it may require a login or be protecting against bots";
    case 404:
    case 410:
      return "Page not found at that URL";
    case 429:
      return "The site is rate-limiting us — try again in a few minutes";
    case 451:
      return "The page is unavailable for legal reasons";
  }
  if (status >= 500 && status < 600) {
    return "The site is having trouble responding — try again later";
  }
  return `Upstream returned HTTP ${status}`;
}

export interface FetchPublicOptions {
  accept: string;
  validateContentType: (contentType: string | null) => boolean;
  contentTypeError: string;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export interface FetchPublicResult {
  body: string;
  finalUrl: string;
  contentType: string | null;
}

interface ConnectResult {
  response: Response;
  finalUrl: string;
  contentType: string | null;
}

/**
 * Shared SSRF-hardened redirect-following fetch loop. Returns a validated
 * Response with an unread body; callers are responsible for reading it via
 * a bounded reader (readBoundedBody / readBoundedBinaryBody).
 */
async function connectPublicResource(
  url: string,
  opts: FetchPublicOptions,
): Promise<ConnectResult> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new IngestError("Invalid URL", undefined, "Invalid URL");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new IngestError(
        `Unsupported protocol ${current.protocol}`,
        undefined,
        "Only http(s) URLs are supported",
      );
    }
    await assertPublicHost(current.hostname);

    let res: Response;
    try {
      res = await fetch(current, {
        signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Broadsheet/0.1; +https://broadsheet.app/bot)",
          Accept: opts.accept,
          ...opts.extraHeaders,
        },
        redirect: "manual",
      });
    } catch (err) {
      const e = err as Error;
      const isTimeout = e.name === "TimeoutError" || e.name === "AbortError";
      throw new IngestError(
        `Fetch failed for ${current.toString()}: ${e.message}`,
        err,
        isTimeout ? "Upstream timed out" : "Could not fetch the page",
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new IngestError(
          `Redirect without Location from ${current.toString()}`,
          undefined,
          "Upstream returned a malformed redirect",
        );
      }
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new IngestError(
          `Invalid redirect target ${loc}`,
          undefined,
          "Upstream returned a malformed redirect",
        );
      }
      current = next;
      continue;
    }

    if (!res.ok) {
      throw new IngestError(
        `Upstream HTTP ${res.status} for ${current.toString()}`,
        undefined,
        publicMessageForStatus(res.status),
      );
    }

    const contentType = res.headers.get("content-type");
    if (!opts.validateContentType(contentType)) {
      throw new IngestError(
        `Unsupported content-type ${contentType}`,
        undefined,
        opts.contentTypeError,
      );
    }

    return { response: res, finalUrl: current.toString(), contentType };
  }

  throw new IngestError(
    `Exceeded ${MAX_REDIRECTS} redirects`,
    undefined,
    "Too many redirects",
  );
}

/**
 * Fetches a URL with the full SSRF / timeout / body-cap / redirect protections.
 * Shared between article ingestion and feed subscriptions so hardening only
 * has to be audited once.
 */
export async function fetchPublicResource(
  url: string,
  opts: FetchPublicOptions,
): Promise<FetchPublicResult> {
  const { response, finalUrl, contentType } = await connectPublicResource(
    url,
    opts,
  );
  const body = await readBoundedBody(response, contentType);
  return { body, finalUrl, contentType };
}

export interface FetchImageResult {
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
}

/**
 * Binary variant of fetchPublicResource — shares the SSRF / redirect / timeout
 * hardening but reads raw bytes instead of decoding to text. Caller gets back
 * the validated content-type (guaranteed to match IMAGE_CONTENT_TYPE).
 */
export async function fetchPublicImage(
  url: string,
  maxBytes: number = MAX_IMAGE_BYTES,
): Promise<FetchImageResult> {
  const { response, finalUrl, contentType } = await connectPublicResource(url, {
    accept: "image/*",
    validateContentType: isImageContentType,
    contentTypeError: "Upstream did not return an image",
    timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
  });
  const bytes = await readBoundedBinaryBody(response, maxBytes);
  return {
    bytes,
    // connectPublicResource's validateContentType guard guarantees non-null.
    contentType: contentType ?? "application/octet-stream",
    finalUrl,
  };
}

export interface FetchAndParseResult {
  parsed: ParsedArticle;
  finalUrl: string;
}

export async function fetchAndParse(url: string): Promise<FetchAndParseResult> {
  const { body, finalUrl } = await fetchPublicResource(url, {
    accept: "text/html,application/xhtml+xml",
    validateContentType: isHtmlContentType,
    contentTypeError: "Upstream did not return HTML",
  });
  return { parsed: parseArticleFromHtml(body, finalUrl), finalUrl };
}

function stripMarkdownSyntax(markdown: string): string {
  return (
    markdown
      // Images: ![alt](url) → alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Links: [text](url) → text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Reference links: [text][ref] → text
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
      // Inline code: `code` → code
      .replace(/`+([^`]*)`+/g, "$1")
      // Fenced code block markers
      .replace(/^```\w*$/gm, "")
      // Headings: ## text → text
      .replace(/^#{1,6}\s+/gm, "")
      // Bold/italic markers
      .replace(/(\*{1,3}|_{1,3})/g, "")
      // Horizontal rules
      .replace(/^[-*_]{3,}$/gm, "")
      // Table pipes and alignment
      .replace(/\|/g, " ")
      .replace(/^[\s:|-]+$/gm, "")
      // Blockquote markers
      .replace(/^>\s?/gm, "")
      // List markers
      .replace(/^[\s]*[-*+]\s+/gm, "")
      .replace(/^[\s]*\d+\.\s+/gm, "")
  );
}

function countWords(markdown: string): number {
  const text = stripMarkdownSyntax(markdown);
  return text.split(/\s+/).filter(Boolean).length;
}

export function estimateReadMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 220));
}
