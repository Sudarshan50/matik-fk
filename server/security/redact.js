/** Hint for UI display — never enough to reconstruct the secret. */
export function tokenHint(value) {
  const s = String(value || "");
  if (s.length < 10) return s ? "••••" : null;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Strip secrets before API / log / SSE payloads leave the server. */
export function sanitizeEventBody(body = {}) {
  if (!body || typeof body !== "object") return body;
  const out = { ...body };
  if ("refreshToken" in out) {
    out.refreshTokenHint = tokenHint(out.refreshToken);
    out.rotated = true;
    delete out.refreshToken;
  }
  if ("accessToken" in out) {
    out.accessToken = "[redacted]";
  }
  if ("REFRESH_TOKEN" in out) {
    out.REFRESH_TOKEN = "[redacted]";
  }
  return out;
}

/** Public shape for token rows (never include full refresh_token). */
export function publicToken(row) {
  if (!row) return null;
  const { refresh_token, ...rest } = row;
  return {
    ...rest,
    refresh_token_hint: tokenHint(refresh_token),
  };
}
