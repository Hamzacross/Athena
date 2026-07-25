
# Athena

## Vision
Athena is a lightweight desktop AI assistant that feels like part of the operating system. It runs quietly in the background, wakes with the user's voice, understands context, remembers work, and helps complete tasks through voice, vision, memory, and automation.

## Core Goals
- Always available with "Hey Athena"
- Very low CPU and RAM usage while idle
- Fast voice-first interaction
- Modern royal-purple glassmorphism UI
- Privacy-first with user-controlled permissions
- Local memory with optional cloud AI providers

# Phase 1 – Core Assistant (MVP)

## Features
- Background startup service
- Wake word: "Hey Athena"
- Owner voice recognition
- Multi-language voice recognition
- Detect the owner's voice even if they speak a different language than during enrollment
- Automatic spoken-language detection
- Natural voice conversations
- Floating animated assistant
- Conversation history
- User profile
- Basic memory
- Open apps, files, folders and websites
- Search the web
- Take screenshots
- Settings page

## UI
- Dark theme
- Royal purple accent colors
- Glassmorphism panels
- Rounded corners
- Smooth animations
- Animated listening waveform
- Compact floating assistant

# Phase 2 – Vision & Whiteboard

## Vision
- Understand the current screen (with permission)
- Explain visible errors
- Read text from images and PDFs
- Camera understanding

## Whiteboard
Command: "Athena, whiteboard"

Features:
- Finger drawing using hand tracking
- Palm = move canvas
- Fist = erase
- Pinch = zoom
- Voice commands for colors, save, clear and export
- Automatic save

# Phase 3 – Workspace & Memory

## Workspace
Automatically organizes:
- Whiteboards
- Screenshots
- Notes
- Images
- PDFs
- Saved conversations

## Memory
Remember:
- Projects
- Preferences
- Recent tasks
- Conversations

Commands:
- Continue yesterday's work
- Show previous whiteboard
- Find saved screenshot

# Phase 4 – Smart Automation

## Device Control
- Launch apps
- Open websites
- Manage files
- Control volume and brightness
- Timers
- Reminders
- Notifications

## Technology Stack

### Frontend
- Flutter
- Material 3 / Fluent UI
- Rive or Lottie animations

### Backend
- Rust (preferred)
- Go (alternative)
- SQLite
- Tokio async runtime

### Voice
- OpenWakeWord or Picovoice Porcupine
- faster-whisper / Whisper
- ElevenLabs or Piper/Kokoro TTS
- pyannote.audio or Resemblyzer for speaker recognition

### Vision
- OpenCV
- MediaPipe
- PaddleOCR or Tesseract
- Optional YOLO object detection

### AI Providers
- OpenAI
- Anthropic Claude
- Google Gemini
- Ollama
- LM Studio

### Automation
- Native Windows APIs
- Native macOS APIs
- Linux desktop APIs
- Playwright (browser automation)

## Security
- Encrypt sensitive local data
- Encrypt memories (optional)
- Store API keys securely
- Request permissions before accessing camera, microphone, screen or files
- Digitally signed releases
- Obfuscate release binaries to make reverse engineering more difficult
- Never include source code in release builds
- Secure automatic updates

## Offline Mode
Without internet Athena should still:
- Wake with "Hey Athena"
- Recognize the owner's voice
- Open applications
- Control the computer
- Search local files
- Take screenshots
- Use Whiteboard

## Performance Targets
- Near-zero idle CPU
- Low RAM usage
- Startup under 2 seconds
- Wake response under 500 ms

## Cross Platform
- Windows
- macOS
- Linux
Future:
- Android
- iOS

## Accessibility
- Keyboard shortcuts
- Adjustable fonts
- High contrast mode
- Screen reader support
- Voice-only operation

## Mission
Athena should become a trusted operating-system companion that is always available, lightweight, multilingual, privacy-focused, and capable of helping users naturally through voice, vision, memory, and automation.
