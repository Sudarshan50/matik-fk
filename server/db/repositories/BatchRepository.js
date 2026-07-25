import { pool } from "../pool.js";

export class BatchRepository {
  async create({ id, kind, maxParallel, total }) {
    await pool.query(
      `INSERT INTO batches (id, kind, status, max_parallel, total)
       VALUES ($1, $2, 'running', $3, $4)`,
      [id, kind, maxParallel, total]
    );
  }

  async finish(id, status = "completed") {
    await pool.query(
      "UPDATE batches SET status=$1, finished_at=NOW() WHERE id=$2",
      [status, id]
    );
  }

  async recent(limit = 20) {
    const { rows } = await pool.query(
      "SELECT * FROM batches ORDER BY started_at DESC LIMIT $1",
      [limit]
    );
    return rows;
  }
}

export const batchRepository = new BatchRepository();
