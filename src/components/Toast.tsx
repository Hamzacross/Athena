import { useEffect } from "react";
import "./Toast.css";

export interface ToastItem {
  id: string;
  text: string;
  kind?: "ok" | "info" | "working" | "error";
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const ICON: Record<NonNullable<ToastItem["kind"]>, string> = {
  ok: "✓",
  info: "•",
  working: "◍",
  error: "!",
};

function ToastRow({ t, onDismiss }: { t: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const id = setTimeout(() => onDismiss(t.id), 3000);
    return () => clearTimeout(id);
  }, [t.id, onDismiss]);

  return (
    <div className={`toast toast--${t.kind ?? "ok"}`}>
      <span className="toast__icon">{ICON[t.kind ?? "ok"]}</span>
      <span className="toast__text">{t.text}</span>
    </div>
  );
}

/** Tiny floating confirmations that fade after 3s. Never a chat log. */
export function Toast({ toasts, onDismiss }: Props) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <ToastRow key={t.id} t={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
