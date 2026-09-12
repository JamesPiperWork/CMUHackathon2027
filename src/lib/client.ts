"use client";
// Tiny client-side helpers. The "acting player" is a demo convenience stored locally;
// all authority (caps, targeting, scoring) lives on the server.

export interface ActingPlayer {
  id: string;
  name: string;
  leagueId: string;
}

const KEY = "fp.acting";

export function getActing(): ActingPlayer | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActingPlayer) : null;
  } catch {
    return null;
  }
}

export function setActing(p: ActingPlayer) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  return res.json();
}
