import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DeviceContext, FileEntry, FileReadResult } from "../types";
import { appendHistory } from "../history";
import "./Files.css";

// Resolved to the user's home directory on any OS via the backend's expand_user_path.
const defaultPath = "~";

const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

export function Files() {
  const [path, setPath] = useState(defaultPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [readResult, setReadResult] = useState<FileReadResult | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [context, setContext] = useState<DeviceContext | null>(null);

  const sortedEntries = useMemo(() => entries, [entries]);

  const load = async (target = path) => {
    setMessage("Loading...");
    try {
      const next = await invoke<FileEntry[]>("list_directory", { path: target });
      setEntries(next);
      setPath(target);
      setSelected(null);
      setReadResult(null);
      setMessage(`${next.length} items`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void invoke<DeviceContext>("get_device_context").then(setContext).catch(() => undefined);
    void load(defaultPath);
  }, []);

  const openEntry = async (entry: FileEntry) => {
    setSelected(entry);
    setReadResult(null);
    if (entry.isDir) {
      await load(entry.path);
      return;
    }
    try {
      const result = await invoke<FileReadResult>("read_text_file", { path: entry.path });
      setReadResult(result);
      setMessage(result.truncated ? "File loaded with truncation" : "File loaded");
      await appendHistory({ kind: "file", title: `Read ${entry.name}`, detail: entry.path, ok: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const parentPath = () => {
    const normalized = path.replace(/[\\/]+$/, "");
    const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
    return index > 2 ? normalized.slice(0, index) : normalized;
  };

  const search = async () => {
    setMessage("Searching...");
    try {
      const next = await invoke<FileEntry[]>("search_files", { root: path, query });
      setEntries(next);
      setMessage(`${next.length} matches`);
      await appendHistory({ kind: "file", title: `Search ${query}`, detail: path, ok: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="files">
      <div className="files__head">
        <div>
          <h2 className="ws-sec__title">Files</h2>
          <p className="ws-sec__blurb">Browse folders, read text files, and give Athena local context.</p>
        </div>
      </div>
      {context && (
        <div className="files__context glass">
          <span>{context.today}</span>
          <span>{context.os} {context.arch}</span>
          <span>{context.timezone}</span>
        </div>
      )}
      <div className="files__bar no-drag">
        <button onClick={() => void load(parentPath())}>Up</button>
        <input value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load()} />
        <button onClick={() => void load()}>Open</button>
      </div>
      <div className="files__bar no-drag">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} placeholder="Search names in this folder" />
        <button onClick={() => void search()}>Search</button>
      </div>
      <div className="files__status">{message}</div>
      <div className="files__body">
        <div className="files__list no-drag">
          {sortedEntries.map((entry) => (
            <button key={entry.path} className={`files__entry ${selected?.path === entry.path ? "is-active" : ""}`} onClick={() => void openEntry(entry)}>
              <span>{entry.isDir ? "Folder" : "File"}</span>
              <strong>{entry.name}</strong>
              <em>{entry.isDir ? entry.path : formatSize(entry.size)}</em>
            </button>
          ))}
        </div>
        <section className="files__preview glass">
          {readResult ? (
            <>
              <h3>{selected?.name}</h3>
              <p>{readResult.path}{readResult.truncated ? " - truncated" : ""}</p>
              <pre>{readResult.content}</pre>
            </>
          ) : (
            <div className="ws-empty">Select a text file to preview it here.</div>
          )}
        </section>
      </div>
    </div>
  );
}
