import { randomBytes } from "node:crypto";
import { loadEnvFile } from "./loadEnv.js";

function requireNonEmpty(env, key) {
  const value = String(env[key] || "").trim();
  if (!value) {
    throw new Error(
      `Missing required env ${key}. Copy .env.example → .env and set strong secrets before starting.`
    );
  }
  return value;
}

/**
 * Load server config.
 * Production (and public deploys) always require explicit secrets — no weak defaults.
 * Set ALLOW_INSECURE_DEFAULTS=1 only for throwaway local experiments.
 */
export function loadServerConfig(env = process.env) {
  // ESM imports can load this before index.js calls loadEnvFile().
  if (env === process.env) loadEnvFile();

  const isProd = String(env.NODE_ENV || "").toLowerCase() === "production";
  const allowInsecure =
    String(env.ALLOW_INSECURE_DEFAULTS || "").toLowerCase() === "1";

  if (isProd && allowInsecure) {
    throw new Error("ALLOW_INSECURE_DEFAULTS cannot be used when NODE_ENV=production");
  }

  let username;
  let password;
  let sessionSecret;
  let botToken;
  let databaseUrl;

  if (allowInsecure) {
    username = String(env.ADMIN_USERNAME || "admin").trim();
    password = String(env.ADMIN_PASSWORD || "admin").trim();
    sessionSecret =
      String(env.ADMIN_SESSION_SECRET || "").trim() ||
      randomBytes(32).toString("hex");
    botToken =
      String(env.ADMIN_BOT_TOKEN || "").trim() || randomBytes(24).toString("hex");
    databaseUrl =
      String(env.DATABASE_URL || "").trim() ||
      "postgres://matik:matik@127.0.0.1:55432/matik";
    console.warn(
      "[auth] ALLOW_INSECURE_DEFAULTS=1 — do not use on any shared or production host"
    );
  } else {
    username = requireNonEmpty(env, "ADMIN_USERNAME");
    password = requireNonEmpty(env, "ADMIN_PASSWORD");
    sessionSecret = requireNonEmpty(env, "ADMIN_SESSION_SECRET");
    botToken = requireNonEmpty(env, "ADMIN_BOT_TOKEN");
    databaseUrl = requireNonEmpty(env, "DATABASE_URL");
  }

  if (password.length < 16) {
    throw new Error("ADMIN_PASSWORD must be at least 16 characters");
  }
  if (sessionSecret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters");
  }
  if (botToken.length < 32) {
    throw new Error("ADMIN_BOT_TOKEN must be at least 32 characters");
  }

  return {
    port: Number(env.PORT || 8787),
    databaseUrl,
    adminPublicUrl:
      env.ADMIN_PUBLIC_URL || `http://host.docker.internal:${env.PORT || 8787}`,
    composeProjectDir: env.COMPOSE_PROJECT_DIR || undefined,
    tokensFile: env.TOKENS_FILE || "tokens.txt",
    auth: {
      username,
      password,
      sessionSecret,
      botToken,
      cookieSecure:
        String(env.ADMIN_COOKIE_SECURE || "").toLowerCase() === "true" ||
        String(env.ADMIN_PUBLIC_URL || "").startsWith("https://"),
    },
    smtp: {
      enabled:
        String(env.SMTP_ENABLED || "").toLowerCase() === "1" ||
        String(env.SMTP_ENABLED || "").toLowerCase() === "true",
      host: String(env.SMTP_HOST || "").trim(),
      port: Number(env.SMTP_PORT || 465),
      secure:
        env.SMTP_SECURE == null || env.SMTP_SECURE === ""
          ? Number(env.SMTP_PORT || 465) === 465
          : String(env.SMTP_SECURE).toLowerCase() === "1" ||
            String(env.SMTP_SECURE).toLowerCase() === "true",
      user: String(env.SMTP_USER || "").trim(),
      pass: String(env.SMTP_PASS || "").trim(),
      from: String(env.SMTP_FROM || "").trim(),
    },
  };
}
