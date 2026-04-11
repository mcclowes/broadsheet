const DEFAULT_BASE_URL = "http://localhost:3000";
const MAX_HTML_LENGTH = 4_000_000;

async function getBaseUrl() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  return (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

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

async function saveUrl(url, html) {
  const baseUrl = await getBaseUrl();
  const body = html ? { url, html } : { url };
  const res = await fetch(`${baseUrl}/api/articles`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Not signed in — open Broadsheet and sign in first.");
    }
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

async function notify(title, message, isError = false) {
  const hasNotifications = typeof chrome.notifications !== "undefined";
  if (!hasNotifications) return;
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message,
    priority: isError ? 2 : 0,
  }).catch(() => {});
}

async function saveAndNotify() {
  const tab = await getActiveTab();
  const url = tab?.url ?? null;
  if (!url) {
    await notify("Broadsheet", "No URL in the current tab.", true);
    return { ok: false, error: "No URL" };
  }
  try {
    const html = await extractPageHtml(tab?.id);
    const { article } = await saveUrl(url, html);
    await notify("Saved to Broadsheet", article?.title ?? url);
    return { ok: true, article };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await notify("Broadsheet: save failed", message, true);
    return { ok: false, error: message };
  }
}

chrome.commands?.onCommand.addListener((command) => {
  if (command === "save-current-tab") void saveAndNotify();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "save-current-tab") {
    saveAndNotify().then(sendResponse);
    return true;
  }
  return false;
});
