import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry } from "./types";

export const historyId = () => `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function appendHistory(entry: Omit<HistoryEntry, "id" | "at"> & Partial<Pick<HistoryEntry, "id" | "at">>) {
  const full: HistoryEntry = {
    id: entry.id ?? historyId(),
    at: entry.at ?? Date.now(),
    kind: entry.kind,
    title: entry.title,
    detail: entry.detail,
    provider: entry.provider,
    ok: entry.ok,
  };
  try {
    await invoke("append_history_entry", { entry: full });
  } catch {
    const key = "athena.history.fallback.v1";
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as HistoryEntry[];
    localStorage.setItem(key, JSON.stringify([full, ...stored].slice(0, 500)));
  }
}

export async function loadHistory() {
  try {
    return await invoke<HistoryEntry[]>("get_history");
  } catch {
    return JSON.parse(localStorage.getItem("athena.history.fallback.v1") ?? "[]") as HistoryEntry[];
  }
}
