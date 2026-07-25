import { answerFromPageText } from "./expressionSolver.js";

/** Plays a single sprint search duel (SRP: match play only). */
export class MatchPlayer {
  constructor({ matchTimeoutMs = 90000, keepAliveMs = 180 } = {}) {
    this.matchTimeoutMs = matchTimeoutMs;
    this.keepAliveMs = keepAliveMs;
  }

  async play(page, searchUrl, onTick) {
    console.log(`[bot] Opening search: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await this.#ensureMatchmaking(page, searchUrl, onTick);

    const input = page.locator('input[placeholder="Enter answer"]');
    try {
      await Promise.race([
        input.waitFor({ state: "visible", timeout: 120000 }),
        page.waitForURL(/\/gameV2\/.+/i, { timeout: 120000 }),
      ]);
      await input.waitFor({ state: "visible", timeout: 30000 });
    } catch {
      const text = await page.locator("body").innerText().catch(() => "");
      console.log(
        `[bot] No answer input appeared. URL=${page.url()} text=${text.slice(0, 220)}`
      );
      return {
        status: "no_input",
        url: page.url(),
        text: text.slice(0, 220),
        answered: 0,
      };
    }

    console.log(`[bot] Match started: ${page.url()}`);
    await onTick?.({ phase: "playing", url: page.url() });
    return this.#answerLoop(page, input, onTick);
  }

  async #ensureMatchmaking(page, searchUrl, onTick) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const text = await page.locator("body").innerText().catch(() => "");
      if (/SIGNAL DOWN|connection dropped/i.test(text)) {
        console.log(`[bot] SIGNAL DOWN on attempt ${attempt} — clicking TRY AGAIN`);
        const retry = page.getByText(/TRY AGAIN/i).first();
        if (await retry.isVisible().catch(() => false)) {
          await retry.click();
          await page.waitForTimeout(2000);
          continue;
        }
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        continue;
      }
      if (/Cancel Search|Searching|Looking for/i.test(text)) {
        console.log(`[bot] Matchmaking UI visible`);
        await onTick?.({ phase: "matchmaking" });
        return;
      }
      try {
        await page.waitForFunction(
          () =>
            /Cancel Search|Searching|Looking for|SIGNAL DOWN/i.test(
              document.body?.innerText || ""
            ),
          { timeout: 15000 }
        );
      } catch {
        console.log(
          `[bot] Matchmaking UI missing. url=${page.url()} text=${text.slice(0, 180)}`
        );
        return;
      }
    }
  }

  async #answerLoop(page, input, onTick) {
    let answered = 0;
    let lastRaw = "";
    let lastKeepAliveLog = 0;
    const deadline = Date.now() + this.matchTimeoutMs;
    let lastBeat = 0;

    while (Date.now() < deadline) {
      if (/\/result/.test(page.url())) {
        console.log(`[bot] Match finished. answered=${answered}`);
        return { status: "finished", answered, url: page.url() };
      }

      if (Date.now() - lastBeat > 4000) {
        lastBeat = Date.now();
        await onTick?.({ phase: "playing", answered, url: page.url() });
      }

      const visible = await input.isVisible().catch(() => false);
      if (!visible) {
        await page.waitForTimeout(200);
        continue;
      }

      const bodyText = await page.locator("body").innerText().catch(() => "");
      const starting = /Starting in/i.test(bodyText);
      // Can't parse while "Starting in…" or when expression isn't in the DOM yet.
      const answer = starting ? null : answerFromPageText(bodyText);

      if (answer) {
        const rawMatch = bodyText.match(/(\d+)\s*[+\-−–—×÷*/xX]\s*(\d+)/g);
        const raw = (rawMatch?.[rawMatch.length - 1] || String(answer))
          .replace(/\s+/g, " ")
          .trim();
        if (raw !== lastRaw) {
          console.log(`[bot] Answering ${raw} = ${answer}`);
          await input.click({ timeout: 1000 }).catch(() => {});
          await input.fill("");
          await input.type(answer, { delay: 20 });
          await page.keyboard.press("Enter");
          lastRaw = raw;
          answered += 1;
          await onTick?.({
            phase: "playing",
            answered,
            lastAnswer: { raw, answer },
          });
          await page.waitForTimeout(250);
          continue;
        }
      }

      // Fallback for 1-min game: keep the input "alive" so the client
      // doesn't idle-drop when we can't parse the expression div yet.
      const digit = String(Math.floor(Math.random() * 10));
      if (Date.now() - lastKeepAliveLog > 3000) {
        lastKeepAliveLog = Date.now();
        console.log(
          `[bot] Keepalive (unparsed): type ${digit} → Backspace`
        );
      }
      try {
        await input.click({ timeout: 500 });
        await input.fill("");
        await page.keyboard.type(digit, { delay: 15 });
        await page.waitForTimeout(this.keepAliveMs);
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(this.keepAliveMs);
      } catch {
        await page.waitForTimeout(150);
      }
    }

    return { status: "timeout", answered, url: page.url() };
  }
}
