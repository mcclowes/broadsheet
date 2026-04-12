import { JSDOM } from "jsdom";
import { renderMarkdown } from "./markdown";

/**
 * ElevenLabs text-to-speech integration for article narration.
 *
 * Requires env vars:
 *   ELEVENLABS_API_KEY   — API key from elevenlabs.io
 *   ELEVENLABS_VOICE_ID  — voice to use (defaults to "Rachel")
 */

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // "Rachel"
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

/** ElevenLabs caps request text at ~5 000 characters for most tiers. */
export const MAX_TEXT_LENGTH = 5_000;

export class NarrationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    readonly publicMessage: string = message,
  ) {
    super(message);
    this.name = "NarrationError";
  }
}

// ---------------------------------------------------------------------------
// Markdown → plain text
// ---------------------------------------------------------------------------

/**
 * Convert a markdown article body to plain text suitable for TTS.
 *
 * Strategy: render to sanitised HTML (reusing the existing pipeline), then
 * extract `textContent` via jsdom — this handles all markdown constructs,
 * embedded HTML entities, etc. without reinventing a parser.
 */
export function markdownToPlainText(md: string): string {
  const html = renderMarkdown(md);
  const dom = new JSDOM(`<body>${html}</body>`);
  const text = dom.window.document.body.textContent ?? "";
  // Collapse whitespace runs into single spaces and trim.
  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// ElevenLabs TTS
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new NarrationError(
      "ELEVENLABS_API_KEY is not set",
      undefined,
      "Narration is not configured",
    );
  }
  return key;
}

function getVoiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
}

export interface SynthesisResult {
  audio: ArrayBuffer;
  contentType: string;
}

/**
 * Call the ElevenLabs text-to-speech endpoint and return the audio bytes.
 *
 * Throws `NarrationError` on API failures or missing configuration.
 */
export async function synthesizeSpeech(text: string): Promise<SynthesisResult> {
  if (!text) {
    throw new NarrationError("Empty text", undefined, "Nothing to narrate");
  }

  const apiKey = getApiKey();
  const voiceId = getVoiceId();
  const url = `${ELEVENLABS_BASE}/text-to-speech/${voiceId}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: DEFAULT_MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new NarrationError(
      `ElevenLabs request failed: ${(err as Error).message}`,
      err,
      "Speech synthesis request failed",
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail?.message ?? JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new NarrationError(
      `ElevenLabs HTTP ${res.status}: ${detail}`,
      undefined,
      "Speech synthesis failed",
    );
  }

  const audio = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "audio/mpeg";
  return { audio, contentType };
}

/**
 * Prepare article text for synthesis: convert markdown to plain text and
 * truncate to the ElevenLabs character limit if needed.
 *
 * Returns `{ text, truncated }` where `truncated` is true when the article
 * was too long and had to be cut.
 */
export function prepareText(markdown: string): {
  text: string;
  truncated: boolean;
} {
  let text = markdownToPlainText(markdown);
  const truncated = text.length > MAX_TEXT_LENGTH;
  if (truncated) {
    // Cut at the last sentence boundary within the limit.
    const cut = text.slice(0, MAX_TEXT_LENGTH);
    const lastSentence = cut.search(/[.!?]\s[^.!?]*$/);
    text =
      lastSentence > MAX_TEXT_LENGTH * 0.5
        ? cut.slice(0, lastSentence + 1)
        : cut;
  }
  return { text, truncated };
}
