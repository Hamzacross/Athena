import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from "@mediapipe/tasks-vision";
import "./Whiteboard.css";

type Tool = "pen" | "eraser" | "hand";

type Stroke = {
  id: string;
  tool: Exclude<Tool, "hand">;
  color: string;
  size: number;
  points: { x: number; y: number }[];
};

const COLORS = ["#f4f1ff", "#9b7bff", "#4ee6a8", "#ffcc66", "#ff6b8b", "#4db8ff"];
const uid = () => Math.random().toString(36).slice(2, 9);

export function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const drawing = useRef(false);
  const panning = useRef(false);
  const strokeRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const rafRef = useRef(0);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef({ x: 0, y: 0 });
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(5);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<Stroke[][]>([]);
  const [redo, setRedo] = useState<Stroke[][]>([]);
  const [handMode, setHandMode] = useState(false);
  const [handPoint, setHandPoint] = useState<{ x: number; y: number } | null>(null);
  const [cameraStatus, setCameraStatus] = useState("");
  const [gesture, setGesture] = useState("idle");

  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.tool === "eraser" ? stroke.size * 2.4 : stroke.size;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawSegment = (stroke: Stroke, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.tool === "eraser" ? stroke.size * 2.4 : stroke.size;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  };

  const scheduleRedraw = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(redraw);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      scheduleRedraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [offset.x, offset.y, scale]);

  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (command === "pen") setTool("pen");
      if (command === "eraser") setTool("eraser");
      if (command === "hand") setTool("hand");
      if (command === "clear") clear();
      if (command === "undo") undo();
      if (command === "redo") redoStroke();
    };
    window.addEventListener("athena-whiteboard-command", onCommand);
    return () => window.removeEventListener("athena-whiteboard-command", onCommand);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let lastPoint: { x: number; y: number } | null = null;
    let lastVideoTime = -1;
    let active = true;

    const finishTrackedStroke = () => {
      if (strokeRef.current) stop();
      setHandPoint(null);
    };

    const drawTrackedPoint = (screenPoint: { x: number; y: number }, strokeTool: Exclude<Tool, "hand">) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const boardPoint = { x: (screenPoint.x - offset.x) / scale, y: (screenPoint.y - offset.y) / scale };
      if (!strokeRef.current) {
        strokeRef.current = { id: uid(), tool: strokeTool, color, size, points: [boardPoint] };
        drawing.current = true;
      } else {
        strokeRef.current.tool = strokeTool;
        const previous = strokeRef.current.points[strokeRef.current.points.length - 1];
        strokeRef.current.points.push(boardPoint);
        drawSegment(strokeRef.current, previous, boardPoint);
      }
      setHandPoint({ x: screenPoint.x, y: screenPoint.y });
      if (screenPoint.x < 0 || screenPoint.y < 0 || screenPoint.x > rect.width || screenPoint.y > rect.height) return;
    };

    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

    const handleResult = (result: HandLandmarkerResult) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const hand = result.landmarks[0];
      if (!hand) {
        finishTrackedStroke();
        setGesture("show hand");
        setCameraStatus("Show your hand to draw");
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const indexTip = hand[8];
      const thumbTip = hand[4];
      const middleTip = hand[12];
      const wrist = hand[0];
      const raw = { x: (1 - indexTip.x) * rect.width, y: indexTip.y * rect.height };
      const smooth = lastPoint ? { x: lastPoint.x * 0.62 + raw.x * 0.38, y: lastPoint.y * 0.62 + raw.y * 0.38 } : raw;
      lastPoint = smooth;
      setHandPoint(smooth);

      const pinch = distance(indexTip, thumbTip);
      const middleRaised = middleTip.y < hand[10].y && indexTip.y < hand[6].y;
      const openPalm = distance(indexTip, wrist) > 0.36 && distance(middleTip, wrist) > 0.34 && pinch > 0.09;

      if (pinch < 0.075) {
        setGesture("pinch draw");
        setCameraStatus("Pinch: drawing with finger");
        drawTrackedPoint(smooth, "pen");
      } else if (middleRaised && pinch > 0.12) {
        setGesture("two finger erase");
        setCameraStatus("Two fingers: erasing");
        drawTrackedPoint(smooth, "eraser");
      } else if (openPalm) {
        finishTrackedStroke();
        setGesture("open hand move");
        setCameraStatus("Open hand: move without drawing");
      } else {
        finishTrackedStroke();
        setGesture("hover");
        setCameraStatus("Pinch to draw, two fingers to erase");
      }
    };

    const trackMotion = () => {
      if (!active || !handMode) return;
      const video = videoRef.current;
      const landmarker = handLandmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) {
        frame = requestAnimationFrame(trackMotion);
        return;
      }
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        handleResult(landmarker.detectForVideo(video, performance.now()));
      }
      frame = requestAnimationFrame(trackMotion);
    };

    const startCamera = async () => {
      if (!handMode) return;
      try {
        if (!handLandmarkerRef.current) {
          setCameraStatus("Loading hand tracking model...");
          const fileset = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
          handLandmarkerRef.current = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.55,
          });
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setTool("pen");
        setCameraStatus("Hand tracking ready. Pinch to draw, two fingers erase.");
        frame = requestAnimationFrame(trackMotion);
      } catch (error) {
        setHandMode(false);
        setCameraStatus(error instanceof Error ? error.message : "Camera failed");
      }
    };

    void startCamera();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (strokeRef.current) stop();
    };
  }, [handMode, color, size, offset.x, offset.y, scale]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left - offset.x) / scale, y: (event.clientY - rect.top - offset.y) / scale };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (tool === "hand") {
      panning.current = true;
      dragRef.current = { x: event.clientX, y: event.clientY };
      panRef.current = { ...offset };
      return;
    }
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    strokeRef.current = { id: uid(), tool, color, size, points: [point(event)] };
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panning.current) {
      setOffset({ x: panRef.current.x + (event.clientX - dragRef.current.x), y: panRef.current.y + (event.clientY - dragRef.current.y) });
      return;
    }
    if (!drawing.current || !strokeRef.current) return;
    const nextPoint = point(event);
    const previous = strokeRef.current.points[strokeRef.current.points.length - 1];
    strokeRef.current.points.push(nextPoint);
    drawSegment(strokeRef.current, previous, nextPoint);
  };

  const stop = () => {
    if (panning.current) {
      panning.current = false;
      return;
    }
    if (strokeRef.current) {
      strokesRef.current = [...strokesRef.current, strokeRef.current];
      setHistory((prev) => [...prev, strokesRef.current.slice(0, -1)]);
      setRedo([]);
      strokeRef.current = null;
    }
    drawing.current = false;
  };

  const clear = () => {
    setHistory((prev) => [...prev, strokesRef.current]);
    strokesRef.current = [];
    scheduleRedraw();
  };

  const undo = () => {
    setHistory((prev) => {
      const next = [...prev];
      const snapshot = next.pop();
      if (snapshot) {
        setRedo((r) => [strokesRef.current, ...r]);
        strokesRef.current = snapshot;
        scheduleRedraw();
      }
      return next;
    });
  };

  const redoStroke = () => {
    setRedo((prev) => {
      const next = [...prev];
      const snapshot = next.shift();
      if (snapshot) {
        setHistory((h) => [...h, strokesRef.current]);
        strokesRef.current = snapshot;
        scheduleRedraw();
      }
      return next;
    });
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `athena-whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="wb">
      <div className="wb__toolbar no-drag">
        <button className={tool === "pen" ? "is-active" : ""} onClick={() => setTool("pen")}>Pen</button>
        <button className={tool === "eraser" ? "is-active" : ""} onClick={() => setTool("eraser")}>Eraser</button>
        <button className={tool === "hand" ? "is-active" : ""} onClick={() => setTool("hand")}>Hand</button>
        <button className={handMode ? "is-active" : ""} onClick={() => setHandMode((value) => !value)}>Hand camera</button>
        <div className="wb__colors">
          {COLORS.map((c) => (
            <button key={c} className={color === c ? "is-active" : ""} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
        <label>
          Size
          <input type="range" min="2" max="22" value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
        <label>
          Zoom
          <input type="range" min="0.7" max="1.8" step="0.05" value={scale} onChange={(e) => setScale(Number(e.target.value))} />
        </label>
        <button onClick={undo} disabled={!history.length}>Undo</button>
        <button onClick={redoStroke} disabled={!redo.length}>Redo</button>
        <button onClick={clear}>Clear</button>
        <button onClick={exportPng}>Export</button>
      </div>
      <canvas
        ref={canvasRef}
        className={`wb__canvas no-drag ${tool === "hand" ? "wb__canvas--hand" : ""}`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
      />
      {handMode && (
        <div className="wb__camera no-drag">
          <video ref={videoRef} muted playsInline />
          <span>{cameraStatus}</span>
          <strong>{gesture}</strong>
        </div>
      )}
      {handMode && handPoint && <div className="wb__handDot" style={{ left: handPoint.x, top: handPoint.y }} />}
    </div>
  );
}
