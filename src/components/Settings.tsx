import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FemaleVoiceStatus, LocalTtsStatus, ProviderCompatibility, ProviderConfig, ProviderTestResult, VoiceSettings } from "../types";
import { DEFAULT_PROVIDERS } from "../providerConfig";
import { choosePreferredVoice, saveVoiceSettings } from "../voiceSettings";
import "../speechTypes";
import "./Settings.css";

interface Props {
  providerConfig: ProviderConfig;
  voiceSettings: VoiceSettings;
  onProviderConfigChange: (config: ProviderConfig) => void;
  onVoiceSettingsChange: (settings: VoiceSettings) => void;
}

type TestState = "idle" | "testing" | "ok" | "error";

export function Settings({ providerConfig, voiceSettings, onProviderConfigChange, onVoiceSettingsChange }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [femaleVoice, setFemaleVoice] = useState<FemaleVoiceStatus | null>(null);
  const [installingVoice, setInstallingVoice] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setApiKey("");
    setTestState("idle");
    setTestMessage("");
    void invoke<boolean>("has_provider_api_key", { providerId: providerConfig.id })
      .then(setHasKey)
      .catch(() => setHasKey(false));
  }, [providerConfig.id]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    void refreshFemaleVoiceStatus();
  }, []);

  const refreshFemaleVoiceStatus = async () => {
    try {
      const status = await invoke<FemaleVoiceStatus>("female_voice_status");
      setFemaleVoice(status);
      return status;
    } catch {
      setFemaleVoice(null);
      return null;
    }
  };

  const update = (patch: Partial<ProviderConfig>) => {
    onProviderConfigChange({ ...providerConfig, ...patch });
  };

  const selectProvider = (id: string) => {
    const next = DEFAULT_PROVIDERS.find((provider) => provider.id === id);
    if (next) onProviderConfigChange(next);
  };

  const saveKey = async () => {
    await invoke("save_provider_api_key", { providerId: providerConfig.id, apiKey });
    setHasKey(apiKey.trim().length > 0);
    setApiKey("");
  };

  const updateVoice = (patch: Partial<VoiceSettings>) => {
    const next = { ...voiceSettings, ...patch };
    saveVoiceSettings(next);
    onVoiceSettingsChange(next);
  };

  const testProvider = async () => {
    setTestState("testing");
    setTestMessage("Testing provider...");
    try {
      if (apiKey.trim()) await saveKey();
      const result = await invoke<ProviderTestResult>("test_provider", { config: providerConfig });
      setTestState(result.ok ? "ok" : "error");
      setTestMessage(result.message);
    } catch (error) {
      setTestState("error");
      setTestMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const testMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setVoiceMessage("Microphone permission works.");
    } catch (error) {
      setVoiceMessage(error instanceof Error ? error.message : "Microphone permission failed.");
    }
  };

  const testVoiceRecognition = async () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceMessage("Speech recognition is not available in this WebView.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      setVoiceMessage(error instanceof Error ? error.message : "Microphone permission failed.");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setVoiceMessage(transcript ? `Heard: ${transcript}` : "Recognition ended without text.");
    };
    recognition.onerror = (event) => {
      setVoiceMessage(event.message || `Voice recognition failed: ${event.error}`);
    };
    recognition.onend = () => undefined;
    setVoiceMessage("Listening for a short test...");
    recognition.start();
  };

  const testVoiceOutput = () => {
    if (!("speechSynthesis" in window)) {
      setVoiceMessage("Voice output is not available in this WebView.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Athena voice output is working.");
    const voice = choosePreferredVoice(voices, voiceSettings);
    if (voice) utterance.voice = voice;
    utterance.rate = voiceSettings.rate;
    utterance.pitch = voiceSettings.pitch;
    utterance.volume = voiceSettings.volume;
    utterance.onend = () => setVoiceMessage("Voice output works.");
    utterance.onerror = () => setVoiceMessage("Voice output failed.");
    setVoiceMessage("Speaking test phrase...");
    window.speechSynthesis.speak(utterance);
  };

  const testSynthesizeOnly = async () => {
    setVoiceMessage("Synthesizing local female voice WAV...");
    try {
      const status = await invoke<LocalTtsStatus>("local_tts_status", {
        piperPath: voiceSettings.piperPath,
        modelPath: voiceSettings.piperModelPath,
      });
      if (!status.available) {
        setVoiceMessage(status.message);
        return;
      }
      const wavPath = await invoke<string>("synthesize_piper", {
        text: "Athena local female voice is working.",
        piperPath: voiceSettings.piperPath,
        modelPath: voiceSettings.piperModelPath,
      });
      const next = await refreshFemaleVoiceStatus();
      setVoiceMessage(`Synthesize works. WAV: ${wavPath}. Size: ${next?.wavSize ?? 0} bytes.`);
    } catch (error) {
      await refreshFemaleVoiceStatus();
      setVoiceMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const testNativePlayback = async () => {
    const wavPath = femaleVoice?.lastWavPath;
    if (!wavPath) {
      setVoiceMessage("No generated WAV yet. Run Test synthesize only first.");
      return;
    }
    setVoiceMessage("Testing native WAV playback...");
    try {
      await invoke("play_wav_file", { path: wavPath });
      await refreshFemaleVoiceStatus();
      setVoiceMessage("Native playback works.");
    } catch (error) {
      await refreshFemaleVoiceStatus();
      setVoiceMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const testFullFemaleVoice = async () => {
    setVoiceMessage("Testing full local female voice...");
    try {
      const message = await invoke<string>("speak_piper", {
        text: "Athena local female voice is working.",
        piperPath: voiceSettings.piperPath,
        modelPath: voiceSettings.piperModelPath,
      });
      await refreshFemaleVoiceStatus();
      setVoiceMessage(`Full female voice works. ${message}`);
    } catch (error) {
      await refreshFemaleVoiceStatus();
      setVoiceMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const installFemaleVoice = async () => {
    setInstallingVoice(true);
    setVoiceMessage("Installing Athena female voice. This downloads Piper and the Amy voice model...");
    try {
      const status = await invoke<FemaleVoiceStatus>("install_female_voice");
      setFemaleVoice(status);
      updateVoice({ engine: "piper", piperPath: "", piperModelPath: "" });
      setVoiceMessage(status.message);
    } catch (error) {
      setVoiceMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setInstallingVoice(false);
    }
  };

  return (
    <div className="set">
      <h2 className="set__title">Settings</h2>
      <div className="set__scroll">
        <section className="set__group glass">
          <h3 className="set__gtitle">AI Provider</h3>
          <div className="set__active">
            <span>Active provider</span>
            <strong>{providerConfig.name}</strong>
            <span>{providerConfig.model || "No model selected"}</span>
            <span>{hasKey || !providerConfig.requiresApiKey ? "Key ready" : "Key missing"}</span>
          </div>
          <div className="set__chips no-drag">
            {DEFAULT_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                className={`set__chip ${providerConfig.id === provider.id ? "is-active" : ""}`}
                onClick={() => selectProvider(provider.id)}
              >
                {provider.name}
              </button>
            ))}
          </div>

          <label className="set__field">
            <span className="set__label">Provider name</span>
            <input className="set__input no-drag" value={providerConfig.name} onChange={(e) => update({ name: e.target.value })} />
          </label>

          <label className="set__field">
            <span className="set__label">Compatibility</span>
            <select
              className="set__input no-drag"
              value={providerConfig.compatibility}
              onChange={(e) => update({ compatibility: e.target.value as ProviderCompatibility })}
            >
              <option value="openAi">OpenAI /v1</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>

          <label className="set__field">
            <span className="set__label">Base URL</span>
            <input
              className="set__input no-drag"
              placeholder="https://api.example.com/v1"
              value={providerConfig.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
            />
          </label>

          <label className="set__field">
            <span className="set__label">Model</span>
            <input className="set__input no-drag" value={providerConfig.model} onChange={(e) => update({ model: e.target.value })} />
          </label>

          <label className="set__field">
            <span className="set__label">API key {hasKey ? "stored" : ""}</span>
            <input
              className="set__input no-drag"
              type="password"
              placeholder={hasKey ? "Enter a new key to replace" : "API key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>

          <div className="set__actions no-drag">
            <button className="set__button" onClick={() => void saveKey()}>Save key locally</button>
            <button className="set__button set__button--primary" disabled={testState === "testing"} onClick={() => void testProvider()}>
              {testState === "testing" ? "Testing..." : "Test provider"}
            </button>
          </div>
          {testMessage && <div className={`set__status set__status--${testState}`}>{testMessage}</div>}
        </section>

        <section className="set__group glass">
          <h3 className="set__gtitle">Voice</h3>
          <div className="set__active">
            <span>Female voice</span>
            <strong>{femaleVoice?.installed ? "Installed" : "Missing"}</strong>
            <span>{femaleVoice?.message ?? "Checking local voice"}</span>
            <span>{voiceSettings.engine === "piper" ? "Default" : "Fallback"}</span>
          </div>
          <label className="set__field">
            <span className="set__label">Voice engine</span>
            <select className="set__input no-drag" value={voiceSettings.engine} onChange={(e) => updateVoice({ engine: e.target.value as VoiceSettings["engine"] })}>
              <option value="piper">Piper local female voice</option>
              <option value="system">System voice fallback</option>
            </select>
          </label>
          <label className="set__field">
            <span className="set__label">Piper executable</span>
            <input className="set__input no-drag" placeholder={femaleVoice?.piperPath || "Auto-installed Piper path"} value={voiceSettings.piperPath} onChange={(e) => updateVoice({ piperPath: e.target.value })} />
          </label>
          <label className="set__field">
            <span className="set__label">Female voice model</span>
            <input className="set__input no-drag" placeholder={femaleVoice?.modelPath || "Auto-installed en_US-amy-medium.onnx"} value={voiceSettings.piperModelPath} onChange={(e) => updateVoice({ piperModelPath: e.target.value })} />
          </label>
          <label className="set__field">
            <span className="set__label">Voice</span>
            <select className="set__input no-drag" value={voiceSettings.voiceName} onChange={(e) => updateVoice({ voiceName: e.target.value })}>
              <option value="">Auto female-style voice</option>
              {voices.map((voice) => (
                <option key={`${voice.name}-${voice.lang}`} value={voice.name}>{voice.name} ({voice.lang})</option>
              ))}
            </select>
          </label>
          <label className="set__field">
            <span className="set__label">Recognition language</span>
            <input className="set__input no-drag" value={voiceSettings.language} onChange={(e) => updateVoice({ language: e.target.value })} />
          </label>
          <label className="set__field">
            <span className="set__label">Rate {voiceSettings.rate.toFixed(2)}</span>
            <input className="set__input no-drag" type="range" min="0.82" max="1.25" step="0.01" value={voiceSettings.rate} onChange={(e) => updateVoice({ rate: Number(e.target.value) })} />
          </label>
          <label className="set__field">
            <span className="set__label">Pitch {voiceSettings.pitch.toFixed(2)}</span>
            <input className="set__input no-drag" type="range" min="0.85" max="1.35" step="0.01" value={voiceSettings.pitch} onChange={(e) => updateVoice({ pitch: Number(e.target.value) })} />
          </label>
          <label className="set__field">
            <span className="set__label">Volume {voiceSettings.volume.toFixed(2)}</span>
            <input className="set__input no-drag" type="range" min="0.2" max="1" step="0.05" value={voiceSettings.volume} onChange={(e) => updateVoice({ volume: Number(e.target.value) })} />
          </label>

          <h3 className="set__gtitle">Voice Diagnostics</h3>
          <div className="set__diagnostics">
            <span>Piper executable</span>
            <code>{femaleVoice?.piperPath || "Unknown"}</code>
            <span>Model path</span>
            <code>{femaleVoice?.modelPath || "Unknown"}</code>
            <span>Config path</span>
            <code>{femaleVoice?.configPath || "Unknown"}</code>
            <span>Last generated WAV</span>
            <code>{femaleVoice?.lastWavPath || "None"}</code>
            <span>WAV size</span>
            <code>{femaleVoice?.wavSize ? `${femaleVoice.wavSize} bytes` : "0 bytes"}</code>
            <span>Last Piper stderr</span>
            <code>{femaleVoice?.lastPiperStderr || "None"}</code>
            <span>Last playback error</span>
            <code>{femaleVoice?.lastPlaybackError || "None"}</code>
          </div>
          <div className="set__actions no-drag set__actions--left">
            <button className="set__button set__button--primary" disabled={installingVoice} onClick={() => void installFemaleVoice()}>{installingVoice ? "Installing..." : "Install female voice"}</button>
            <button className="set__button" disabled={installingVoice} onClick={() => void installFemaleVoice()}>Repair female voice</button>
            <button className="set__button" onClick={() => void testSynthesizeOnly()}>Test synthesize only</button>
            <button className="set__button" onClick={() => void testNativePlayback()}>Test native playback</button>
            <button className="set__button" onClick={() => void testFullFemaleVoice()}>Test full female voice</button>
            <button className="set__button" onClick={() => void testMicrophone()}>Test microphone</button>
            <button className="set__button" onClick={() => void testVoiceRecognition()}>Test recognition</button>
            <button className="set__button" onClick={testVoiceOutput}>Test voice output</button>
          </div>
          {voiceMessage && <div className="set__status">{voiceMessage}</div>}
        </section>
      </div>
    </div>
  );
}
