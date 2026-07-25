import fs from "node:fs";
import path from "node:path";

const LOG_ROOT = path.resolve("logs");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safe(s) {
  return String(s || "run")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 40);
}

/** Optional file mirror of logs (DB is source of truth). */
export class FileLogService {
  constructor(root = LOG_ROOT) {
    this.root = root;
  }

  pathsForRun(runId, label = "run") {
    const day = new Date().toISOString().slice(0, 10);
    const dir = path.join(this.root, day, `${safe(label)}_${runId.slice(0, 8)}`);
    ensureDir(dir);
    return {
      dir,
      events: path.join(dir, "events.log"),
      docker: path.join(dir, "docker.log"),
      meta: path.join(dir, "meta.json"),
    };
  }

  append(filePath, line) {
    try {
      ensureDir(path.dirname(filePath));
      const stamp = new Date().toISOString();
      fs.appendFileSync(filePath, `[${stamp}] ${line}\n`, "utf8");
    } catch (err) {
      console.warn("[logs] append failed:", err.message);
    }
  }

  writeMeta(filePath, data) {
    try {
      ensureDir(path.dirname(filePath));
      let prev = {};
      if (fs.existsSync(filePath)) {
        try {
          prev = JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch {
          prev = {};
        }
      }
      fs.writeFileSync(filePath, JSON.stringify({ ...prev, ...data }, null, 2));
    } catch (err) {
      console.warn("[logs] meta write failed:", err.message);
    }
  }

  listDays() {
    if (!fs.existsSync(this.root)) return [];
    return fs
      .readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();
  }
}

export const fileLogService = new FileLogService();
export { LOG_ROOT };
