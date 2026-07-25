<div align="center">

# 🦉 Athena

**A living, voice-first AI companion that floats above your desktop.**

*Not another chat window — an ambient intelligence that feels built into your OS.*

Royal purple · Dark glass · Almost invisible until you need it

</div>

---

## What is Athena?

Athena is a lightweight desktop assistant that lives **above** your desktop as a small glowing orb rather than inside a window. You talk to it. It listens, thinks, acts, and speaks back — communicating through **motion and glow instead of walls of text**.

Think of it as what you'd get by combining:

> Siri · Windows Copilot Voice · ChatGPT Advanced Voice · Raycast · Arc · Nothing OS · visionOS

There is **no permanent application window**. The only thing on your screen at rest is a 64px orb near the bottom-center that breathes softly and fades away when idle. Everything else appears only when it's needed and disappears when it's not.

---

## The Experience

Athena has five visual states — and communicates almost entirely through them:

| State | What you see |
|-------|--------------|
| 🟣 **Idle** | A 64px glowing orb, breathing gently. Fades semi-transparent after a few seconds so it never blocks your work. |
| 🎤 **Listening** | Orb expands, glow intensifies, ripples radiate outward, and a minimal waveform appears beneath it. No transcript. |
| 🤔 **Thinking** | Waveform vanishes; particles orbit the orb and the glow pulses. No spinner. |
| 🗣️ **Speaking** | Waveform returns and the orb pulses in sync with Athena's voice volume. |
| 📝 **Confirmations** | Tiny floating cards — `✓ Screenshot saved`, `✓ VS Code opened` — that fade after 3 seconds. |

Press **`Ctrl + Space`** (or say *"Open Workspace"*) to open the **Workspace** — a separate dashboard for History, Memory, Whiteboards, Screenshots, Files, Projects, Conversations, and Settings. This is Athena's *memory*, not the assistant itself. It closes the moment you're done.

---

## Why Athena? (Benefits)

- **🎙️ Voice-first, not type-first.** Athena assumes you'll rarely touch the keyboard. It's designed to be spoken to, not typed at.
- **🪶 Invisible until needed.** No taskbar clutter, no always-open window. Just an orb that gets out of your way and fades when idle.
- **⚡ Lightweight & always-on.** Built on a Rust backend + native webview shell for near-zero idle footprint — it can run quietly in the background all day.
- **🧠 It remembers.** Conversations, projects, screenshots, and whiteboards are kept in the Workspace so context carries across sessions.
- **🔒 Private by design.** Your API keys and memories are stored on your device. Bring your own AI provider (Claude, OpenAI, Gemini, or fully local via Ollama / LM Studio).
- **🗣️ Owner-aware & multilingual.** Designed to recognize its owner's voice and understand you across languages.
- **🎨 Premium, calm design.** Soft springs, blur, glow, breathing, and particles — no bouncing, no gimmicks. It feels like part of the operating system.
- **🖥️ Never in the way.** Always-on-top, draggable, edge-snapping, and auto-transparent when inactive.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Shell / Backend** | [Tauri 2](https://tauri.app) (Rust) — transparent, always-on-top overlay window |
| **UI** | React 18 + TypeScript |
| **Build tool** | Vite 5 |
| **Styling** | Hand-authored CSS with a royal-purple glassmorphism design system |

Tauri was chosen over Electron for its dramatically lower idle RAM/CPU — essential for something that runs all day and should "feel like a built-in AI inside Windows."

---

## Installation

### Prerequisites

You'll need these installed first:

| Tool | Version | Purpose |
|------|---------|---------|
| **[Node.js](https://nodejs.org)** | 18+ (tested on 22) | Frontend tooling |
| **[Rust](https://rustup.rs)** | 1.77+ (tested on 1.97) | Tauri backend |
| **Tauri system deps** | — | See [platform setup](https://tauri.app/start/prerequisites/) |

> **Windows:** install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on Windows 11).
> **macOS:** install Xcode Command Line Tools (`xcode-select --install`).
> **Linux:** install `webkit2gtk` and related packages per the Tauri prerequisites page.

### 1. Install dependencies

```bash
npm install
```

### 2. Run the UI in the browser (fastest preview)

```bash
npm run dev
```

Then open **http://localhost:1420**. This runs just the web UI — great for iterating on the interface.

> **Tip:** A small dev-only control strip appears top-right (`demo` / `workspace` / `toast`) so you can trigger Athena's states without a microphone. It's clearly marked and will be removed once real voice input is wired.

### 3. Run as a native desktop app

Install the Tauri CLI once:

```bash
cargo install tauri-cli --version "^2"
```

Then launch the floating overlay:

```bash
npm run tauri dev
```

This opens Athena as a transparent, borderless, always-on-top window over your desktop.

### 4. Build a production binary

```bash
npm run tauri build
```

Installers/binaries are emitted to `src-tauri/target/release/bundle/`.

---

## Usage

| Action | How |
|--------|-----|
| Wake / start listening | Say **"Hey Athena"** *(voice engine pending)* — or click the orb |
| Open the Workspace | **`Ctrl + Space`** |
| Close the Workspace | **`Esc`** |
| Move the orb | Drag it anywhere; it snaps to screen edges |

---

## Project Structure

```
Athena/
├── index.html                 # Vite entry
├── package.json
├── vite.config.ts
├── src/                       # React + TypeScript UI
│   ├── main.tsx               # App bootstrap
│   ├── App.tsx                # Ambient shell + state machine + shortcuts
│   ├── App.css
│   ├── types.ts               # Shared types (AssistantState, etc.)
│   ├── styles/
│   │   ├── theme.css          # Design tokens (royal-purple palette)
│   │   └── global.css         # Glass utilities, resets
│   └── components/
│       ├── Orb.tsx            # The ambient orb — all 5 states
│       ├── Waveform.tsx       # Minimal listening/speaking waveform
│       ├── Toast.tsx          # Floating confirmations (fade after 3s)
│       ├── Workspace.tsx      # Ctrl+Space dashboard (memory, settings…)
│       ├── Settings.tsx       # Voice, providers, permissions, appearance
│       ├── AthenaMark.tsx     # Owl-in-helmet logo (vector)
│       └── Toggle.tsx         # Reusable switch
└── src-tauri/                 # Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json        # Transparent always-on-top overlay config
    └── src/
        ├── main.rs
        └── lib.rs             # Tauri commands (send_message stub)
```

---

## Roadmap

Athena's interface is complete and interactive, running on mock data. Next up:

- [ ] Wake-word detection ("Hey Athena")
- [ ] Speech-to-text (microphone → transcript)
- [ ] LLM integration (Claude / OpenAI / Gemini / local)
- [ ] Text-to-speech with live volume → orb pulse
- [ ] Owner voice recognition & multilingual support
- [ ] Persistent memory, whiteboards, and screenshot capture
- [ ] Global hotkey registration & edge-snapping in the native shell

---

## Notes

- **Logo:** `AthenaMark.tsx` is a hand-built vector of the owl-in-helmet mark. To use the exact artwork, drop it at `src/assets/athena-logo.png` and it can be swapped in (and used to generate the app `.ico`).
- **Current state:** The UI layer is fully built and verified; the voice/AI backend is stubbed and ready to wire up.

---

<div align="center">

*Athena should feel like an intelligent presence — not software.*

</div>
