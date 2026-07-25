import { useEffect, useRef } from "react";
import type { AssistantState } from "../types";
import "./Waveform.css";

interface Props {
  state: AssistantState;
  bars?: number;
}

/**
 * Animated listening waveform. Amplitude and speed react to the assistant
 * state — calm when idle, energetic when listening/speaking.
 */
export function Waveform({ state, bars = 32 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.children) as HTMLElement[];

    const energy =
      state === "listening" ? 1 : state === "speaking" ? 0.85 : state === "thinking" ? 0.4 : 0.12;
    const speed = state === "idle" ? 0.0016 : 0.006;

    let t = 0;
    const tick = () => {
      t += speed * 16;
      spans.forEach((s, i) => {
        const phase = i * 0.5;
        const wave = Math.sin(t + phase) * 0.5 + 0.5;
        const jitter = state === "listening" ? Math.random() * 0.3 : 0;
        const h = 4 + (wave * 0.7 + jitter) * energy * 28;
        s.style.height = `${h}px`;
        s.style.opacity = `${0.45 + wave * 0.55}`;
      });
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf.current);
  }, [state, bars]);

  return (
    <div className={`waveform waveform--${state}`} ref={ref} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}
