import { chromium } from "playwright";
import { HOME_URL } from "../config.js";

export async function injectSession(page, accessToken) {
  await page.addInitScript((token) => {
    localStorage.setItem("session", token);
    localStorage.setItem("new-auth-session-active", "true");
    localStorage.setItem("auth-migration-completed", "true");
    try {
      const raw = localStorage.getItem("auth-zustand-store");
      const store = raw ? JSON.parse(raw) : { state: {}, version: 0 };
      store.state = store.state || {};
      store.state.session = token;
      store.state.isAuthenticated = true;
      localStorage.setItem("auth-zustand-store", JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }, accessToken);
}

export async function waitForLoggedInHome(page) {
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText || "";
      return /ARENA|DUELS|SPRINT|QUESTS/i.test(text) && !/OOPS/i.test(text);
    },
    { timeout: 60000 }
  );
}

/** Owns browser lifecycle (SRP). */
export class BrowserSession {
  constructor({ headed = false, label = "bot" } = {}) {
    this.headed = headed;
    this.label = label;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async open(accessToken) {
    this.browser = await chromium.launch({
      headless: !this.headed,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    });
    this.page = await this.context.newPage();
    this.page.on("websocket", (ws) => {
      console.log(`[${this.label}] WS: ${ws.url()}`);
      ws.on("close", () => console.log(`[${this.label}] WS closed`));
    });
    await injectSession(this.page, accessToken);
    return this.page;
  }

  async close({ keepOpen = false } = {}) {
    if (keepOpen) return;
    if (this.browser) await this.browser.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
