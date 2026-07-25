import { useEffect, useMemo, useRef, useState } from "react";
import type { AssistantState, HistoryEntry } from "../types";
import { loadHistory } from "../history";
import "./Skills.css";

type NodeType = "core" | "student" | "skill" | "topic" | "activity";

type BrainNode = {
  id: string;
  label: string;
  type: NodeType;
  x: number;
  y: number;
  detail: string;
};

type BrainLink = { from: string; to: string };

const baseNodes: BrainNode[] = [
  { id: "athena", label: "Athena", type: "core", x: 0, y: 0, detail: "Student assistant core" },
  { id: "student", label: "Student", type: "student", x: -190, y: 10, detail: "Main learner profile" },
  { id: "whiteboard", label: "Whiteboard", type: "skill", x: 190, y: -120, detail: "Explain visually, draw, solve" },
  { id: "files", label: "Files", type: "skill", x: 220, y: 80, detail: "Browse and read study material" },
  { id: "web", label: "Web", type: "skill", x: -20, y: 190, detail: "Open tabs and search" },
  { id: "voice", label: "Voice", type: "skill", x: -250, y: -130, detail: "Wake, listen, speak" },
  { id: "history", label: "History", type: "skill", x: 30, y: -220, detail: "Saved learning activity" },
];

const baseLinks: BrainLink[] = [
  { from: "athena", to: "student" },
  { from: "athena", to: "whiteboard" },
  { from: "athena", to: "files" },
  { from: "athena", to: "web" },
  { from: "athena", to: "voice" },
  { from: "athena", to: "history" },
];

const topicWords = ["biology", "math", "algebra", "calculus", "chemistry", "physics", "english", "history", "exam", "quiz", "flashcards", "homework", "study"];

export function Skills({ state }: { state: AssistantState }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState("athena");
  const dragging = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    void loadHistory().then((entries) => setHistory(entries.slice(0, 24)));
  }, []);

  const graph = useMemo(() => {
    const nodes = [...baseNodes];
    const links = [...baseLinks];
    const seen = new Set(nodes.map((node) => node.id));
    history.forEach((entry, index) => {
      const activityId = `activity-${entry.id}`;
      const angle = index * 0.74;
      const radius = 300 + (index % 4) * 38;
      nodes.push({ id: activityId, label: entry.title.slice(0, 22), type: "activity", x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, detail: entry.detail });
      links.push({ from: "history", to: activityId });
      const text = `${entry.title} ${entry.detail}`.toLowerCase();
      topicWords.forEach((word) => {
        if (!text.includes(word)) return;
        const topicId = `topic-${word}`;
        if (!seen.has(topicId)) {
          seen.add(topicId);
          const topicAngle = nodes.length * 0.9;
          nodes.push({ id: topicId, label: word, type: "topic", x: Math.cos(topicAngle) * 410, y: Math.sin(topicAngle) * 300, detail: `Detected student topic: ${word}` });
          links.push({ from: "athena", to: topicId });
        }
        links.push({ from: topicId, to: activityId });
      });
    });
    return { nodes, links };
  }, [history]);

  const selected = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];

  const beginDrag = (event: React.PointerEvent) => {
    dragging.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent) => {
    if (!dragging.current) return;
    setPan({ x: dragging.current.panX + event.clientX - dragging.current.x, y: dragging.current.panY + event.clientY - dragging.current.y });
  };

  const endDrag = () => {
    dragging.current = null;
  };

  const wheel = (event: React.WheelEvent) => {
    event.preventDefault();
    setZoom((value) => Math.min(2.4, Math.max(0.45, value - event.deltaY * 0.001)));
  };

  return (
    <div className="skills" data-mode={state}>
      <div className="skills__head">
        <div>
          <h2 className="ws-sec__title">Brain</h2>
          <p className="ws-sec__blurb">Zoomable student memory graph. It grows from history, files, screenshots, and study sessions.</p>
        </div>
        <div className="skills__tools no-drag">
          <button onClick={() => setZoom((value) => Math.min(2.4, value + 0.15))}>Zoom In</button>
          <button onClick={() => setZoom((value) => Math.max(0.45, value - 0.15))}>Zoom Out</button>
          <button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}>Reset</button>
        </div>
      </div>
      <div className="skills__layout">
        <div className="skills__graph glass no-drag" onWheel={wheel} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <svg className="skills__svg" viewBox="-520 -380 1040 760" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <defs>
              <filter id="brainGlow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            {graph.links.map((link, index) => {
              const from = graph.nodes.find((node) => node.id === link.from);
              const to = graph.nodes.find((node) => node.id === link.to);
              if (!from || !to) return null;
              return <line key={`${link.from}-${link.to}-${index}`} className="skills__edge" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
            })}
            {graph.nodes.map((node) => (
              <g key={node.id} className={`skills__g skills__g--${node.type} ${selected.id === node.id ? "is-selected" : ""}`} transform={`translate(${node.x} ${node.y})`} onClick={(event) => { event.stopPropagation(); setSelectedId(node.id); }}>
                <circle r={node.type === "core" ? 52 : node.type === "activity" ? 28 : 38} />
                <text y="4" textAnchor="middle">{node.label}</text>
              </g>
            ))}
          </svg>
        </div>
        <aside className="skills__inspect glass">
          <span className="skills__type">{selected.type}</span>
          <h3>{selected.label}</h3>
          <p>{selected.detail || "No detail yet."}</p>
          <div className="skills__stats">
            <span>{graph.nodes.length} nodes</span>
            <span>{graph.links.length} links</span>
            <span>{Math.round(zoom * 100)}% zoom</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
