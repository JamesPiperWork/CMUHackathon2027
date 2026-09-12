import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { io, Socket } from "socket.io-client";
import type { PlayerState } from "@fp/shared";
import { loginLive, logoutLive } from "./auth";
export const API =
  process.env.EXPO_PUBLIC_API_ORIGIN || "http://localhost:3001";
const key = "fantasy-phishing-session";
async function stored() {
  return Platform.OS === "web"
    ? typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(key)
      : null
    : SecureStore.getItemAsync(key);
}
async function persist(value: string | null) {
  if (Platform.OS === "web") {
    if (typeof sessionStorage !== "undefined") {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    }
  } else if (value) await SecureStore.setItemAsync(key, value);
  else await SecureStore.deleteItemAsync(key);
}
interface SessionContext {
  state: PlayerState | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  connected: boolean;
  mode: "demo" | "live";
  token: string | null;
  emailDelivery: "simulated" | "smtp-demo" | "live";
  startEmailSignIn: (email: string) => Promise<string>;
  verifyEmailSignIn: (requestId: string, code: string) => Promise<void>;
  createAccount: (name: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInLive: () => Promise<void>;
  signOut: () => Promise<void>;
  resetDemo: () => Promise<void>;
  request: <T = unknown>(
    path: string,
    body?: unknown,
    method?: string,
  ) => Promise<T>;
  refresh: () => Promise<void>;
  clearError: () => void;
}
const Context = createContext<SessionContext>(null!);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null),
    [state, setState] = useState<PlayerState | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [connected, setConnected] = useState(false),
    [mode, setMode] = useState<"demo" | "live">("demo");
  const [emailDelivery, setEmailDelivery] = useState<"simulated" | "smtp-demo" | "live">("simulated");
  const emailCsrf = useRef("");
  const tokenRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionEpoch = useRef(0);
  const refreshSequence = useRef(0);
  const appliedRevision = useRef(-1);
  const refreshSuspended = useRef(false);
  const storageWrites = useRef<Promise<unknown>>(Promise.resolve());
  const invalidateSession = useCallback(() => {
    sessionEpoch.current += 1;
    refreshSequence.current += 1;
    appliedRevision.current = -1;
    return sessionEpoch.current;
  }, []);
  const installSession = useCallback((nextToken: string | null) => {
    const epoch = invalidateSession();
    socketRef.current?.disconnect();
    tokenRef.current = nextToken;
    setToken(nextToken);
    setState(null);
    setConnected(false);
    if (!nextToken) {
      emailCsrf.current = "";
      refreshSuspended.current = false;
      setBusy(false);
    }
    // Native storage is asynchronous; an older sign-out must finish writing
    // before a newer sign-in persists its token.
    const saved = storageWrites.current.then(() => persist(nextToken));
    storageWrites.current = saved.catch(() => undefined);
    return { epoch, saved };
  }, [invalidateSession]);
  const beginTransition = () => {
    const epoch = invalidateSession();
    refreshSuspended.current = true;
    setBusy(true);
    setError(null);
    return epoch;
  };
  const finishTransition = (epoch: number) => {
    if (epoch !== sessionEpoch.current) return;
    refreshSuspended.current = false;
    if (tokenRef.current && socketRef.current?.connected) setConnected(true);
    setBusy(false);
  };
  const fetchApi = useCallback(
    async <T,>(path: string, body?: unknown, method?: string): Promise<T> => {
      const requestToken = tokenRef.current;
      const requestEpoch = sessionEpoch.current;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), (path === "/api/auth/email/start" || /^\/api\/phone\/(start|verify)$/.test(path) || /^\/api\/drafts\/[^/]+\/send$/.test(path)) ? 40000 : 15000);
      try {
        const response = await fetch(`${API}${path}`, {
          method: method || (body ? "POST" : "GET"),
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(requestToken
              ? { Authorization: `Bearer ${requestToken}` }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: abort.signal,
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 401 && requestToken && requestToken === tokenRef.current && requestEpoch === sessionEpoch.current && !refreshSuspended.current) {
            const ended = installSession(null);
            await ended.saved;
          }
          throw new Error(
            result.message ||
              result.error ||
              `Request failed (${response.status})`,
          );
        }
        return result as T;
      } catch (err) {
        if (err instanceof TypeError)
          throw new Error(
            "The game server is offline. Start the API, then try again.",
          );
        if (err instanceof Error && err.name === "AbortError")
          throw new Error(
            path.endsWith("/send") ? "Sending is taking longer than expected. Check this cast’s status before sending again." : "The server took too long. Your saved decisions are safe. Try again.",
          );
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    [installSession],
  );
  const refresh = useCallback(async () => {
    if (refreshSuspended.current) return;
    const requestEpoch = sessionEpoch.current;
    const requestToken = tokenRef.current;
    const sequence = ++refreshSequence.current;
    const current = () => !refreshSuspended.current && requestEpoch === sessionEpoch.current && requestToken === tokenRef.current && sequence === refreshSequence.current;
    try {
      if (!requestToken) {
        const config = await fetchApi<{ mode: "demo" | "live"; emailDelivery: "simulated" | "smtp-demo" | "live" }>("/api/config");
        if (!current()) return;
        setMode(config.mode);
        setEmailDelivery(config.emailDelivery);
        setError(null);
        return;
      }
      const next = await fetchApi<PlayerState>("/api/state");
      if (!current() || next.revision < appliedRevision.current) return;
      appliedRevision.current = next.revision;
      setState(next);
      setMode(next.mode);
      setEmailDelivery(next.emailDelivery ?? "simulated");
      setError(null);
    } catch (err) {
      if (!current()) return;
      setError(
        err instanceof Error ? err.message : "Could not refresh the match.",
      );
    }
  }, [fetchApi]);
  useEffect(() => {
    let active = true;
    let epoch = sessionEpoch.current;
    void (async () => {
      try {
        const config = await fetchApi<{ mode: "demo" | "live"; emailDelivery: "simulated" | "smtp-demo" | "live" }>("/api/config");
        if (!active || epoch !== sessionEpoch.current) return;
        setMode(config.mode); setEmailDelivery(config.emailDelivery);
        const saved = await stored();
        if (saved && active && epoch === sessionEpoch.current) {
          const restored = installSession(saved);
          epoch = restored.epoch;
          await restored.saved;
          if (!active || epoch !== sessionEpoch.current) return;
          await refresh();
        }
      } catch (err) {
        if (active && epoch === sessionEpoch.current)
          setError(err instanceof Error ? err.message : "Could not connect.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchApi, refresh, installSession]);
  useEffect(() => {
    if (!token) return;
    let mounted = true;
    let refreshing = false;
    const socket = io(API, {
      auth: { token },
      transports: ["polling", "websocket"],
      tryAllTransports: true,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      if (!mounted || tokenRef.current !== token || refreshSuspended.current) return;
      setConnected(true);
      void refresh();
    });
    socket.on("state:changed", () => { if (mounted && tokenRef.current === token) void refresh(); });
    socket.on("disconnect", () => { if (mounted && tokenRef.current === token) setConnected(false); });
    socket.on("connect_error", () => { if (mounted && tokenRef.current === token) setConnected(false); });
    const interval = setInterval(() => {
      if (!mounted || refreshing || refreshSuspended.current || tokenRef.current !== token) return;
      refreshing = true;
      void refresh().finally(() => {
        refreshing = false;
        // An intentional server disconnect disables Socket.IO's own retries.
        // Refresh first so an expired or revoked session cannot reconnect.
        if (
          mounted &&
          tokenRef.current === token &&
          !refreshSuspended.current &&
          !socket.connected &&
          !socket.active
        ) {
          socket.connect();
        }
      });
    }, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
        setConnected(false);
      }
    };
  }, [token, refresh]);
  const request = useCallback(
    async <T,>(path: string, body?: unknown, method?: string) => {
      const epoch = sessionEpoch.current;
      setBusy(true);
      setError(null);
      try {
        const result = await fetchApi<T>(path, body, method);
        if (epoch === sessionEpoch.current) await refresh();
        return result;
      } catch (err) {
        if (epoch === sessionEpoch.current) setError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Try again.",
        );
        throw err;
      } finally {
        if (epoch === sessionEpoch.current) setBusy(false);
      }
    },
    [fetchApi, refresh],
  );
  const completeSignIn = async (action: () => Promise<{ token: string }>, fallback: string) => {
    let epoch = beginTransition();
    try {
      const result = await action();
      if (epoch !== sessionEpoch.current) return;
      const installed = installSession(result.token);
      epoch = installed.epoch;
      await installed.saved;
      if (epoch !== sessionEpoch.current) return;
      refreshSuspended.current = false;
      await refresh();
    } catch (err) {
      if (epoch === sessionEpoch.current) setError(err instanceof Error ? err.message : fallback);
      throw err;
    } finally { finishTransition(epoch); }
  };
  const createAccount = (name: string, email: string, password: string) => completeSignIn(
    () => fetchApi<{ token: string }>("/api/account/register", { name, email, password }), "Could not create your account.",
  );
  const signIn = (email: string, password: string) => completeSignIn(
    () => fetchApi<{ token: string }>("/api/account/login", { email, password }), "Sign-in failed.",
  );
  const signInLive = () => safely(completeSignIn(async () => ({ token: (await loginLive()).accessToken }), "Auth0 sign-in failed."));
  const startEmailSignIn = async (email: string) => {
    const epoch = beginTransition();
    try {
      const transaction = await fetchApi<{ csrf: string }>("/api/auth/email");
      if (epoch !== sessionEpoch.current) throw new Error("Sign-in changed. Please try again.");
      emailCsrf.current = transaction.csrf;
      const result = await fetchApi<{ requestId: string }>("/api/auth/email/start", { email, csrf: transaction.csrf });
      if (epoch !== sessionEpoch.current) throw new Error("Sign-in changed. Please try again.");
      return result.requestId;
    } catch (err) {
      if (epoch === sessionEpoch.current) setError(err instanceof Error ? err.message : "Could not send a sign-in code");
      throw err;
    } finally { finishTransition(epoch); }
  };
  const verifyEmailSignIn = (requestId: string, code: string) => completeSignIn(
    () => fetchApi<{ token: string }>("/api/auth/email/verify", { requestId, code, csrf: emailCsrf.current }), "Could not verify that code",
  );
  const resetDemo = async () => {
    let epoch = beginTransition();
    try {
      const result = await fetchApi<{ ok: true; preserveSession: boolean }>("/api/demo/reset", { confirm: "RESET" });
      if (epoch !== sessionEpoch.current) return;
      if (result.preserveSession) {
        epoch = invalidateSession();
        refreshSuspended.current = false;
        await refresh();
      } else {
        const cleared = installSession(null);
        epoch = cleared.epoch;
        setBusy(true);
        refreshSuspended.current = true;
        await cleared.saved;
      }
      if (epoch === sessionEpoch.current) setError(null);
    } catch (err) {
      if (epoch === sessionEpoch.current) setError(err instanceof Error ? err.message : "Could not reset the demo.");
      throw err;
    } finally { finishTransition(epoch); }
  };
  const signOut = async () => {
    let epoch = beginTransition();
    try {
      if (tokenRef.current) await fetchApi("/api/session/logout", {});
      if (epoch !== sessionEpoch.current) return;
      const cleared = installSession(null);
      epoch = cleared.epoch;
      setBusy(true);
      refreshSuspended.current = true;
      await cleared.saved;
      if (epoch !== sessionEpoch.current) return;
      setError(null);
      if (mode === "live") await logoutLive();
    } catch {
      if (epoch === sessionEpoch.current) setError("Could not end the server session. Reconnect and try signing out again.");
    } finally { finishTransition(epoch); }
  };
  return (
    <Context.Provider
      value={{
        state,
        loading,
        busy,
        error,
        connected,
        mode,
        token,
        emailDelivery,
        startEmailSignIn,
        verifyEmailSignIn,
        createAccount,
        signIn,
        signInLive,
        signOut,
        resetDemo,
        request,
        refresh,
        clearError: () => setError(null),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  return useContext(Context);
}
export async function safely(promise: Promise<unknown>) {
  try {
    await promise;
  } catch {
    /* Error is displayed by the session banner. */
  }
}
