const DEFAULT_BASE_URL = "http://localhost:3000";

async function getBaseUrl() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  return (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? null;
}

async function saveUrl(url) {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/articles`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
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
  const url = await getActiveTabUrl();
  if (!url) {
    await notify("Broadsheet", "No URL in the current tab.", true);
    return { ok: false, error: "No URL" };
  }
  try {
    const { article } = await saveUrl(url);
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
