import fs from "node:fs";
import { pool } from "../pool.js";
import { publicToken } from "../../security/redact.js";

function normalizeTime(value, fallback = "09:00") {
  const raw = String(value || fallback).trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const hh = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function normalizeEmail(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return raw.toLowerCase();
}

function mapToken(t) {
  if (!t) return null;
  return {
    ...t,
    enabled: Boolean(t.enabled),
    schedule_enabled: Boolean(t.schedule_enabled),
    schedule_time: normalizeTime(t.schedule_time),
    schedule_timezone: t.schedule_timezone || null,
  };
}

function mapPublic(t) {
  return publicToken(mapToken(t));
}

export class TokenRepository {
  async list({ includeSecret = false } = {}) {
    const { rows } = await pool.query("SELECT * FROM tokens ORDER BY id ASC");
    return rows.map(includeSecret ? mapToken : mapPublic);
  }

  async listScheduled() {
    const { rows } = await pool.query(
      `SELECT * FROM tokens
       WHERE enabled = TRUE AND schedule_enabled = TRUE
       ORDER BY id ASC`
    );
    return rows.map(mapToken);
  }

  async getById(id, { includeSecret = true } = {}) {
    const { rows } = await pool.query("SELECT * FROM tokens WHERE id = $1", [id]);
    return includeSecret ? mapToken(rows[0]) : mapPublic(rows[0]);
  }

  async add({
    label,
    refreshToken,
    email = null,
    scheduleEnabled = false,
    scheduleTime = "09:00",
    scheduleTimezone = null,
  }) {
    const { rows } = await pool.query(
      `INSERT INTO tokens (
         label, refresh_token, email, enabled,
         schedule_enabled, schedule_time, schedule_timezone
       )
       VALUES ($1, $2, $3, TRUE, $4, $5, $6) RETURNING *`,
      [
        label || refreshToken.slice(0, 8),
        refreshToken,
        normalizeEmail(email),
        Boolean(scheduleEnabled),
        normalizeTime(scheduleTime),
        scheduleTimezone || null,
      ]
    );
    return mapPublic(rows[0]);
  }

  async update(id, patch) {
    const row = await this.getById(id, { includeSecret: true });
    if (!row) return null;
    const next = {
      label: patch.label ?? row.label,
      refresh_token: patch.refreshToken ?? row.refresh_token,
      username: patch.username ?? row.username,
      email:
        patch.email !== undefined
          ? normalizeEmail(patch.email)
          : row.email || null,
      enabled: patch.enabled == null ? row.enabled : Boolean(patch.enabled),
      schedule_enabled:
        patch.scheduleEnabled == null && patch.schedule_enabled == null
          ? row.schedule_enabled
          : Boolean(
              patch.scheduleEnabled != null
                ? patch.scheduleEnabled
                : patch.schedule_enabled
            ),
      schedule_time: normalizeTime(
        patch.scheduleTime ?? patch.schedule_time ?? row.schedule_time
      ),
      schedule_timezone:
        patch.scheduleTimezone !== undefined
          ? patch.scheduleTimezone || null
          : patch.schedule_timezone !== undefined
            ? patch.schedule_timezone || null
            : row.schedule_timezone,
      streak_current: patch.streak_current ?? row.streak_current,
      streak_previous: patch.streak_previous ?? row.streak_previous,
      streak_delta: patch.streak_delta ?? row.streak_delta,
      streak_longest: patch.streak_longest ?? row.streak_longest,
      streak_status: patch.streak_status ?? row.streak_status,
      streak_checked_at: patch.streak_checked_at ?? row.streak_checked_at,
      last_run_at: patch.last_run_at ?? row.last_run_at,
    };
    const { rows } = await pool.query(
      `UPDATE tokens SET
        label=$1, refresh_token=$2, username=$3, email=$4, enabled=$5,
        schedule_enabled=$6, schedule_time=$7, schedule_timezone=$8,
        streak_current=$9, streak_previous=$10, streak_delta=$11, streak_longest=$12,
        streak_status=$13, streak_checked_at=$14, last_run_at=$15, updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [
        next.label,
        next.refresh_token,
        next.username,
        next.email,
        next.enabled,
        next.schedule_enabled,
        next.schedule_time,
        next.schedule_timezone,
        next.streak_current,
        next.streak_previous,
        next.streak_delta,
        next.streak_longest,
        next.streak_status,
        next.streak_checked_at,
        next.last_run_at,
        id,
      ]
    );
    return mapPublic(rows[0]);
  }

  async recordStreak(
    id,
    { username, previous, current, longest, status, fromRun = false }
  ) {
    const row = await this.getById(id, { includeSecret: true });
    if (!row) return null;
    const prev =
      previous != null
        ? previous
        : row.streak_current != null
          ? row.streak_current
          : null;
    const curr = current != null ? current : row.streak_current;
    const delta = prev != null && curr != null ? curr - prev : null;
    return this.update(id, {
      username: username ?? row.username,
      streak_previous: prev,
      streak_current: curr,
      streak_delta: delta,
      streak_longest: longest ?? row.streak_longest,
      streak_status: status ?? row.streak_status,
      streak_checked_at: new Date().toISOString(),
      last_run_at: fromRun ? new Date().toISOString() : row.last_run_at,
    });
  }

  async listUserStreaks() {
    const tokens = await this.list({ includeSecret: false });
    return tokens.map((t) => ({
      id: t.id,
      label: t.label,
      username: t.username,
      enabled: t.enabled,
      scheduleEnabled: t.schedule_enabled,
      scheduleTime: t.schedule_time,
      scheduleTimezone: t.schedule_timezone,
      streakCurrent: t.streak_current,
      streakPrevious: t.streak_previous,
      streakDelta: t.streak_delta,
      streakLongest: t.streak_longest,
      streakStatus: t.streak_status,
      streakCheckedAt: t.streak_checked_at,
      lastRunAt: t.last_run_at,
    }));
  }

  async delete(id) {
    await pool.query("DELETE FROM tokens WHERE id = $1", [id]);
  }

  async importFromFile(filePath) {
    if (!fs.existsSync(filePath)) return 0;
    const lines = fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    let n = 0;
    for (const token of lines) {
      try {
        await this.add({
          label: `user_${token.slice(0, 8)}`,
          refreshToken: token,
        });
        n += 1;
      } catch {
        /* duplicate */
      }
    }
    return n;
  }

  async listWithRunCounts() {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.label,
        t.username,
        t.email,
        t.enabled,
        t.schedule_enabled,
        t.schedule_time,
        t.schedule_timezone,
        COUNT(r.id)::int AS run_count,
        MAX(r.started_at) AS last_run_at
      FROM tokens t
      LEFT JOIN runs r ON r.token_id = t.id
      GROUP BY t.id
      ORDER BY MAX(r.started_at) DESC NULLS LAST, t.id ASC
    `);
    return rows.map((r) => ({
      ...r,
      enabled: Boolean(r.enabled),
      schedule_enabled: Boolean(r.schedule_enabled),
    }));
  }
}

export const tokenRepository = new TokenRepository();
