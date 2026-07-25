import { useEffect, useState } from "react";
import type { AssistantState, ProviderConfig, VoiceSettings } from "../types";
import { AthenaMark } from "./AthenaMark";
import { Dashboard } from "./Dashboard";
import { Files } from "./Files";
import { History } from "./History";
import { Screenshots } from "./Screenshots";
import { Settings } from "./Settings";
import { Skills } from "./Skills";
import { Whiteboard } from "./Whiteboard";
import "./Workspace.css";

export type WorkspaceSectionKey = Section;

interface Props {
  open: boolean;
  closing: boolean;
  initialSection?: WorkspaceSectionKey;
  providerConfig: ProviderConfig;
  voiceSettings: VoiceSettings;
  assistantState: AssistantState;
  onProviderConfigChange: (config: ProviderConfig) => void;
  onVoiceSettingsChange: (settings: VoiceSettings) => void;
  onClose: () => void;
}

type Section =
  | "dashboard"
  | "conversations"
  | "history"
  | "memory"
  | "whiteboards"
  | "screenshots"
  | "files"
  | "projects"
  | "skills"
  | "settings";

const NAV: { key: Section; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "✦" },
  { key: "conversations", label: "Conversations", icon: "◉" },
  { key: "history", label: "History", icon: "⧗" },
  { key: "memory", label: "Memory", icon: "❖" },
  { key: "whiteboards", label: "Whiteboards", icon: "✎" },
  { key: "screenshots", label: "Screenshots", icon: "▢" },
  { key: "files", label: "Files", icon: "⧉" },
  { key: "projects", label: "Projects", icon: "◈" },
  { key: "skills", label: "Skills", icon: "◌" },
  { key: "settings", label: "Settings", icon: "⚙" },
];

export function Workspace({ open, closing, initialSection, providerConfig, voiceSettings, assistantState, onProviderConfigChange, onVoiceSettingsChange, onClose }: Props) {
  const [section, setSection] = useState<Section>(initialSection ?? "dashboard");

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  if (!open) return null;

  return (
    <div className="ws-overlay" data-closing={closing} onMouseDown={closing ? undefined : onClose}>
      <div className="ws glass-strong" onMouseDown={(e) => e.stopPropagation()}>
        <aside className="ws__side">
          <div className="ws__brand">
            <AthenaMark size={30} />
            <span className="ws__brandname">Athena</span>
          </div>
          <nav className="ws__nav">
            {NAV.map((n) => (
              <button
                key={n.key}
                className={`ws__navbtn ${section === n.key ? "is-active" : ""}`}
                onClick={() => setSection(n.key)}
              >
                <span className="ws__navicon">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </nav>
          <div className="ws__hint">Close hides Athena to tray</div>
        </aside>

        <main className="ws__content">
          <button className="ws__close no-drag" onClick={onClose} aria-label="Close workspace">
            ×
          </button>
          {section === "dashboard" ? (
            <Dashboard state={assistantState} onOpenSection={setSection} />
          ) : section === "settings" ? (
            <Settings
              providerConfig={providerConfig}
              voiceSettings={voiceSettings}
              onProviderConfigChange={onProviderConfigChange}
              onVoiceSettingsChange={onVoiceSettingsChange}
            />
          ) : section === "history" ? (
            <History />
          ) : section === "files" ? (
            <Files />
          ) : section === "screenshots" ? (
            <Screenshots providerConfig={providerConfig} />
          ) : section === "whiteboards" ? (
            <Whiteboard />
          ) : section === "skills" ? (
            <Skills state={assistantState} />
          ) : (
            <WorkspaceSection section={section} />
          )}
        </main>
      </div>
    </div>
  );
}

const EMPTY: Record<Exclude<Section, "settings" | "dashboard">, { title: string; blurb: string }> = {
  conversations: { title: "Conversations", blurb: "No saved conversations yet." },
  history: { title: "History", blurb: "No completed actions yet." },
  memory: { title: "Memory", blurb: "No saved memories yet." },
  whiteboards: { title: "Whiteboards", blurb: "No whiteboards saved yet." },
  screenshots: { title: "Screenshots", blurb: "No screenshots captured yet." },
  files: { title: "Files", blurb: "No files have been added yet." },
  projects: { title: "Projects", blurb: "No projects are connected yet." },
  skills: { title: "Skills", blurb: "No skills graph is loaded yet." },
};

function WorkspaceSection({ section }: { section: Exclude<Section, "settings" | "dashboard"> }) {
  const meta = EMPTY[section];
  return (
    <div className="ws-sec">
      <h2 className="ws-sec__title">{meta.title}</h2>
      <p className="ws-sec__blurb">{meta.blurb}</p>
      <div className="ws-empty glass">Athena will store real activity here after actions run.</div>
    </div>
  );
}
