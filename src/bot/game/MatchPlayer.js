import {
  answerFromQuestion,
  findQuestionInDom,
  formatExpression,
  questionKey,
} from "./expressionSolver.js";

function randInt(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

export class MatchPlayer {
  constructor({
    matchTimeoutMs = 90000,
    keepAliveMs = 180,
    maxAnswersMin = 20,
    maxAnswersMax = 40,
    thinkDelayMinMs = 450,
    thinkDelayMaxMs = 1400,
    keyDelayMinMs = 70,
    keyDelayMaxMs = 180,
    postAnswerDelayMinMs = 900,
    postAnswerDelayMaxMs = 2400,
  } = {}) {
    this.matchTimeoutMs = matchTimeoutMs;
    this.keepAliveMs = keepAliveMs;
    this.maxAnswersMin = maxAnswersMin;
    this.maxAnswersMax = maxAnswersMax;
    this.thinkDelayMinMs = thinkDelayMinMs;
    this.thinkDelayMaxMs = thinkDelayMaxMs;
    this.keyDelayMinMs = keyDelayMinMs;
    this.keyDelayMaxMs = keyDelayMaxMs;
    this.postAnswerDelayMinMs = postAnswerDelayMinMs;
    this.postAnswerDelayMaxMs = postAnswerDelayMaxMs;
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

    const maxAnswers = randInt(this.maxAnswersMin, this.maxAnswersMax);
    console.log(
      `[bot] Match started: ${page.url()} (answer cap ${maxAnswers})`
    );
    await onTick?.({ phase: "playing", url: page.url(), maxAnswers });
    return this.#answerLoop(page, input, onTick, maxAnswers);
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

  async #readQuestion(page) {
    try {
      return await page.evaluate(findQuestionInDom);
    } catch (err) {
      console.log(`[bot] question scan failed: ${err.message}`);
      return null;
    }
  }

  async #submitAnswer(page, input, answer) {
    await page.waitForTimeout(randInt(this.thinkDelayMinMs, this.thinkDelayMaxMs));
    await input.click({ timeout: 1000 }).catch(() => {});
    await input.fill("");
    const keyDelay =
      randInt(this.keyDelayMinMs, this.keyDelayMaxMs) +
      Math.min(50, String(answer).length * 6);
    await input.type(String(answer), { delay: keyDelay });
    await page.waitForTimeout(randInt(40, 120));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(
      randInt(this.postAnswerDelayMinMs, this.postAnswerDelayMaxMs)
    );
  }

  async #idleUntilResult(page, answered, onTick, maxAnswers) {
    let lastBeat = 0;
    const deadline = Date.now() + this.matchTimeoutMs;
    while (Date.now() < deadline) {
      if (/\/result/.test(page.url())) {
        const summary = await this.#readResultSummary(page);
        console.log(
          `[bot] Match finished. answered=${answered}/${maxAnswers} (capped)`
        );
        if (summary) console.log(`[bot] Result board: ${JSON.stringify(summary)}`);
        return { status: "finished", answered, url: page.url(), result: summary, maxAnswers };
      }
      if (Date.now() - lastBeat > 4000) {
        lastBeat = Date.now();
        await onTick?.({ phase: "playing", answered, capped: true, maxAnswers });
      }
      await page.waitForTimeout(400);
    }
    return { status: "timeout", answered, url: page.url(), maxAnswers };
  }

  async #answerLoop(page, input, onTick, maxAnswers) {
    let answered = 0;
    let lastKey = "";
    let lastKeepAliveLog = 0;
    let lastAnswerAt = 0;
    let lastDiagLog = 0;
    const deadline = Date.now() + this.matchTimeoutMs;
    let lastBeat = 0;

    while (Date.now() < deadline) {
      if (/\/result/.test(page.url())) {
        const summary = await this.#readResultSummary(page);
        console.log(`[bot] Match finished. answered=${answered}/${maxAnswers}`);
        if (summary) console.log(`[bot] Result board: ${JSON.stringify(summary)}`);
        return { status: "finished", answered, url: page.url(), result: summary, maxAnswers };
      }

      if (answered >= maxAnswers) {
        console.log(`[bot] Answer cap reached (${answered}/${maxAnswers}) — idling`);
        return this.#idleUntilResult(page, answered, onTick, maxAnswers);
      }

      if (Date.now() - lastBeat > 4000) {
        lastBeat = Date.now();
        await onTick?.({ phase: "playing", answered, maxAnswers });
      }

      if (!(await input.isVisible().catch(() => false))) {
        await page.waitForTimeout(200);
        continue;
      }

      const bodyText = await page.locator("body").innerText().catch(() => "");
      if (/Starting in/i.test(bodyText)) {
        await page.waitForTimeout(150);
        continue;
      }

      const question = await this.#readQuestion(page);
      const answer = answerFromQuestion(question);
      const raw = formatExpression(question?.expression);
      const key = questionKey(question);

      if (answer && key && key !== lastKey) {
        const source = question?.answers?.length ? "answers" : "expression";
        console.log(
          `[bot] Answering ${raw || "?"} = ${answer} (from ${source}) [${answered + 1}/${maxAnswers}]`
        );
        try {
          await this.#submitAnswer(page, input, answer);
          lastKey = key;
          lastAnswerAt = Date.now();
          answered += 1;
          await onTick?.({
            phase: "playing",
            answered,
            maxAnswers,
            lastAnswer: { raw, answer, source },
          });
        } catch (err) {
          console.log(`[bot] submit failed: ${err.message}`);
          await page.waitForTimeout(200);
        }
        continue;
      }

      if (answer && key && key === lastKey) {
        await page.waitForTimeout(randInt(120, 280));
        continue;
      }

      if (Date.now() - lastAnswerAt < 900) {
        await page.waitForTimeout(150);
        continue;
      }

      if (Date.now() - lastDiagLog > 5000) {
        lastDiagLog = Date.now();
        console.log(
          `[bot] Waiting for question… ${JSON.stringify(
            question
              ? { id: question.id, expr: raw, answers: question.answers, resolved: answer }
              : null
          )}`
        );
      }

      if (Date.now() - lastKeepAliveLog > 4000) {
        lastKeepAliveLog = Date.now();
        console.log(`[bot] Keepalive focus (no keypress)`);
      }
      try {
        await input.click({ timeout: 500 });
        await input.fill("");
        await page.waitForTimeout(this.keepAliveMs + randInt(40, 160));
      } catch {
        await page.waitForTimeout(150);
      }
    }

    return { status: "timeout", answered, url: page.url(), maxAnswers };
  }

  async #readResultSummary(page) {
    await page.waitForTimeout(800);
    return page
      .evaluate(() => {
        const text = document.body?.innerText || "";
        // Prefer "75 - 21" scoreline; ignore duplicated leading count.
        const pairs = [...text.matchAll(/(\d{1,3})\s*[-–—]\s*(\d{1,3})/g)];
        const pair = pairs[0];
        const won = /VICTORY|YOU WON|WINNER/i.test(text);
        const lost = /DEFEAT|YOU LOST|LOSER/i.test(text);
        return {
          mine: pair ? Number(pair[1]) : null,
          opponent: pair ? Number(pair[2]) : null,
          outcome: won ? "win" : lost ? "loss" : null,
          snippet: text.replace(/\s+/g, " ").trim().slice(0, 220),
        };
      })
      .catch(() => null);
  }
}
