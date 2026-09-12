import { useEffect, useState } from "react";
import { API, useSession } from "./session";

/** Read-only league resources follow authoritative state revisions without triggering refresh loops. */
export function useLeagueResource<T>(path: string | null) {
  const { token, state } = useSession();
  const [result, setResult] = useState<{ path: string; data: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path || !token) return;
    const controller = new AbortController();
    void fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Could not load league data.");
        if (!controller.signal.aborted) { setResult({ path, data: body as T }); setError(null); }
      }).catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load league data."); });
    return () => controller.abort();
  }, [path, token, state?.revision, nonce]);
  return { data: result?.path === path ? result.data : null, error, reload: () => setNonce((current) => current + 1) };
}
