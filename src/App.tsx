import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AssistantState, ProviderConfig, ProviderTestResult } from "./types";
import { Orb } from "./components/Orb";
import { Waveform } from "./components/Waveform";
import { Toast, type ToastItem } from "./components/Toast";
import { Workspace, type WorkspaceSectionKey } from "./components/Workspace";
import { loadProviderConfig, saveProviderConfig } from "./providerConfig";
import { choosePreferredVoice, loadVoiceSettings, saveVoiceSettings } from "./voiceSettings";
import { appendHistory } from "./history";
import type { SpeechRecognition } from "./speechTypes";
import "./App.css";

const uid = () => Math.random().toString(36).slice(2, 9);
const AUTO_LISTEN_DELAY = 650;

type LocalAction =
  | { type: "open-section"; section: WorkspaceSectionKey; message: string }
  | { type: "close-workspace"; message: string }
  | { type: "windows-settings"; target: string; message: string }
  | { type: "open-app"; app: string; message: string }
  | { type: "open-path"; path: string; message: string }
  | { type: "reveal-path"; path: string; message: string }
  | { type: "open-url"; url: string; message: string }
  | { type: "web-search"; query: string; message: string }
  | { type: "read-clipboard"; message: string }
  | { type: "write-clipboard"; text: string; message: string }
  | { type: "install-female-voice"; message: string }
  | { type: "screenshot"; message: string }
  | { type: "whiteboard-command"; command: string; message: string }
  | { type: "student"; prompt: string };

type PendingClarification = {
  question: string;
  options: { label: string; aliases: string[]; action: LocalAction }[];
};

const STUDENT_PROMPTS: Record<string, string> = {
  flashcards: "Make student flashcards from this. Use question/answer pairs and keep them exam-ready.",
  quiz: "Quiz me like a student. Ask one question at a time, wait for my answer, then correct me.",
  summary: "Summarize this for studying. Include key points, definitions, and what to memorize.",
  explain: "Explain this like a teacher. Use steps, examples, and a quick check-for-understanding question.",
  plan: "Make a student study plan with sessions, priorities, and practice tasks.",
};

