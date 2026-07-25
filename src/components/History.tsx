import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry } from "../types";
import { loadHistory } from "../history";
import "./History.css";

const formatTime = (at: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(at);

export function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const refresh = async () => {
    const next = await loadHistory();
    setEntries(next);
    setSelectedId((current) => current || next[0]?.id || "");
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => `${entry.title} ${entry.detail} ${entry.kind}`.toLowerCase().includes(needle));
  }, [entries, query]);

  const selected = filtered.find((entry) => entry.id === selectedId) ?? filtered[0];

  const deleteEntry = async (id: string) => {
    await invoke("delete_history_entry", { id }).catch(() => undefined);
    await refresh();
  };

  const clearAll = async () => {
    await invoke("clear_history").catch(() => localStorage.removeItem("athena.history.fallback.v1"));
    setEntries([]);
    setSelectedId("");
  };

  return (
    <div className="hist">
      <div className="hist__top">
        <div>
          <h2 className="ws-sec__title">History</h2>
          <p className="ws-sec__blurb">Saved assistant responses, file actions, settings tests, and whiteboard activity.</p>
        </div>
        <button className="hist__button no-drag" onClick={() => void clearAll()} disabled={!entries.length}>Clear</button>
      </div>
      <input className="hist__search no-drag" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search history" />
      <div className="hist__body">
        <div className="hist__list no-drag">
          {filtered.map((entry) => (
            <button key={entry.id} className={`hist__item ${selected?.id === entry.id ? "is-active" : ""}`} onClick={() => setSelectedId(entry.id)}>
              <span className="hist__kind">{entry.kind}</span>
              <strong>{entry.title}</strong>
              <span>{formatTime(entry.at)}</span>
            </button>
          ))}
          {!filtered.length && <div className="ws-empty glass">No history found.</div>}
        </div>
        <section className="hist__detail glass">
          {selected ? (
            <>
              <div className="hist__detailTop">
                <span className={selected.ok ? "hist__ok" : "hist__err"}>{selected.ok ? "OK" : "Error"}</span>
                <button className="hist__button no-drag" onClick={() => void deleteEntry(selected.id)}>Delete</button>
              </div>
              <h3>{selected.title}</h3>
              <p className="hist__meta">{formatTime(selected.at)}{selected.provider ? ` - ${selected.provider}` : ""}</p>
              <pre>{selected.detail}</pre>
            </>
          ) : (
            <div className="ws-empty">Athena will store real activity here after actions run.</div>
          )}
        </section>
      </div>
    </div>
  );
}
