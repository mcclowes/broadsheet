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
  markdown: string;
  wordCount: number;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndown.addRule("stripScripts", {
  filter: ["script", "style", "iframe", "noscript"],
  replacement: () => "",
});

// Convert <table> to GFM pipe tables. Tables without a heading row are
// preserved as raw HTML via Turndown's `keep` fallback (registered by the
// plugin), which marked passes through and DOMPurify sanitises.
turndown.use(tables);

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
export const MAX_BODY_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 5;

const HTML_CONTENT_TYPE = /^(?:text\/html|application\/xhtml\+xml)\b/i;

export function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return HTML_CONTENT_TYPE.test(contentType);
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

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/%.*$/, "");
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
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

async function readBoundedBody(res: Response): Promise<string> {
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
      if (total > MAX_BODY_BYTES) {
        throw new IngestError(
          `Body exceeded ${MAX_BODY_BYTES} bytes`,
          undefined,
          "Page is too large to save",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return buf.toString("utf8");
}

export function parseArticleFromHtml(html: string, url: string): ParsedArticle {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article || !article.content) {
    throw new IngestError(
      "Could not extract readable content from page",
      undefined,
      "Could not extract a readable article from this page",
    );
  }
  const markdown = turndown.turndown(article.content).trim();
  if (!markdown) {
    throw new IngestError(
      "Parsed article was empty",
      undefined,
      "The extracted article was empty",
    );
  }
  return {
    title: (article.title ?? "").trim() || "Untitled",
    byline: article.byline?.trim() || null,
    excerpt: article.excerpt?.trim() || null,
    siteName: article.siteName?.trim() || null,
    lang: article.lang ?? null,
    markdown,
    wordCount: countWords(markdown),
  };
}

export async function fetchAndParse(url: string): Promise<ParsedArticle> {
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
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Broadsheet/0.1; +https://broadsheet.app/bot)",
          Accept: "text/html,application/xhtml+xml",
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
        `Upstream returned HTTP ${res.status}`,
      );
    }

    if (!isHtmlContentType(res.headers.get("content-type"))) {
      throw new IngestError(
        `Unsupported content-type ${res.headers.get("content-type")}`,
        undefined,
        "Upstream did not return HTML",
      );
    }

    const html = await readBoundedBody(res);
    return parseArticleFromHtml(html, current.toString());
  }

  throw new IngestError(
    `Exceeded ${MAX_REDIRECTS} redirects`,
    undefined,
    "Too many redirects",
  );
}

function countWords(markdown: string): number {
  return markdown.split(/\s+/).filter(Boolean).length;
}

export function estimateReadMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 220));
}
