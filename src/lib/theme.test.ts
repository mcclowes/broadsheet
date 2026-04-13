import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_CHANGE_EVENT,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  isTheme,
  readStoredTheme,
} from "./theme";

// Minimal DOM + localStorage shim so the module can be exercised in
// vitest's default node environment without jsdom.
function installBrowserGlobals() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    length: 0,
  };

  const listeners = new Map<string, Set<(e: Event) => void>>();
  const win = {
    localStorage,
    addEventListener: (type: string, fn: (e: Event) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (e: Event) => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (e: Event) => {
      listeners.get(e.type)?.forEach((fn) => fn(e));
      return true;
    },
  };

  const attributes = new Map<string, string>();
  const documentEl = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
      removeAttribute: (name: string) => {
        attributes.delete(name);
      },
      getAttribute: (name: string) => attributes.get(name) ?? null,
    },
  };

  // CustomEvent shim
  class FakeCustomEvent<T> {
    type: string;
    detail: T;
    constructor(type: string, init: { detail: T }) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", documentEl);
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("CustomEvent", FakeCustomEvent);

  return { attributes, listeners, store };
}

describe("isTheme", () => {
  it("accepts valid themes", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isTheme("")).toBe(false);
    expect(isTheme("LIGHT")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(42)).toBe(false);
    expect(isTheme({})).toBe(false);
  });
});

describe("applyTheme / readStoredTheme", () => {
  let handles: ReturnType<typeof installBrowserGlobals>;

  beforeEach(() => {
    handles = installBrowserGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns system when nothing is stored", () => {
    expect(readStoredTheme()).toBe("system");
  });

  it("round-trips an explicit theme", () => {
    applyTheme("dark");
    expect(handles.store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(handles.attributes.get("data-theme")).toBe("dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("removes the attribute when set to system", () => {
    applyTheme("light");
    expect(handles.attributes.get("data-theme")).toBe("light");
    applyTheme("system");
    expect(handles.attributes.has("data-theme")).toBe(false);
    expect(handles.store.get(THEME_STORAGE_KEY)).toBe("system");
  });

  it("dispatches a change event", () => {
    const received: string[] = [];
    window.addEventListener(THEME_CHANGE_EVENT, (e) => {
      received.push((e as CustomEvent<string>).detail);
    });
    applyTheme("dark");
    applyTheme("light");
    expect(received).toEqual(["dark", "light"]);
  });

  it("ignores unrecognised stored values", () => {
    handles.store.set(THEME_STORAGE_KEY, "neon");
    expect(readStoredTheme()).toBe("system");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("references the canonical storage key", () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it("only applies light or dark values", () => {
    // System is the default; the init script must not set data-theme="system".
    expect(THEME_INIT_SCRIPT).toContain('t==="light"||t==="dark"');
  });
});
