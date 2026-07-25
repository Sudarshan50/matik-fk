import { useEffect, useState } from "react";
import { api } from "../api/client.js";

/**
 * Syncs to server clock, then ticks locally using the measured offset.
 */
export function useServerTime(resyncMs = 30000) {
  const [state, setState] = useState({
    now: null,
    timezone: "",
    synced: false,
  });

  useEffect(() => {
    let offset = 0;
    let timezone = "";
    let timer;
    let alive = true;

    async function sync() {
      try {
        const t0 = Date.now();
        const data = await api("/api/time");
        const t1 = Date.now();
        const rtt = Math.max(0, t1 - t0);
        offset = data.epochMs + rtt / 2 - t1;
        timezone = data.timezone || "";
        if (!alive) return;
        setState({
          now: new Date(Date.now() + offset),
          timezone,
          synced: true,
        });
      } catch {
        if (!alive) return;
        setState((prev) => ({
          now: new Date(),
          timezone: prev.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          synced: false,
        }));
      }
    }

    sync();
    const resync = setInterval(sync, resyncMs);
    timer = setInterval(() => {
      if (!alive) return;
      setState((prev) => ({
        ...prev,
        now: new Date(Date.now() + offset),
      }));
    }, 1000);

    return () => {
      alive = false;
      clearInterval(resync);
      clearInterval(timer);
    };
  }, [resyncMs]);

  return state;
}

export function formatServerClock(date, timezone) {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone || undefined,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
