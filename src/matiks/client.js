const API_URL = process.env.MATIKS_API_URL || "https://server.matiks.com/api";

/**
 * Thin GraphQL transport for Matiks (DIP: callers depend on this, not fetch details).
 */
export async function matiksGraphql(body, { accessToken, deviceId } = {}) {
  const headers = {
    "content-type": "application/json",
    "x-is-new-auth": "true",
    "x-app-version": process.env.MATIKS_APP_VERSION || "1.25.2",
    "x-device-id": deviceId || process.env.MATIKS_DEVICE_ID || `bot_${Date.now()}`,
    origin: "https://matiks.com",
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

export function assertNoGraphqlErrors(json, label = "GraphQL") {
  if (json?.errors?.length) {
    throw new Error(
      `${label}: ${json.errors.map((e) => e.message).join("; ")}`
    );
  }
}
