let onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    onUnauthorized?.(data);
    const err = new Error(data.error || "unauthorized");
    err.status = 401;
    throw err;
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
