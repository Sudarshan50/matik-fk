import { pool } from "../pool.js";

export class SettingsRepository {
  async getAll() {
    const { rows } = await pool.query("SELECT key, value FROM settings");
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async setMany(patch) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [k, v] of Object.entries(patch)) {
        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [k, String(v)]
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return this.getAll();
  }
}

export const settingsRepository = new SettingsRepository();
