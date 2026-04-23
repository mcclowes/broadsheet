const DEFAULT_BASE_URL = "https://broadsheet.marginalutility.dev";
// Must stay below server's MAX_USER_HTML_BYTES (512 KiB = 524_288 chars)
// in src/lib/ingest.ts. Sending more just gets rejected as a 400.
const MAX_HTML_LENGTH = 500_000;

async function getBaseUrl() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  return (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

// Privacy note: the captured HTML may contain sensitive page content (e.g.
// PII, inline auth tokens). It is sent to the server for parsing but never
// stored raw — only the extracted article markdown is persisted. The server
// error handler logs URL and error messages only, never the HTML body.
async function extractPageHtml(tabId) {
  if (typeof tabId !== "number") return null;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement?.outerHTML ?? null,
    });
    const html = result?.result;
    if (typeof html !== "string" || !html) return null;
    if (html.length > MAX_HTML_LENGTH) return null;
    return html;
  } catch {
    return null;
  }
}

class NotSignedInError extends Error {
  constructor() {
    super("Not signed in — opening Broadsheet to sign in.");
    this.name = "NotSignedInError";
  }
}

async function saveUrl(url, html, selectionText) {
  const baseUrl = await getBaseUrl();
  const body = { url };
  if (html) body.html = html;
  if (selectionText) body.selection = { text: selectionText };
  const res = await fetch(`${baseUrl}/api/articles`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401) throw new NotSignedInError();
    let message = `Save failed (${res.status})`;
    try {
      const payload = await res.json();
      if (payload?.error) message = payload.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

async function openSignIn() {
  const baseUrl = await getBaseUrl();
  await chrome.tabs.create({ url: `${baseUrl}/sign-in` }).catch(() => {});
}

async function notify(title, message, isError = false) {
  const hasNotifications = typeof chrome.notifications !== "undefined";
  if (!hasNotifications) return;
  await chrome.notifications
    .create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message,
      priority: isError ? 2 : 0,
    })
    .catch(() => {});
}

async function saveAndNotify(opts = {}) {
  const { selectionText, tab: providedTab } = opts;
  const tab = providedTab ?? (await getActiveTab());
  const url = tab?.url ?? null;
  if (!url) {
    await notify("Broadsheet", "No URL in the current tab.", true);
    return { ok: false, error: "No URL" };
  }
  try {
    const html = await extractPageHtml(tab?.id);
    const { article, created } = await saveUrl(url, html, selectionText);
    const title = article?.title ?? url;
    const alreadySaved = created === false;
    const savedLabel = selectionText
      ? alreadySaved
        ? "Highlight added"
        : "Saved with highlight"
      : alreadySaved
        ? "Already in Broadsheet"
        : "Saved to Broadsheet";
    await notify(savedLabel, title);
    return { ok: true, article, created: created !== false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof NotSignedInError) {
      await notify("Broadsheet", message, true);
      await openSignIn();
      return { ok: false, error: message, signedOut: true };
    }
    await notify("Broadsheet: save failed", message, true);
    return { ok: false, error: message };
  }
}

chrome.commands?.onCommand.addListener((command) => {
  if (command === "save-current-tab") void saveAndNotify();
});

const CONTEXT_MENU_ID = "broadsheet-save-highlight";

function registerContextMenu() {
  chrome.contextMenus?.removeAll(() => {
    chrome.contextMenus?.create({
      id: CONTEXT_MENU_ID,
      title: "Save to Broadsheet with highlight",
      contexts: ["selection"],
    });
  });
}

chrome.runtime.onInstalled.addListener(registerContextMenu);
chrome.runtime.onStartup?.addListener(registerContextMenu);

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  const selectionText = (info.selectionText ?? "").trim();
  if (!selectionText) return;
  void saveAndNotify({ selectionText, tab });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "save-current-tab") {
    saveAndNotify().then(sendResponse);
    return true;
  }
  return false;
});