export default function App() {
  const [state, setState] = useState<AssistantState>("idle");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [initialSection, setInitialSection] = useState<WorkspaceSectionKey | undefined>();
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(() => loadProviderConfig());
  const [voiceSettings, setVoiceSettings] = useState(() => loadVoiceSettings());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [inactive, setInactive] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Ready");
  const [pendingClarification, setPendingClarification] = useState<PendingClarification | null>(null);
  const idleTimer = useRef<number>(0);
  const autoListenTimer = useRef<number>(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeRecognitionRef = useRef<SpeechRecognition | null>(null);
  const stateRef = useRef<AssistantState>("idle");
  const conversationModeRef = useRef(false);

  const providerReady = Boolean(providerConfig.baseUrl.trim() && providerConfig.model.trim());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    conversationModeRef.current = conversationMode;
  }, [conversationMode]);

  const openSettingsPanel = useCallback(() => {
    setInitialSection("settings");
    setWorkspaceOpen(true);
  }, []);

  const openWorkspaceSection = useCallback((section: WorkspaceSectionKey) => {
    setInitialSection(section);
    setWorkspaceOpen(true);
  }, []);


  const hideAthena = useCallback(async () => {
    setConversationMode(false);
    setWorkspaceOpen(false);
    setInitialSection(undefined);
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
    window.clearTimeout(autoListenTimer.current);
    try {
      await invoke("hide_window");
    } catch {
      // Browser preview cannot hide a native window.
    }
  }, []);

  const pushToast = useCallback((text: string, kind: ToastItem["kind"] = "ok") => {
    setToasts((t) => [...t, { id: uid(), text, kind }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // Idle-fade: orb becomes semi-transparent when nothing is happening.
  useEffect(() => {
    window.clearTimeout(idleTimer.current);
    if (state === "idle" && !workspaceOpen) {
      idleTimer.current = window.setTimeout(() => setInactive(true), 4000);
    } else {
      setInactive(false);
    }
    return () => window.clearTimeout(idleTimer.current);
  }, [state, workspaceOpen]);

  const updateProviderConfig = useCallback((config: ProviderConfig) => {
    setProviderConfig(config);
    saveProviderConfig(config);
  }, []);

  const updateVoiceSettings = useCallback((settings: typeof voiceSettings) => {
    setVoiceSettings(settings);
    saveVoiceSettings(settings);
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) {
      setState("idle");
      pushToast("Voice output is not available here", "error");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = choosePreferredVoice(voices, voiceSettings);
    if (voice) utterance.voice = voice;
    utterance.lang = voiceSettings.language;
    utterance.rate = voiceSettings.rate;
    utterance.pitch = voiceSettings.pitch;
    utterance.volume = voiceSettings.volume;
    utterance.onend = () => {
      setState("idle");
      setVoiceStatus(conversationModeRef.current ? "Listening again..." : "Ready");
      if (conversationModeRef.current) {
        window.clearTimeout(autoListenTimer.current);
        autoListenTimer.current = window.setTimeout(() => {
          void startVoiceInput(false);
        }, AUTO_LISTEN_DELAY);
      }
    };
    utterance.onerror = () => {
      setState("idle");
      setVoiceStatus("Voice output failed");
      pushToast("Voice output failed", "error");
    };
    setState("speaking");
    setVoiceStatus("Speaking");
    window.speechSynthesis.speak(utterance);
  }, [pushToast, voiceSettings, voices]);

  const speakWithPiper = useCallback(async (text: string) => {
    try {
      const status = await invoke<{ available: boolean; message: string }>("local_tts_status", {
        piperPath: voiceSettings.piperPath,
        modelPath: voiceSettings.piperModelPath,
      });
      if (!status.available) throw new Error(status.message);
      setState("speaking");
      setVoiceStatus("Speaking");
      await invoke<string>("speak_piper", {
        text,
        piperPath: voiceSettings.piperPath,
        modelPath: voiceSettings.piperModelPath,
      });
      setState("idle");
      setVoiceStatus(conversationModeRef.current ? "Listening again..." : "Ready");
      if (conversationModeRef.current) {
        window.clearTimeout(autoListenTimer.current);
        autoListenTimer.current = window.setTimeout(() => {
          void startVoiceInput(false);
        }, AUTO_LISTEN_DELAY);
      }
    } catch (error) {
      setVoiceStatus(error instanceof Error ? error.message : "Piper voice failed");
      pushToast(error instanceof Error ? error.message : "Piper voice failed", "error");
      if (voiceSettings.engine === "system") speak(text);
      else setState("idle");
    }
  }, [pushToast, speak, voiceSettings.engine, voiceSettings.piperModelPath, voiceSettings.piperPath]);

  const say = useCallback((text: string) => {
    if (voiceSettings.engine === "piper") void speakWithPiper(text);
    else speak(text);
  }, [speak, speakWithPiper, voiceSettings.engine]);

  const executeLocalAction = useCallback(async (action: LocalAction) => {
    setPendingClarification(null);
    try {
      if (action.type === "open-section") {
        await invoke("open_workspace");
        openWorkspaceSection(action.section);
        setVoiceStatus(action.message);
        say(action.message);
        return true;
      }
      if (action.type === "close-workspace") {
        setWorkspaceOpen(false);
        setInitialSection(undefined);
        await invoke("show_compact");
        setVoiceStatus(action.message);
        say(action.message);
        return true;
      }
      if (action.type === "windows-settings") {
        await invoke("open_windows_settings", { target: action.target });
        setVoiceStatus(action.message);
        say(action.message);
        return true;
      }
      if (action.type === "open-app") {
        await invoke("open_app", { name: action.app });
        setVoiceStatus(action.message);
        say(action.message);
        await appendHistory({ kind: "system", title: `Opened ${action.app}`, detail: action.app, ok: true });
        return true;
      }
      if (action.type === "open-path") {
        await invoke("open_path", { path: action.path });
        setVoiceStatus(action.message);
        say(action.message);
        return true;
      }
      if (action.type === "reveal-path") {
        await invoke("reveal_path", { path: action.path });
        setVoiceStatus(action.message);
        say(action.message);
        return true;
      }
      if (action.type === "open-url") {
        await invoke("open_url", { url: action.url });
        setVoiceStatus(action.message);
        say(action.message);
        return true;
      }
      if (action.type === "read-clipboard") {
        const text = await invoke<string>("read_clipboard");
        const message = text ? "Clipboard read and saved to history." : "Clipboard is empty.";
        setVoiceStatus(message);
        say(message);
        if (text) await appendHistory({ kind: "file", title: "Clipboard", detail: text, ok: true });
        return true;
      }
      if (action.type === "write-clipboard") {
        await invoke("write_clipboard", { text: action.text });
        setVoiceStatus(action.message);
        say(action.message);
        return true;
      }
      if (action.type === "install-female-voice") {
        setVoiceStatus("Installing female voice...");
        const status = await invoke<{ message: string }>("install_female_voice");
        setVoiceStatus(status.message);
        say(status.message);
        return true;
      }
      if (action.type === "web-search") {
        await invoke("open_url", { url: action.query });
        setVoiceStatus(action.message);
        say(action.message);
        return true;
      }
      if (action.type === "screenshot") {
        await invoke("open_workspace");
        openWorkspaceSection("screenshots");
        const result = await invoke<{ message: string }>("take_screenshot");
        setVoiceStatus(result.message);
        say(action.message);
        return true;
      }
      if (action.type === "whiteboard-command") {
        window.dispatchEvent(new CustomEvent("athena-whiteboard-command", { detail: action.command }));
        setVoiceStatus(action.message);
        say(action.message);
        return true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVoiceStatus(message);
      pushToast(message, "error");
      say(`I could not do that. ${message}`);
      await appendHistory({ kind: "system", title: "Local command failed", detail: message, ok: false });
      return true;
    }
    return false;
  }, [openWorkspaceSection, pushToast, say]);

  const askClarification = useCallback((clarification: PendingClarification) => {
    setPendingClarification(clarification);
    setVoiceStatus(clarification.question);
    say(clarification.question);
    pushToast(clarification.question, "info");
    return true;
  }, [pushToast, say]);

  const resolveClarification = useCallback((text: string) => {
    if (!pendingClarification) return null;
    const normalized = text.toLowerCase().trim();
    const ordinal = normalized.includes("first") || normalized === "one" || normalized === "1" ? 0
      : normalized.includes("second") || normalized === "two" || normalized === "2" ? 1
      : normalized.includes("third") || normalized === "three" || normalized === "3" ? 2
      : -1;
    if (ordinal >= 0) return pendingClarification.options[ordinal]?.action ?? null;
    const match = pendingClarification.options.find((option) => option.aliases.some((alias) => normalized.includes(alias)));
    return match?.action ?? null;
  }, [pendingClarification]);

  const parseLocalCommand = useCallback((text: string): LocalAction | PendingClarification | null => {
    const normalized = text.toLowerCase().replace(/[^a-z0-9 .:/?=&-]/g, " ").replace(/\s+/g, " ").trim();
    const wantsOpen = /\b(open|show|start|launch|go to)\b/.test(normalized);
    const wantsClose = /\b(close|hide|exit|dismiss|stop showing)\b/.test(normalized);

    if (normalized === "cancel" || normalized === "never mind" || normalized === "go back") {
      return { type: "close-workspace", message: "Cancelled." };
    }

    if (wantsClose && (normalized.includes("whiteboard") || normalized.includes("white board") || normalized.includes("workspace") || normalized.includes("panel"))) {
      return { type: "close-workspace", message: "Closed the workspace." };
    }
    if ((wantsOpen || normalized.includes("whiteboard")) && (normalized.includes("whiteboard") || normalized.includes("white board"))) {
      return { type: "open-section", section: "whiteboards", message: "Opening whiteboard." };
    }
    if (normalized.includes("use pen") || normalized === "pen" || normalized.includes("pen tool")) {
      return { type: "whiteboard-command", command: "pen", message: "Pen selected." };
    }
    if (normalized.includes("eraser") || normalized.includes("erase tool")) {
      return { type: "whiteboard-command", command: "eraser", message: "Eraser selected." };
    }
    if (normalized.includes("hand tool") || normalized.includes("move board") || normalized === "hand") {
      return { type: "whiteboard-command", command: "hand", message: "Hand tool selected." };
    }
    if (normalized.includes("clear whiteboard") || normalized.includes("clear board")) {
      return { type: "whiteboard-command", command: "clear", message: "Whiteboard cleared." };
    }
    if (normalized.includes("undo whiteboard") || normalized.includes("undo board")) {
      return { type: "whiteboard-command", command: "undo", message: "Undone." };
    }
    if (normalized.includes("redo whiteboard") || normalized.includes("redo board")) {
      return { type: "whiteboard-command", command: "redo", message: "Redone." };
    }

    if (wantsClose && normalized.includes("settings")) return { type: "close-workspace", message: "Closed settings." };
    if (wantsOpen && normalized.includes("settings")) {
      if (normalized.includes("windows") || normalized.includes("device") || normalized.includes("computer")) {
        return { type: "windows-settings", target: "home", message: "Opening Windows settings." };
      }
      if (normalized.includes("athena") || normalized.includes("your") || normalized.includes("app")) {
        return { type: "open-section", section: "settings", message: "Opening Athena settings." };
      }
      return {
        question: "Do you mean Athena settings or Windows device settings?",
        options: [
          { label: "Athena settings", aliases: ["athena", "your", "app", "assistant"], action: { type: "open-section", section: "settings", message: "Opening Athena settings." } },
          { label: "Windows settings", aliases: ["windows", "device", "computer", "system"], action: { type: "windows-settings", target: "home", message: "Opening Windows settings." } },
        ],
      };
    }
    if (wantsOpen && normalized.includes("display settings")) return { type: "windows-settings", target: "display", message: "Opening display settings." };
    if (wantsOpen && (normalized.includes("sound settings") || normalized.includes("audio settings"))) return { type: "windows-settings", target: "sound", message: "Opening sound settings." };
    if (wantsOpen && (normalized.includes("date settings") || normalized.includes("time settings"))) return { type: "windows-settings", target: "date", message: "Opening date and time settings." };

    if (wantsOpen && normalized.includes("history")) return { type: "open-section", section: "history", message: "Opening history." };
    if (wantsOpen && normalized.includes("files")) return { type: "open-section", section: "files", message: "Opening files." };
    if (wantsOpen && normalized.includes("skills")) return { type: "open-section", section: "skills", message: "Opening skills." };
    if (wantsOpen && normalized.includes("screenshots")) return { type: "open-section", section: "screenshots", message: "Opening screenshots." };
    if (wantsOpen && (normalized.includes("dashboard") || normalized.includes("home"))) return { type: "open-section", section: "dashboard", message: "Opening dashboard." };

    if (normalized.includes("read my screen") || normalized.includes("take screenshot") || normalized.includes("capture screen") || normalized.includes("screenshot")) {
      return { type: "screenshot", message: "I captured your screen. I can show it, but visual understanding needs a vision-capable provider." };
    }

    if (wantsOpen && normalized.includes("youtube")) return { type: "open-url", url: "https://www.youtube.com", message: "Opening YouTube." };
    if (wantsOpen && normalized.includes("google")) return { type: "open-url", url: "https://www.google.com", message: "Opening Google." };
    if (wantsOpen && normalized.includes("new tab")) return { type: "open-url", url: "https://www.google.com", message: "Opening a new browser tab." };
    const searchMatch = normalized.match(/(?:search web for|search google for|google|look up) (.+)$/);
    if (searchMatch?.[1]) return { type: "web-search", query: searchMatch[1], message: `Searching for ${searchMatch[1]}.` };
    const websiteMatch = normalized.match(/(?:open|launch|go to) (?:website |site |tab )?([a-z0-9.-]+\.[a-z]{2,})(?:\s|$)/);
    if (websiteMatch?.[1]) return { type: "open-url", url: websiteMatch[1], message: `Opening ${websiteMatch[1]}.` };

    const folderMap: Record<string, string> = {
      downloads: "~/Downloads",
      documents: "~/Documents",
      desktop: "~/Desktop",
      pictures: "~/Pictures",
      videos: "~/Videos",
      music: "~/Music",
    };
    for (const [name, path] of Object.entries(folderMap)) {
      if (wantsOpen && (normalized.includes(`${name} folder`) || normalized === `open ${name}` || normalized.includes(`my ${name}`))) {
        return { type: "open-path", path, message: `Opening ${name}.` };
      }
    }

    const appMatch = normalized.match(/(?:open|launch|start) (.+)$/);
    if (appMatch?.[1]) {
      const app = appMatch[1]
        .replace(/\b(app|application|program)\b/g, "")
        .replace(/\bplease\b/g, "")
        .trim();
      const blocked = ["settings", "whiteboard", "history", "files", "skills", "screenshots", "dashboard", "home", "website", "site", "tab"];
      if (app && !blocked.some((word) => app.includes(word)) && !app.includes(".")) {
        return { type: "open-app", app, message: `Opening ${app}.` };
      }
    }

    if (normalized.includes("read clipboard") || normalized.includes("use clipboard")) {
      return { type: "read-clipboard", message: "Reading clipboard." };
    }

    if (normalized.includes("install female voice") || normalized.includes("download female voice") || normalized.includes("fix female voice")) {
      return { type: "install-female-voice", message: "Installing Athena female voice." };
    }

    if (normalized.includes("flashcard")) return { type: "student", prompt: `${STUDENT_PROMPTS.flashcards}\n\nStudent request: ${text}` };
    if (normalized.includes("quiz me") || normalized.includes("test me")) return { type: "student", prompt: `${STUDENT_PROMPTS.quiz}\n\nStudent request: ${text}` };
    if (normalized.includes("summarize") || normalized.includes("summary")) return { type: "student", prompt: `${STUDENT_PROMPTS.summary}\n\nStudent request: ${text}` };
    if (normalized.includes("study plan")) return { type: "student", prompt: `${STUDENT_PROMPTS.plan}\n\nStudent request: ${text}` };
    if (normalized.includes("explain") || normalized.includes("teach me") || normalized.includes("homework")) return { type: "student", prompt: `${STUDENT_PROMPTS.explain}\n\nStudent request: ${text}` };

    return null;
  }, []);

  const runAssistantRequest = useCallback(async (text: string) => {
    const clarificationAction = resolveClarification(text);
    if (clarificationAction) {
      await executeLocalAction(clarificationAction);
      return;
    }
    if (pendingClarification) {
      setPendingClarification(null);
      say("I did not catch which one. I will answer normally instead.");
    }

    const localCommand = parseLocalCommand(text);
    if (localCommand) {
      if ("question" in localCommand) {
        askClarification(localCommand);
        return;
      }
      if (localCommand.type !== "student") {
        await executeLocalAction(localCommand);
        return;
      }
      text = localCommand.prompt;
    }

    if (!providerReady) {
      pushToast("Set up a provider first", "info");
      openSettingsPanel();
      try {
        await invoke("open_settings");
      } catch {
        // The local panel is already open for browser preview or invoke failures.
      }
      return;
    }

    setState("thinking");
    setVoiceStatus("Thinking");
    pushToast("Contacting provider", "working");
    try {
      const result = await invoke<ProviderTestResult>("send_message", {
        config: providerConfig,
        text,
      });

      if (!result.ok) {
        pushToast(result.message, "error");
        setVoiceStatus(result.message);
        setState("idle");
        return;
      }

      pushToast(result.message, "ok");
      await appendHistory({ kind: "assistant", title: text.slice(0, 60) || "Assistant request", detail: result.message, ok: true, provider: providerConfig.name });
      if (voiceSettings.engine === "piper") void speakWithPiper(result.message);
      else speak(result.message);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), "error");
      setVoiceStatus(error instanceof Error ? error.message : "Request failed");
      setState("idle");
    }
  }, [askClarification, executeLocalAction, openSettingsPanel, parseLocalCommand, pendingClarification, providerConfig, providerReady, pushToast, resolveClarification, say, speak, speakWithPiper, voiceSettings.engine]);

  const startVoiceInput = useCallback(async (toggle = true) => {
    wakeRecognitionRef.current?.abort();
    wakeRecognitionRef.current = null;
    if (toggle && stateRef.current !== "idle") {
      setConversationMode(false);
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
      window.clearTimeout(autoListenTimer.current);
      setVoiceStatus("Stopped");
      setState("idle");
      return;
    }

    if (stateRef.current !== "idle") return;

    if (toggle) setConversationMode(true);

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      pushToast("Speech recognition is not available in this WebView", "error");
      setVoiceStatus("Speech recognition is not available in this WebView");
      openSettingsPanel();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      setConversationMode(false);
      setVoiceStatus(error instanceof Error ? error.message : "Microphone permission was denied");
      pushToast(error instanceof Error ? error.message : "Microphone permission was denied", "error");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = voiceSettings.language;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setState("listening");
      setVoiceStatus("Listening");
    };
    recognition.onresult = (event) => {
      const results = Array.from(event.results).slice(event.resultIndex);
      const transcript = results
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      const isFinal = results.some((result) => result.isFinal);
      if (transcript && !isFinal) {
        setVoiceStatus(`Hearing: ${transcript}`);
        return;
      }
      if (transcript) void runAssistantRequest(transcript);
      else {
        setState("idle");
        setVoiceStatus("I did not hear anything");
        pushToast("I did not hear anything", "info");
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" && conversationModeRef.current) {
        setState("idle");
        setVoiceStatus("Still listening...");
        window.clearTimeout(autoListenTimer.current);
        autoListenTimer.current = window.setTimeout(() => void startVoiceInput(false), AUTO_LISTEN_DELAY);
        return;
      }
      if (event.error === "aborted") return;
      setConversationMode(false);
      setState("idle");
      setVoiceStatus(event.message || `Voice recognition failed: ${event.error}`);
      pushToast(event.message || `Voice recognition failed: ${event.error}`, "error");
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition && stateRef.current === "listening") setState("idle");
    };
    recognition.start();
  }, [openSettingsPanel, pushToast, runAssistantRequest, voiceSettings.language]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    let cancelled = false;
    let restartTimer = 0;
    const wakeWords = ["hi athena", "hey athena", "athena"];

    const startWakeListener = () => {
      window.clearTimeout(restartTimer);
      if (cancelled || stateRef.current !== "idle" || wakeRecognitionRef.current) return;

      const recognition = new Recognition();
      wakeRecognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = voiceSettings.language;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .slice(event.resultIndex)
          .map((result) => result[0]?.transcript ?? "")
          .join(" ")
          .toLowerCase()
          .trim();
        if (wakeWords.some((word) => transcript.includes(word))) {
          wakeRecognitionRef.current = null;
          recognition.abort();
          void invoke("show_compact").catch(() => undefined);
          setVoiceStatus("Hi, I am listening");
          window.setTimeout(() => void startVoiceInput(false), 220);
        }
      };
      recognition.onerror = () => undefined;
      recognition.onend = () => {
        if (wakeRecognitionRef.current === recognition) wakeRecognitionRef.current = null;
        if (!cancelled && stateRef.current === "idle") {
          restartTimer = window.setTimeout(startWakeListener, 650);
        }
      };
      try {
        recognition.start();
      } catch {
        wakeRecognitionRef.current = null;
      }
    };

    if (state === "idle") startWakeListener();
    else {
      wakeRecognitionRef.current?.abort();
      wakeRecognitionRef.current = null;
    }

    return () => {
      cancelled = true;
      window.clearTimeout(restartTimer);
      wakeRecognitionRef.current?.abort();
      wakeRecognitionRef.current = null;
    };
  }, [startVoiceInput, state, voiceSettings.language]);

  const onOrbClick = () => {
    void startVoiceInput(true);
  };

  const openSettings = async () => {
    openSettingsPanel();
    try {
      await invoke("open_settings");
    } catch {
      // The local panel is already open for browser preview or invoke failures.
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") void hideAthena();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("open-settings", () => {
        openSettingsPanel();
      }).then((handler) => {
        unlisten = handler;
      });
    return () => {
      unlisten?.();
    };
  }, [openSettingsPanel]);

  useEffect(() => {
    void invoke<boolean>("frontend_ready")
      .then((shouldOpenSettings) => {
        if (shouldOpenSettings) openSettingsPanel();
      })
      .catch(() => undefined);
  }, [openSettingsPanel]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("shortcut-activated", () => {
      setVoiceStatus("Shortcut active");
    }).then((handler) => {
      unlisten = handler;
    });
    return () => unlisten?.();
  }, []);

  const showWave = conversationMode || state === "listening" || state === "speaking" || state === "thinking";

  return (
    <>
      <div
        className={`ambient ${inactive ? "ambient--inactive" : ""}`}
        onMouseEnter={() => setInactive(false)}
      >
        <div className="ambient__wave" data-show={showWave}>
          {showWave && <Waveform state={state} />}
        </div>
        <div className="ambient__status" data-show={showWave}>{voiceStatus}</div>
        <div className="ambient__provider" data-show={showWave}>{providerConfig.name} - {providerConfig.model || "No model"}</div>
        <div className="ambient__tools no-drag">
          <button className="ambient__tool" onClick={() => void openSettings()} aria-label="Open settings">
            Settings
          </button>
          <button className="ambient__tool" onClick={() => void hideAthena()} aria-label="Hide Athena">
            Hide
          </button>
        </div>
        <Orb state={state} onClick={onOrbClick} />
      </div>

      <Toast toasts={toasts} onDismiss={dismissToast} />
      <Workspace
        open={workspaceOpen}
        initialSection={initialSection}
        providerConfig={providerConfig}
        voiceSettings={voiceSettings}
        assistantState={state}
        onProviderConfigChange={updateProviderConfig}
        onVoiceSettingsChange={updateVoiceSettings}
        onClose={() => {
          void hideAthena();
        }}
      />
    </>
  );
}
