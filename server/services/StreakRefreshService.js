import { refreshSession, fetchCurrentUser, fetchStreaks } from "../../src/matiks/index.js";
import { tokenRepository } from "../db/index.js";
import { eventBus } from "../shared/EventBus.js";

/** Refreshes live streaks for tokens via Matiks API. */
export class StreakRefreshService {
  async refresh({ tokenIds } = {}) {
    const ids = tokenIds?.map(Number);
    let tokens = (await tokenRepository.list({ includeSecret: true })).filter(
      (t) => t.enabled
    );
    if (ids?.length) tokens = tokens.filter((t) => ids.includes(t.id));

    const results = [];
    for (const token of tokens) {
      try {
        const session = await refreshSession(token.refresh_token, {
          deviceId: `admin_streak_${token.id}`,
        });
        if (session.refreshToken !== token.refresh_token) {
          await tokenRepository.update(token.id, {
            refreshToken: session.refreshToken,
          });
        }
        const user = await fetchCurrentUser(
          session.accessToken,
          `admin_streak_${token.id}`
        );
        const streak = await fetchStreaks(
          session.accessToken,
          `admin_streak_${token.id}`
        );
        const saved = await tokenRepository.recordStreak(token.id, {
          username: user?.username,
          previous: token.streak_current,
          current: streak.currentStreak,
          longest: streak.longestStreak,
          status: streak.currentStreakStatus,
        });
        results.push({
          id: token.id,
          ok: true,
          username: user?.username,
          streakCurrent: saved.streak_current,
          streakPrevious: saved.streak_previous,
          streakDelta: saved.streak_delta,
          streakLongest: saved.streak_longest,
        });
      } catch (err) {
        results.push({
          id: token.id,
          ok: false,
          error: err.message,
          label: token.label,
        });
      }
    }

    const users = await tokenRepository.listUserStreaks();
    eventBus.emit("streaks", { users });
    return { users, results };
  }
}

export const streakRefreshService = new StreakRefreshService();
