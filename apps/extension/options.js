const DEFAULT_BASE_URL = "https://broadsheet.marginalutility.dev";

const input = document.getElementById("base-url");
const saveButton = document.getElementById("save");
const saved = document.getElementById("saved");

async function load() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  input.value = baseUrl ?? DEFAULT_BASE_URL;
}

function originPatternFor(baseUrl) {
  const u = new URL(baseUrl);
  return `${u.protocol}//${u.host}/*`;
}

saveButton.addEventListener("click", async () => {
  const value = input.value.trim().replace(/\/+$/, "");
  if (!value) return;
  let pattern;
  try {
    pattern = originPatternFor(value);
  } catch {
    saved.textContent = "Invalid URL.";
    return;
  }
  // chrome.permissions.request is a no-op for origins already granted in
  // manifest.host_permissions (e.g. the default production URL), so we can
  // safely request on every save — Chrome will only prompt when needed.
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    saved.textContent = "Permission denied.";
    return;
  }
  await chrome.storage.sync.set({ baseUrl: value });
  saved.textContent = "Saved.";
  setTimeout(() => (saved.textContent = ""), 1500);
});

void load();
