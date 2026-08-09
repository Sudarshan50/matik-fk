import fs from "node:fs";
import path from "node:path";

const DEFAULT_SEARCH =
  "https://matiks.com/search?gameType=DMAS&gameMode=ONLINE_SEARCH&timeLimit=1";

export const HOME_URL = "https://matiks.com/home";

export function loadBotConfig(env = process.env) {
  const refreshToken = env.REFRESH_TOKEN;
  if (!refreshToken) throw new Error("REFRESH_TOKEN env var is required");

  const label = env.BOT_LABEL || refreshToken.slice(0, 8);
  return {
    refreshToken,
    label,
    deviceId: env.MATIKS_DEVICE_ID || `bot_${label}`,
    searchUrl: resolveSearchUrl(env),
    loops: Number(env.MATCH_LOOPS || 1),
    headed: env.HEADED === "1",
    keepOpen: env.KEEP_OPEN === "1",
    matchTimeoutMs: Number(env.MATCH_TIMEOUT_MS || 90000),
    keepAliveMs: Number(env.KEEPALIVE_MS || 180),
    matchRetries: Number(env.BOT_MATCH_RETRIES || 2),
    maxAnswersMin: Number(env.BOT_MAX_ANSWERS_MIN || 20),
    maxAnswersMax: Number(env.BOT_MAX_ANSWERS_MAX || 40),
    thinkDelayMinMs: Number(env.BOT_THINK_DELAY_MIN_MS || 450),
    thinkDelayMaxMs: Number(env.BOT_THINK_DELAY_MAX_MS || 1400),
    keyDelayMinMs: Number(env.BOT_KEY_DELAY_MIN_MS || 70),
    keyDelayMaxMs: Number(env.BOT_KEY_DELAY_MAX_MS || 180),
    postAnswerDelayMinMs: Number(env.BOT_POST_ANSWER_DELAY_MIN_MS || 900),
    postAnswerDelayMaxMs: Number(env.BOT_POST_ANSWER_DELAY_MAX_MS || 2400),
  };
}

export function resolveSearchUrl(env = process.env) {
  if (env.SEARCH_URL) return env.SEARCH_URL;
  const findingPath = env.FINDING_FILE || path.resolve("finding.txt");
  if (fs.existsSync(findingPath)) {
    const line = fs
      .readFileSync(findingPath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("http"));
    if (line) return line.split(/\s*--->/)[0].trim();
  }
  return DEFAULT_SEARCH;
}
