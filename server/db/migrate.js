import { pool } from "./pool.js";

const DEFAULTS = {
  schedule_enabled: "0",
  schedule_time: "09:00",
  timezone: "Asia/Kolkata",
  max_parallel: "2",
  match_loops: "1",
  search_url:
    "https://matiks.com/search?gameType=DMAS&gameMode=ONLINE_SEARCH&timeLimit=1",
  stagger_seconds: "15",
  max_retries: "2",
  failsafe_timeout_min: "8",
};

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tokens (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      refresh_token TEXT NOT NULL UNIQUE,
      username TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      streak_current INTEGER,
      streak_previous INTEGER,
      streak_delta INTEGER,
      streak_longest INTEGER,
      streak_status TEXT,
      streak_checked_at TIMESTAMPTZ,
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      max_parallel INTEGER NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      token_id INTEGER REFERENCES tokens(id),
      label TEXT,
      username TEXT,
      container_name TEXT,
      status TEXT NOT NULL,
      phase TEXT,
      answered INTEGER DEFAULT 0,
      streak_before INTEGER,
      streak_after INTEGER,
      streak_delta INTEGER,
      error TEXT,
      last_event TEXT,
      log_dir TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      run_id TEXT NOT NULL,
      event TEXT NOT NULL,
      payload JSONB,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS streak_logs (
      id SERIAL PRIMARY KEY,
      token_id INTEGER,
      run_id TEXT,
      username TEXT,
      label TEXT,
      streak_before INTEGER,
      streak_after INTEGER,
      streak_delta INTEGER,
      streak_longest INTEGER,
      answered INTEGER,
      status TEXT,
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS run_logs (
      id SERIAL PRIMARY KEY,
      run_id TEXT NOT NULL,
      token_id INTEGER,
      username TEXT,
      label TEXT,
      stream TEXT NOT NULL DEFAULT 'events',
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      meta JSONB,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_run_logs_run_id ON run_logs(run_id);
    CREATE INDEX IF NOT EXISTS idx_run_logs_token_id ON run_logs(token_id);
    CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
    CREATE INDEX IF NOT EXISTS idx_streak_logs_token_id ON streak_logs(token_id);
  `);

  await pool.query(`
    ALTER TABLE tokens
      ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS schedule_time TEXT NOT NULL DEFAULT '09:00',
      ADD COLUMN IF NOT EXISTS schedule_timezone TEXT;
  `);

  await pool.query(`
    ALTER TABLE tokens
      ADD COLUMN IF NOT EXISTS email TEXT;
  `);

  for (const [key, value] of Object.entries(DEFAULTS)) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }

  // One-time: if the old global schedule was armed, copy it onto enabled tokens.
  const { rows: migrated } = await pool.query(
    `SELECT value FROM settings WHERE key = 'schedule_migrated_to_tokens'`
  );
  if (!migrated[0]) {
    const { rows: settingsRows } = await pool.query(
      `SELECT key, value FROM settings
       WHERE key IN ('schedule_enabled', 'schedule_time', 'timezone')`
    );
    const s = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    if (s.schedule_enabled === "1") {
      await pool.query(
        `UPDATE tokens SET
           schedule_enabled = TRUE,
           schedule_time = $1,
           schedule_timezone = $2
         WHERE enabled = TRUE`,
        [s.schedule_time || "09:00", s.timezone || "Asia/Kolkata"]
      );
      await pool.query(
        `UPDATE settings SET value = '0' WHERE key = 'schedule_enabled'`
      );
    }
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('schedule_migrated_to_tokens', '1')
       ON CONFLICT (key) DO NOTHING`
    );
  }
}
