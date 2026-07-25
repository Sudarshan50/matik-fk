import { pool } from "../pool.js";

export class RunRepository {
  async create(run) {
    await pool.query(
      `INSERT INTO runs
       (id, batch_id, token_id, label, username, container_name, status, phase, log_dir)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        run.id,
        run.batch_id ?? null,
        run.token_id ?? null,
        run.label ?? null,
        run.username ?? null,
        run.container_name ?? null,
        run.status,
        run.phase ?? null,
        run.log_dir ?? null,
      ]
    );
  }

  async get(id) {
    const { rows } = await pool.query("SELECT * FROM runs WHERE id = $1", [id]);
    return rows[0] || null;
  }

  async update(id, patch) {
    const row = await this.get(id);
    if (!row) return null;
    const next = { ...row, ...patch };
    const { rows } = await pool.query(
      `UPDATE runs SET
        status=$1, phase=$2, answered=$3, streak_before=$4, streak_after=$5,
        streak_delta=$6, error=$7, last_event=$8, username=$9, finished_at=$10,
        container_name=$11, log_dir=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [
        next.status,
        next.phase,
        next.answered,
        next.streak_before,
        next.streak_after,
        next.streak_delta,
        next.error,
        next.last_event,
        next.username,
        next.finished_at,
        next.container_name,
        next.log_dir,
        id,
      ]
    );
    return rows[0];
  }

  async list(limit = 100) {
    const { rows } = await pool.query(
      "SELECT * FROM runs ORDER BY started_at DESC LIMIT $1",
      [limit]
    );
    return rows;
  }

  async listActive() {
    const { rows } = await pool.query(
      `SELECT * FROM runs
       WHERE status IN ('queued','starting','running','retrying')
       ORDER BY started_at DESC`
    );
    return rows;
  }

  async listForToken(tokenId, limit = 50) {
    const { rows } = await pool.query(
      "SELECT * FROM runs WHERE token_id = $1 ORDER BY started_at DESC LIMIT $2",
      [tokenId, limit]
    );
    return rows;
  }

  async addEvent(runId, event, payload) {
    await pool.query(
      "INSERT INTO events (run_id, event, payload) VALUES ($1, $2, $3::jsonb)",
      [runId, event, JSON.stringify(payload || {})]
    );
  }

  async listEvents(runId, limit = 200) {
    const { rows } = await pool.query(
      "SELECT * FROM events WHERE run_id = $1 ORDER BY id ASC LIMIT $2",
      [runId, limit]
    );
    return rows.map((e) => ({
      ...e,
      payload:
        typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload,
    }));
  }
}

export const runRepository = new RunRepository();
