const saveButton = document.getElementById("save");
const statusEl = document.getElementById("status");
const hostEl = document.getElementById("host");
const optionsLink = document.getElementById("open-options");
const recentEl = document.getElementById("recent");
const recentListEl = document.getElementById("recent-list");

const RECENT_LIMIT = 5;

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind ? `status ${kind}` : "status";
}

async function getBaseUrl() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  return (baseUrl ?? "https://broadsheet.marginalutility.dev").replace(
    /\/+$/,
    "",
  );
}

async function refreshRecent() {
  const baseUrl = await getBaseUrl();
  try {
    const res = await fetch(
      `${baseUrl}/api/articles?limit=${RECENT_LIMIT}&view=inbox`,
      { credentials: "include" },
    );
    if (!res.ok) {
      recentEl.hidden = true;
      return;
    }
    const { articles } = await res.json();
    renderRecent(Array.isArray(articles) ? articles : [], baseUrl);
  } catch {
    recentEl.hidden = true;
  }
}

function renderRecent(articles, baseUrl) {
  recentListEl.replaceChildren();
  if (!articles.length) {
    recentEl.hidden = true;
    return;
  }
  for (const article of articles.slice(0, RECENT_LIMIT)) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `${baseUrl}/read/${encodeURIComponent(article.id)}`;
    a.textContent = article.title || article.url || "Untitled";
    a.title = article.title || article.url || "";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: a.href });
    });
    li.appendChild(a);
    recentListEl.appendChild(li);
  }
  recentEl.hidden = false;
}

async function refreshHost() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  const label = baseUrl ?? "https://broadsheet.marginalutility.dev";
  try {
    hostEl.textContent = new URL(
      label.startsWith("http") ? label : `https://${label}`,
    ).host;
  } catch {
    hostEl.textContent = label;
  }
}

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  setStatus("Saving…");
  const result = await chrome.runtime.sendMessage({ type: "save-current-tab" });
  if (result?.ok) {
    const title = result.article?.title ?? "article";
    setStatus(
      result.created === false ? `Already saved: ${title}` : `Saved: ${title}`,
      "success",
    );
    void refreshRecent();
  } else {
    setStatus(result?.error ?? "Save failed", "error");
  }
  saveButton.disabled = false;
});

optionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

void refreshHost();
void refreshRecent();
