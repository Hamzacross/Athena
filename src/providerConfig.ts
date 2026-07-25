import type { ProviderConfig } from "./types";

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    compatibility: "openAi",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    requiresApiKey: true,
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    compatibility: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-haiku-latest",
    requiresApiKey: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    compatibility: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-1.5-flash",
    requiresApiKey: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    compatibility: "openAi",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
    requiresApiKey: false,
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    compatibility: "openAi",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    requiresApiKey: false,
  },
  {
    id: "custom",
    name: "Custom",
    compatibility: "openAi",
    baseUrl: "",
    model: "",
    requiresApiKey: true,
  },
];

export const PROVIDER_STORAGE_KEY = "athena.providerConfig.v1";

export function loadProviderConfig(): ProviderConfig {
  try {
    const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (!stored) return DEFAULT_PROVIDERS[0];
    return { ...DEFAULT_PROVIDERS[0], ...JSON.parse(stored) };
  } catch {
    return DEFAULT_PROVIDERS[0];
  }
}

export function saveProviderConfig(config: ProviderConfig) {
  localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(config));
}
