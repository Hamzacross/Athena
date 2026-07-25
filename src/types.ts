export type AssistantState = "idle" | "listening" | "thinking" | "speaking";

export type ProviderCompatibility = "openAi" | "anthropic" | "gemini";

export interface ProviderConfig {
  id: string;
  name: string;
  compatibility: ProviderCompatibility;
  baseUrl: string;
  model: string;
  requiresApiKey: boolean;
}

export interface ProviderTestResult {
  ok: boolean;
  message: string;
}

export interface VoiceSettings {
  voiceName: string;
  engine: "system" | "piper";
  piperPath: string;
  piperModelPath: string;
  rate: number;
  pitch: number;
  volume: number;
  language: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number; // epoch ms
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}

export interface HistoryEntry {
  id: string;
  kind: "assistant" | "file" | "whiteboard" | "settings" | "system";
  title: string;
  detail: string;
  at: number;
  provider?: string;
  ok: boolean;
}

export interface DeviceContext {
  today: string;
  timezone: string;
  os: string;
  arch: string;
  family: string;
  exePath: string;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified?: number;
}

export interface FileReadResult {
  path: string;
  content: string;
  truncated: boolean;
}

export interface LocalTtsStatus {
  available: boolean;
  message: string;
  piperPath: string;
  modelPath: string;
  configPath: string;
  lastWavPath: string;
  wavSize: number;
  lastPiperStderr: string;
  lastPlaybackError: string;
}

export interface FemaleVoiceStatus {
  installed: boolean;
  message: string;
  piperPath: string;
  modelPath: string;
  configPath: string;
  lastWavPath: string;
  wavSize: number;
  lastPiperStderr: string;
  lastPlaybackError: string;
}

export type View = "assistant" | "history" | "settings" | "profile";
