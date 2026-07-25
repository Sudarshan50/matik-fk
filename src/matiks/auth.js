import { pathToFileURL } from "node:url";
import { matiksGraphql, assertNoGraphqlErrors } from "./client.js";

const REFRESH_MUTATION = `
  mutation RefreshAccessTokenNative($refreshToken: String!) {
    refreshAccessTokenNative(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`;

/** Renew a Matiks session from a native refresh token. */
export async function refreshSession(refreshToken, { deviceId } = {}) {
  if (!refreshToken) throw new Error("refreshToken is required");

  const json = await matiksGraphql(
    {
      operationName: "RefreshAccessTokenNative",
      variables: { refreshToken },
      query: REFRESH_MUTATION,
    },
    { deviceId }
  );
  assertNoGraphqlErrors(json, "Refresh failed");

  const payload = json?.data?.refreshAccessTokenNative;
  if (!payload?.accessToken) {
    throw new Error(`Refresh returned no accessToken: ${JSON.stringify(json)}`);
  }

  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken || refreshToken,
  };
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli || process.env.RUN_AUTH_CLI === "1") {
  const token = process.env.REFRESH_TOKEN || process.argv[2];
  const session = await refreshSession(token);
  console.log(
    JSON.stringify(
      {
        ok: true,
        refreshToken: session.refreshToken,
        accessToken: `${session.accessToken.slice(0, 24)}...`,
      },
      null,
      2
    )
  );
}
