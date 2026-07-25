import { matiksGraphql, assertNoGraphqlErrors } from "./client.js";

const USER_QUERY = `
  query GetCurrentUser {
    user: getCurrentUser {
      _id
      username
      name
      userStreaks {
        currentStreak
        currentStreakWShieldDays
        longestStreak
        lastPlayedDate
        currentStreakStatus
        lastSevenDays
        streakFreezers
        streakShieldSlots
      }
    }
  }
`;

export async function fetchCurrentUser(accessToken, deviceId) {
  const json = await matiksGraphql(
    { operationName: "GetCurrentUser", query: USER_QUERY },
    { accessToken, deviceId }
  );
  assertNoGraphqlErrors(json);
  return json?.data?.user || null;
}

/** Streaks from getCurrentUser.userStreaks (live API). */
export async function fetchStreaks(accessToken, deviceId) {
  const user = await fetchCurrentUser(accessToken, deviceId);
  const s = user?.userStreaks;
  if (!s) throw new Error("No userStreaks on getCurrentUser");
  return {
    currentStreak: s.currentStreak ?? 0,
    currentStreakWShieldDays: s.currentStreakWShieldDays ?? 0,
    longestStreak: s.longestStreak ?? 0,
    lastPlayedDate: s.lastPlayedDate ?? null,
    currentStreakStatus: s.currentStreakStatus ?? null,
    lastSevenDays: s.lastSevenDays ?? [],
    streakFreezers: s.streakFreezers ?? 0,
    streakShieldSlots: s.streakShieldSlots ?? 0,
    source: "getCurrentUser.userStreaks",
  };
}
