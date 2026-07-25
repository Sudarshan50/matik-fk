import { pool } from "../pool.js";
import { tokenRepository } from "./TokenRepository.js";

export class StreakRepository {
  async addLog(entry) {
    await pool.query(
      `INSERT INTO streak_logs
       (token_id, run_id, username, label, streak_before, streak_after, streak_delta,
        streak_longest, answered, status, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        entry.token_id ?? null,
        entry.run_id ?? null,
        entry.username ?? null,
        entry.label ?? null,
        entry.streak_before ?? null,
        entry.streak_after ?? null,
        entry.streak_delta ?? null,
        entry.streak_longest ?? null,
        entry.answered ?? null,
        entry.status ?? null,
        entry.source ?? "run",
      ]
    );
  }

  async listLogs({ tokenId = null, limit = 200 } = {}) {
    if (tokenId) {
      const { rows } = await pool.query(
        "SELECT * FROM streak_logs WHERE token_id = $1 ORDER BY id DESC LIMIT $2",
        [Number(tokenId), limit]
      );
      return rows;
    }
    const { rows } = await pool.query(
      "SELECT * FROM streak_logs ORDER BY id DESC LIMIT $1",
      [limit]
    );
    return rows;
  }

  async byUser(limitPerUser = 30) {
    const tokens = await tokenRepository.list();
    const out = [];
    for (const t of tokens) {
      const { rows } = await pool.query(
        "SELECT * FROM streak_logs WHERE token_id = $1 ORDER BY id DESC LIMIT $2",
        [t.id, limitPerUser]
      );
      out.push({
        tokenId: t.id,
        label: t.label,
        username: t.username,
        current: t.streak_current,
        previous: t.streak_previous,
        delta: t.streak_delta,
        longest: t.streak_longest,
        logs: rows,
      });
    }
    return out;
  }

  async forRun(runId) {
    const { rows } = await pool.query(
      "SELECT * FROM streak_logs WHERE run_id = $1 ORDER BY id DESC",
      [runId]
    );
    return rows;
  }
}

export const streakRepository = new StreakRepository();
