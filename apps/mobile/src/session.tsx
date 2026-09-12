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
  signIn: (player: "alex" | "jordan" | "sam" | "riley" | "casey" | "morgan" | "jamie" | "taylor" | "operator") => Promise<void>;
  signInLive: () => Promise<void>;
  signOut: () => Promise<void>;
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
  const tokenRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fetchApi = useCallback(
    async <T,>(path: string, body?: unknown, method?: string): Promise<T> => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 15000);
      try {
        const response = await fetch(`${API}${path}`, {
          method: method || (body ? "POST" : "GET"),
          headers: {
            "Content-Type": "application/json",
            ...(tokenRef.current
              ? { Authorization: `Bearer ${tokenRef.current}` }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: abort.signal,
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
            tokenRef.current = null;
            setToken(null);
            setState(null);
            await persist(null);
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
            "The server took too long. Your saved decisions are safe. Try again.",
          );
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    [],
  );
  const refresh = useCallback(async () => {
    try {
      if (!tokenRef.current) {
        const config = await fetchApi<{ mode: "demo" | "live" }>("/api/config");
        setMode(config.mode);
        setError(null);
        return;
      }
      const next = await fetchApi<PlayerState>("/api/state");
      setState(next);
      setMode(next.mode);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not refresh the match.",
      );
    }
  }, [fetchApi]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const config = await fetchApi<{ mode: "demo" | "live" }>("/api/config");
        if (active) setMode(config.mode);
        const saved = await stored();
        if (saved && active) {
          tokenRef.current = saved;
          setToken(saved);
          await refresh();
        }
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : "Could not connect.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchApi, refresh]);
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
      setConnected(true);
      void refresh();
    });
    socket.on("state:changed", () => void refresh());
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    const interval = setInterval(() => {
      if (!mounted || refreshing) return;
      refreshing = true;
      void refresh().finally(() => {
        refreshing = false;
        // An intentional server disconnect disables Socket.IO's own retries.
        // Refresh first so an expired or revoked session cannot reconnect.
        if (
          mounted &&
          tokenRef.current === token &&
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
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, refresh]);
  const request = useCallback(
    async <T,>(path: string, body?: unknown, method?: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await fetchApi<T>(path, body, method);
        await refresh();
        return result;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Try again.",
        );
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [fetchApi, refresh],
  );
  const signIn = async (player: "alex" | "jordan" | "sam" | "riley" | "casey" | "morgan" | "jamie" | "taylor" | "operator") => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchApi<{ token: string }>("/api/demo/session", {
        player,
      });
      tokenRef.current = result.token;
      setToken(result.token);
      await persist(result.token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };
  const signInLive = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await loginLive();
      tokenRef.current = result.accessToken;
      setToken(result.accessToken);
      await persist(result.accessToken);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth0 sign-in failed.");
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    socketRef.current?.disconnect();
    tokenRef.current = null;
    setToken(null);
    setState(null);
    setError(null);
    await persist(null);
    if (mode === "live") await logoutLive();
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
        signIn,
        signInLive,
        signOut,
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
