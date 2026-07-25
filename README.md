<div align="center">

# Athena

**A voice-first AI assistant that lives on your Windows desktop.**

Ask questions, control local tools, understand what is on your screen, or open a
whiteboard without keeping another chat window in the way.

[![Windows](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-backend-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Issues](https://img.shields.io/github/issues/Hamzacross/Athena)](https://github.com/Hamzacross/Athena/issues)
[![Stars](https://img.shields.io/github/stars/Hamzacross/Athena)](https://github.com/Hamzacross/Athena/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/Hamzacross/Athena/dev)](https://github.com/Hamzacross/Athena/commits/dev)

OpenAI-compatible APIs · Anthropic · Gemini · Ollama · LM Studio · Custom gateways

</div>

---

## Overview

Athena stays near the bottom of the desktop as a small animated orb. Click it or
say **"Hey Athena"** to start speaking. The assistant listens, works on the
request, and answers aloud while keeping the interface intentionally minimal.

When a task needs more space, Athena opens a glass workspace containing the
whiteboard, screenshots, files, history, skills, and settings. The workspace
expands from the orb and closes back into it rather than behaving like a normal
application window.

Athena uses your own AI provider. API keys are stored in the operating system
credential store, and local providers can be used through Ollama, LM Studio, or
another OpenAI-compatible endpoint.

## Highlights

| Capability | What Athena does |
|------------|------------------|
| Voice interaction | Wake-word listening, speech recognition, spoken responses, and continuous conversation mode |
| Screen understanding | Captures the primary screen and sends it to a vision-capable model for a clear explanation |
| Desktop actions | Opens applications, folders, URLs, searches, and Windows settings |
| Whiteboard | Pen, eraser, pan, undo, redo, zoom, clear, and optional hand tracking |
| Local tools | Reads and writes the clipboard, browses files, and records action history |
| Flexible AI | Supports OpenAI-compatible APIs, Anthropic, Gemini, Ollama, LM Studio, and custom endpoints |
| Ambient interface | Animated listening, thinking, and speaking states with an orb-origin workspace transition |
| Local credentials | Stores provider API keys in the native OS keyring instead of browser storage |

## Quick Start

Athena is currently developed and tested as a Windows desktop application.

```powershell
git clone https://github.com/Hamzacross/Athena.git
cd Athena
git switch dev
npm install
npm run tauri dev
```

On first launch, open **Settings**, choose an AI provider, enter its API key if
required, and test the connection.

## Requirements

| Requirement | Notes |
|-------------|-------|
| Windows 10 or 11 | Screen capture and several desktop actions currently use Windows APIs and PowerShell |
| Node.js 18+ | Runs the React and Vite toolchain |
| Rust stable | Builds the Tauri backend |
| Microsoft C++ Build Tools | Install the **Desktop development with C++** workload |
| WebView2 Runtime | Included with Windows 11 and most current Windows 10 installations |

Follow the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
if the native build reports a missing compiler, SDK, or WebView dependency.

## Provider Setup

Open **Settings** from the compact Athena controls and select a provider preset.

| Provider | Protocol | API key | Screen analysis |
|----------|----------|---------|-----------------|
| OpenAI | OpenAI `/v1` | Required | Yes, with an image-capable model |
| Anthropic Claude | Anthropic Messages API | Required | Yes, with an image-capable model |
| Google Gemini | Gemini `generateContent` | Required | Yes, with an image-capable model |
| Ollama | OpenAI-compatible endpoint | Not required by default | Depends on the selected local model and endpoint |
| LM Studio | OpenAI-compatible endpoint | Not required by default | Depends on the selected local model and endpoint |
| Custom | OpenAI, Anthropic, or Gemini-compatible | Configurable | Depends on the gateway and selected model |

Provider names describe the request protocol, not the abilities of every model.
For commands such as **"read my screen"**, choose a model that accepts image
input. A text-only local model can answer normal questions but cannot explain a
screenshot.

## Usage

### Voice and shortcuts

| Action | How to use it |
|--------|---------------|
| Start or stop listening | Click the orb |
| Wake Athena | Say **"Hey Athena"**, **"Hi Athena"**, or **"Athena"** |
| Toggle the compact window | Press **Ctrl + Space** |
| Open Athena settings | Press **Ctrl + Shift + Space** |
| Close or hide the workspace | Press **Esc** or use the close control |

Speech recognition availability depends on the Windows WebView and its speech
services. Athena reports a clear error and opens Settings when recognition is
not available.

### Example commands

```text
Read my screen and explain what needs my attention.
Open the whiteboard.
Select the pen tool.
Open my Downloads folder.
Open display settings.
Search the web for Tauri window animations.
Read my clipboard.
Summarize this for studying.
Quiz me on this topic.
```

### Screen capture and analysis

Athena treats capture and analysis as separate intents:

| Request | Behavior |
|---------|----------|
| "Take a screenshot" | Captures and displays the primary screen locally |
| "Read my screen" | Captures the screen and asks the configured model to explain it |
| Screenshot **Explain** button | Analyzes the selected saved screenshot |

Screenshots are validated as PNG files before analysis and limited to 20 MB.
Normal text questions never attach a screenshot automatically.

## Privacy and Security

- Provider API keys are stored through the native operating system keyring.
- Provider configuration, such as the selected model and base URL, is stored locally.
- Screenshots remain local unless you explicitly request screen analysis or press **Explain**.
- Screen analysis sends the selected screenshot to the configured AI endpoint.
- Ollama and LM Studio can keep AI requests local when the selected model and endpoint run entirely on your machine.
- Athena does not silently fall back to another provider.

Review the privacy policy and data-retention terms of any hosted provider before
sending sensitive screen content.

## Development

### Browser UI

```powershell
npm run dev
```

This starts Vite at `http://localhost:1420`. Native Tauri commands such as screen
capture, keyring access, and desktop actions require the desktop runtime and will
not work in a normal browser tab.

### Native application

```powershell
npm run tauri dev
```

### Production build

```powershell
npm run tauri build
```

Installers and binaries are generated under
`src-tauri/target/release/bundle/`.

### Frontend verification

```powershell
npm run build
```

The command runs TypeScript checking followed by a production Vite build.

## Architecture

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Desktop shell | Tauri 2 | Transparent window, tray, shortcuts, keyring access, and native commands |
| Backend | Rust | Provider requests, screen capture, files, clipboard, local actions, history, and local TTS |
| Interface | React 18 + TypeScript | Assistant state, voice flow, workspace, whiteboard, screenshots, and settings |
| Styling | Hand-authored CSS | Dark glass visual system, orb animation, responsive layouts, and reduced-motion behavior |
| Vision | Provider-specific multimodal APIs | OpenAI-compatible image URLs, Anthropic image blocks, and Gemini inline image data |

```text
Athena/
|-- src/
|   |-- App.tsx                 # Voice flow, local intent routing, assistant state
|   |-- providerConfig.ts       # Provider presets and local configuration
|   |-- components/
|   |   |-- Orb.tsx             # Persistent ambient assistant control
|   |   |-- Workspace.tsx       # Dashboard and feature navigation
|   |   |-- Whiteboard.tsx      # Canvas and optional hand tracking
|   |   |-- Screenshots.tsx     # Capture browser and image analysis
|   |   `-- Settings.tsx        # Provider, voice, and diagnostics settings
|   `-- styles/                 # Global styles and design tokens
|-- src-tauri/
|   |-- src/lib.rs              # Native commands and provider adapters
|   |-- Cargo.toml
|   `-- tauri.conf.json         # Window and bundle configuration
`-- package.json
```

## Current Limitations

- Native screen capture is Windows-only and currently captures the primary monitor.
- A provider connection test verifies text requests; image support depends on the chosen model.
- OpenAI-compatible local gateways vary in how closely they support multimodal request formats.
- Speech recognition depends on support provided by the installed WebView.
- The repository does not yet include an automated test suite for provider contracts or UI transitions.
- macOS and Linux native behavior has not been completed or verified.

## Contributing

Contributions are welcome. Create changes from the `dev` branch, keep pull
requests focused, and include verification steps for behavior you modify.

```powershell
git clone https://github.com/Hamzacross/Athena.git
cd Athena
git switch dev
git switch -c feature/your-change
```

Use [GitHub Issues](https://github.com/Hamzacross/Athena/issues) for bugs and
feature requests. Include the Windows version, selected provider protocol, model,
and reproduction steps when reporting provider or screen-analysis problems.

## Disclaimer

Athena can launch local applications, access selected files and clipboard data,
capture the screen, and send requests to an AI provider you configure. You are
responsible for reviewing commands before using them with sensitive information
and for complying with the provider's terms and policies. The software is
provided as-is, without warranty.

---

<div align="center">

**Athena should feel like an intelligent presence, not another application to manage.**

</div>
