const input = document.getElementById("base-url");
const saveButton = document.getElementById("save");
const saved = document.getElementById("saved");

async function load() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  input.value = baseUrl ?? "http://localhost:3000";
}

saveButton.addEventListener("click", async () => {
  const value = input.value.trim().replace(/\/+$/, "");
  if (!value) return;
  await chrome.storage.sync.set({ baseUrl: value });
  saved.textContent = "Saved.";
  setTimeout(() => (saved.textContent = ""), 1500);
});

void load();
