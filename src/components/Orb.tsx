import { useEffect, useRef } from "react";
import type { AssistantState } from "../types";
import { AthenaMark } from "./AthenaMark";
import "./Orb.css";

interface Props {
  state: AssistantState;
  size?: number;
  onClick?: () => void;
}

const PARTICLES = 6;

/**
 * The ambient Athena orb — the ONLY persistent UI.
 * idle: soft breathing glow. wake→listening: expand + ripple.
 * thinking: slow rotation + orbiting particles. speaking: volume pulse.
 */
export function Orb({ state, size = 64, onClick }: Props) {
  const coreRef = useRef<HTMLSpanElement>(null);
  const raf = useRef<number>(0);

  // Simulated speech-volume pulse for the speaking state.
  useEffect(() => {
    if (state !== "speaking") return;
    const core = coreRef.current;
    if (!core) return;
    let t = 0;
    const tick = () => {
      t += 0.14;
      const v = 0.5 + 0.5 * Math.abs(Math.sin(t) * Math.sin(t * 0.37 + 1));
      core.style.transform = `scale(${1 + v * 0.16})`;
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf.current);
      if (core) core.style.transform = "";
    };
  }, [state]);

  const expanded = state === "listening" || state === "speaking";

  return (
    <div
      className={`orb orb--${state} ${expanded ? "orb--expanded" : ""}`}
      style={{ width: size, height: size }}
    >
      {/* wake / listening ripples */}
      <span className="orb__ripple" />
      <span className="orb__ripple orb__ripple--2" />

      {/* orbiting particles for thinking */}
      <span className="orb__particles">
        {Array.from({ length: PARTICLES }).map((_, i) => (
          <span
            key={i}
            className="orb__particle"
            style={{ ["--i" as string]: i, ["--n" as string]: PARTICLES }}
          />
        ))}
      </span>

      <button className="orb__hit no-drag" onClick={onClick} aria-label={`Athena ${state}`}>
        <span className="orb__glow" />
        <span className="orb__core" ref={coreRef}>
          <AthenaMark className="orb__mark" size={size} />
        </span>
      </button>
    </div>
  );
}
