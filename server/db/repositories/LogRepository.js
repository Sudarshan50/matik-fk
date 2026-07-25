import { pool } from "../pool.js";

export class LogRepository {
  async append({
    runId,
    tokenId = null,
    username = null,
    label = null,
    stream = "events",
    level = "info",
    message,
    meta = null,
  }) {
    if (!runId || message == null || message === "") return;
    await pool.query(
      `INSERT INTO run_logs (run_id, token_id, username, label, stream, level, message, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        runId,
        tokenId,
        username,
        label,
        stream,
        level,
        String(message),
        meta ? JSON.stringify(meta) : null,
      ]
    );
  }

  async list(runId, { stream = null, limit = 5000 } = {}) {
    if (stream) {
      const { rows } = await pool.query(
        `SELECT * FROM run_logs WHERE run_id = $1 AND stream = $2
         ORDER BY id ASC LIMIT $3`,
        [runId, stream, limit]
      );
      return rows;
    }
    const { rows } = await pool.query(
      "SELECT * FROM run_logs WHERE run_id = $1 ORDER BY id ASC LIMIT $2",
      [runId, limit]
    );
    return rows;
  }
}

export const logRepository = new LogRepository();
