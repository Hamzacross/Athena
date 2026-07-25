import type { VoiceSettings } from "./types";

export const VOICE_SETTINGS_KEY = "athena.voiceSettings.v1";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voiceName: "",
  engine: "piper",
  piperPath: "",
  piperModelPath: "",
  rate: 1.04,
  pitch: 1.12,
  volume: 1,
  language: "en-US",
};

const PREFERRED_VOICE_NAMES = [
  "aria",
  "jenny",
  "zira",
  "samantha",
  "female",
  "natural",
  "google us english",
  "microsoft",
];

export function loadVoiceSettings(): VoiceSettings {
  try {
    const stored = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!stored) return DEFAULT_VOICE_SETTINGS;
    return { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function saveVoiceSettings(settings: VoiceSettings) {
  localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings));
}

export function choosePreferredVoice(voices: SpeechSynthesisVoice[], settings: VoiceSettings) {
  if (!voices.length) return undefined;
  const configured = voices.find((voice) => voice.name === settings.voiceName);
  if (configured) return configured;

  const languageMatch = voices.filter((voice) => voice.lang.toLowerCase().startsWith(settings.language.toLowerCase().slice(0, 2)));
  const candidates = languageMatch.length ? languageMatch : voices;
  return candidates.find((voice) => {
    const name = voice.name.toLowerCase();
    return PREFERRED_VOICE_NAMES.some((preferred) => name.includes(preferred));
  }) ?? candidates[0];
}
