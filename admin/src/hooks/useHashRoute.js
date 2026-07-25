import { useEffect, useState } from "react";

/** Current hash path without query, e.g. "/", "/logs", "/streaks". */
export function useHashRoute() {
  const read = () => {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, qs = ""] = raw.split("?");
    return { path: path || "/", query: new URLSearchParams(qs), raw };
  };

  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return route;
}
