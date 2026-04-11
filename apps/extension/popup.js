const saveButton = document.getElementById("save");
const statusEl = document.getElementById("status");
const hostEl = document.getElementById("host");
const optionsLink = document.getElementById("open-options");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind ? `status ${kind}` : "status";
}

async function refreshHost() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  const label = baseUrl ?? "localhost:3000";
  try {
    hostEl.textContent = new URL(label.startsWith("http") ? label : `http://${label}`).host;
  } catch {
    hostEl.textContent = label;
  }
}

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  setStatus("Saving…");
  const result = await chrome.runtime.sendMessage({ type: "save-current-tab" });
  if (result?.ok) {
    setStatus(`Saved: ${result.article?.title ?? "article"}`, "success");
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
