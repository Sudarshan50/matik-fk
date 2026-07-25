import { refreshSession, fetchCurrentUser, fetchStreaks } from "../matiks/index.js";
import { BrowserSession, waitForLoggedInHome } from "./browser/BrowserSession.js";
import { MatchPlayer } from "./game/MatchPlayer.js";
import { AdminReporter } from "./reporting/AdminReporter.js";

/**
 * Orchestrates one bot run: auth → streak before → matches → home → streak after.
 * Depends on abstractions (reporter, session, player) — Open/Closed friendly.
 */
export class MatiksBot {
  constructor(config, deps = {}) {
    this.config = config;
    this.reporter = deps.reporter || new AdminReporter();
    this.session =
      deps.session ||
      new BrowserSession({ headed: config.headed, label: config.label });
    this.player =
      deps.player ||
      new MatchPlayer({
        matchTimeoutMs: config.matchTimeoutMs,
        keepAliveMs: config.keepAliveMs,
      });
  }

  async run() {
    const { label, refreshToken, deviceId, searchUrl, loops, matchRetries } =
      this.config;

    await this.reporter.report("started", { label });
    console.log(`[${label}] Refreshing session...`);
    const session = await refreshSession(refreshToken, { deviceId });
    if (session.refreshToken !== refreshToken) {
      console.log(`[${label}] Refresh token rotated (value not logged)`);
      await this.reporter.report("refresh_rotated", {
        refreshToken: session.refreshToken,
      });
    }

    let user = null;
    let streakBefore = null;
    try {
      user = await fetchCurrentUser(session.accessToken, deviceId);
      streakBefore = await fetchStreaks(session.accessToken, deviceId);
      console.log(
        `[${label}] Streak before: ${streakBefore.currentStreak} (@${user?.username})`
      );
      await this.reporter.report("streak_before", { user, streak: streakBefore });
    } catch (err) {
      console.log(`[${label}] streak before failed:`, err.message);
      await this.reporter.report("error", {
        message: `streak_before: ${err.message}`,
      });
    }

    const page = await this.session.open(session.accessToken);
    const results = [];

    try {
      console.log(`[${label}] Loading home...`);
      await waitForLoggedInHome(page);
      await this.reporter.report("home_ready", {
        url: page.url(),
        username: user?.username,
      });
      await page.waitForTimeout(4000);

      for (let i = 0; i < loops; i++) {
        let result = null;
        for (let attempt = 1; attempt <= matchRetries + 1; attempt++) {
          console.log(
            `[${label}] Match loop ${i + 1}/${loops} attempt ${attempt}`
          );
          await this.reporter.report("match_attempt", {
            loop: i + 1,
            attempt,
          });
          result = await this.player.play(page, searchUrl, (tick) =>
            this.reporter.heartbeat({ ...tick, loop: i + 1, attempt })
          );
          console.log(
            `[${label}] Result: ${JSON.stringify(result)}`
          );
          if (result.status === "finished") break;
          if (attempt <= matchRetries) {
            console.log(`[${label}] Retrying match after ${result.status}...`);
            await page.waitForTimeout(2000 * attempt);
            await waitForLoggedInHome(page).catch(() => {});
          }
        }
        results.push(result);
        await this.reporter.report("match_result", { loop: i + 1, result });
        if (i < loops - 1) await page.waitForTimeout(2000);
      }

      if (!results.some((r) => r?.status === "finished")) {
        await this.reporter.report("failed", {
          message: "All match attempts failed",
          results,
        });
        throw new Error("All match attempts failed");
      }

      console.log(`[${label}] Returning home for streak check...`);
      await waitForLoggedInHome(page);
      await page.waitForTimeout(2000);

      let streakAfter = null;
      try {
        streakAfter = await fetchStreaks(session.accessToken, deviceId);
        const prev = streakBefore?.currentStreak ?? null;
        const curr = streakAfter.currentStreak;
        const delta = prev == null ? null : curr - prev;
        console.log(`[${label}] Streak after: ${curr} (was ${prev}, Δ ${delta})`);
        await this.reporter.report("streak_after", {
          streakBefore,
          streakAfter,
          previousStreak: prev,
          currentStreak: curr,
          delta,
        });
      } catch (err) {
        console.log(`[${label}] streak after failed:`, err.message);
        await this.reporter.report("error", {
          message: `streak_after: ${err.message}`,
        });
      }

      const answered = results.reduce((n, r) => n + (r.answered || 0), 0);
      await this.reporter.report("completed", {
        results,
        answered,
        streakBefore,
        streakAfter,
        previousStreak: streakBefore?.currentStreak ?? null,
        currentStreak: streakAfter?.currentStreak ?? null,
        delta:
          streakBefore && streakAfter
            ? streakAfter.currentStreak - streakBefore.currentStreak
            : null,
        username: user?.username,
      });

      if (this.config.keepOpen) {
        console.log(`[${label}] KEEP_OPEN=1`);
        await new Promise(() => {});
      }
    } catch (err) {
      await this.reporter.report("failed", {
        message: err.message,
        stack: err.stack,
      });
      throw err;
    } finally {
      await this.session.close({ keepOpen: this.config.keepOpen });
    }
  }
}
