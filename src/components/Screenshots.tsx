import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types";
import "./Screenshots.css";

export function Screenshots() {
  const [items, setItems] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [message, setMessage] = useState("");
  const [imageError, setImageError] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);

  const refresh = async () => {
    try {
      const next = await invoke<FileEntry[]>("list_screenshots");
      const screenshots = next.filter((item) => !item.isDir && item.name.toLowerCase().endsWith(".png")).reverse();
      setItems(screenshots);
      setSelected((current) => screenshots.find((item) => item.path === current?.path) ?? screenshots[0] ?? null);
      setImageError("");
      setMessage(screenshots.length ? `${screenshots.length} screenshots` : "No screenshots yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const capture = async () => {
    setMessage("Capturing screen...");
    try {
      await invoke("take_screenshot");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selectedSrc = selected ? convertFileSrc(selected.path) : "";

  return (
    <div className="shots">
      <div className="shots__top">
        <div>
          <h2 className="ws-sec__title">Screenshots</h2>
          <p className="ws-sec__blurb">Capture your screen and keep it available in Athena.</p>
        </div>
        <button className="shots__button no-drag" onClick={() => void capture()}>Capture</button>
      </div>
      <div className="shots__status">{message}</div>
      <div className="shots__body">
        <div className="shots__grid no-drag">
          {items.map((item) => (
            <button key={item.path} className={`shots__thumb ${selected?.path === item.path ? "is-active" : ""}`} onClick={() => { setSelected(item); setImageError(""); }}>
              <img src={convertFileSrc(item.path)} alt={item.name} loading="lazy" />
              <span>{item.name}</span>
            </button>
          ))}
          {!items.length && <div className="ws-empty glass">Say "take screenshot" or press Capture.</div>}
        </div>
        <div className="shots__preview glass">
          {selected ? (
            <>
              <button className="shots__imageButton no-drag" onClick={() => setViewerOpen(true)}>
                <img src={selectedSrc} alt={selected.name} onError={() => setImageError("Image failed to load. The screenshot file exists, but Tauri could not serve it yet.")} />
              </button>
              <div className="shots__meta">
                <strong>{selected.name}</strong>
                <span>{selected.path}</span>
                {imageError && <em>{imageError}</em>}
              </div>
            </>
          ) : (
            <div className="ws-empty">No screenshot selected.</div>
          )}
        </div>
      </div>
      {viewerOpen && selected && (
        <div className="shots__viewer" onClick={() => setViewerOpen(false)}>
          <button className="shots__viewerClose no-drag" aria-label="Close image viewer">x</button>
          <img src={selectedSrc} alt={selected.name} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
