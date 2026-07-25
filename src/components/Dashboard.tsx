import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AssistantState, DeviceContext, HistoryEntry } from "../types";
import { loadHistory } from "../history";
import "./Dashboard.css";

interface Props {
  state: AssistantState;
  onOpenSection: (section: "whiteboards" | "files" | "history" | "screenshots" | "skills" | "settings") => void;
}

const quickActions = [
  { label: "Whiteboard", section: "whiteboards" as const, hint: "Draw, explain, solve" },
  { label: "Files", section: "files" as const, hint: "Read notes and folders" },
  { label: "Quiz Me", section: "history" as const, hint: "Review recent work" },
  { label: "Brain", section: "skills" as const, hint: "Knowledge map" },
];

export function Dashboard({ state, onOpenSection }: Props) {
  const [context, setContext] = useState<DeviceContext | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    void invoke<DeviceContext>("get_device_context").then(setContext).catch(() => undefined);
    void loadHistory().then((entries) => setHistory(entries.slice(0, 4)));
  }, []);

  return (
    <div className="dash">
      <section className="dash__hero glass">
        <div>
          <span className="dash__eyebrow">Student command center</span>
          <h2>Athena is {state === "idle" ? "ready" : state}.</h2>
          <p>{context ? context.today : "Loading local context..."}</p>
        </div>
        <div className="dash__orb" data-state={state}>
          <i />
          <span>{state}</span>
        </div>
      </section>

      <div className="dash__grid">
        <section className="dash__panel glass">
          <h3>Quick Actions</h3>
          <div className="dash__actions no-drag">
            {quickActions.map((action) => (
              <button key={action.label} onClick={() => onOpenSection(action.section)}>
                <strong>{action.label}</strong>
                <span>{action.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="dash__panel glass">
          <h3>Study Flow</h3>
          <div className="dash__steps">
            <span>1. Open notes or capture screen</span>
            <span>2. Ask for summary, quiz, or flashcards</span>
            <span>3. Draw on whiteboard while Athena explains</span>
          </div>
        </section>

        <section className="dash__panel dash__panel--wide glass">
          <h3>Recent Activity</h3>
          <div className="dash__recent">
            {history.map((entry) => (
              <div key={entry.id}>
                <strong>{entry.title}</strong>
                <span>{entry.kind} - {new Date(entry.at).toLocaleString()}</span>
              </div>
            ))}
            {!history.length && <p>No recent activity yet. Try “open whiteboard” or “search web for algebra practice”.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
