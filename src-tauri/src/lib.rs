use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const KEY_SERVICE: &str = "Athena";
const WINDOW_LABEL: &str = "athena-overlay";
const COMPACT_WIDTH: f64 = 220.0;
const COMPACT_HEIGHT: f64 = 180.0;
const SETTINGS_WIDTH: f64 = 940.0;
const SETTINGS_HEIGHT: f64 = 660.0;
const SYSTEM_PROMPT: &str = "You are Athena, a student-focused desktop assistant. Help students learn with clear steps, examples, quizzes, flashcards, summaries, study plans, and homework guidance. Be concise for voice. Do not claim you opened apps, changed settings, read files, searched the web, or viewed the screen unless Athena's local tools actually did it. If a requested real-world action is unavailable, say so honestly and suggest the closest working action.";
const PIPER_WINDOWS_URL: &str = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
const AMY_MODEL_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx?download=true";
const AMY_CONFIG_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json?download=true";
const AMY_MODEL: &str = "en_US-amy-medium.onnx";
const AMY_CONFIG: &str = "en_US-amy-medium.onnx.json";

struct AppState {
    pending_settings_open: Mutex<bool>,
    window_mode: Mutex<WindowMode>,
    voice_diagnostics: Mutex<VoiceDiagnostics>,
    http_client: reqwest::Client,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            pending_settings_open: Mutex::new(false),
            window_mode: Mutex::new(WindowMode::Compact),
            voice_diagnostics: Mutex::new(VoiceDiagnostics::default()),
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(25))
                .build()
                .expect("failed to create HTTP client"),
        }
    }
}

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum WindowMode {
    #[default]
    Compact,
    Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub compatibility: ProviderCompatibility,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub requires_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderCompatibility {
    OpenAi,
    Anthropic,
    Gemini,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTestResult {
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub at: i64,
    pub provider: Option<String>,
    pub ok: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceContext {
    pub today: String,
    pub timezone: String,
    pub os: String,
    pub arch: String,
    pub family: String,
    pub exe_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    pub path: String,
    pub content: String,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotResult {
    pub path: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTtsStatus {
    pub available: bool,
    pub message: String,
    pub piper_path: String,
    pub model_path: String,
    pub config_path: String,
    pub last_wav_path: String,
    pub wav_size: u64,
    pub last_piper_stderr: String,
    pub last_playback_error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FemaleVoiceStatus {
    pub installed: bool,
    pub message: String,
    pub piper_path: String,
    pub model_path: String,
    pub config_path: String,
    pub last_wav_path: String,
    pub wav_size: u64,
    pub last_piper_stderr: String,
    pub last_playback_error: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceDiagnostics {
    pub piper_path: String,
    pub model_path: String,
    pub config_path: String,
    pub last_wav_path: String,
    pub wav_size: u64,
    pub last_piper_stderr: String,
    pub last_playback_error: String,
}

struct PiperSynthesis {
    path: PathBuf,
    size: u64,
    stderr: String,
    piper_path: PathBuf,
    model_path: PathBuf,
    config_path: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
}

const MAX_TEXT_FILE_BYTES: u64 = 512 * 1024;
const MAX_SEARCH_RESULTS: usize = 80;

#[tauri::command]
fn show_window(app: AppHandle) -> Result<(), String> {
    show_compact_window(&app)
}

#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    open_settings_window(&app)
}

#[tauri::command]
fn open_workspace(app: AppHandle) -> Result<(), String> {
    open_workspace_window(&app)
}

#[tauri::command]
fn show_compact(app: AppHandle) -> Result<(), String> {
    show_compact_window(&app)
}

#[tauri::command]
fn frontend_ready(app: AppHandle, state: tauri::State<AppState>) -> Result<bool, String> {
    let mut pending = state
        .pending_settings_open
        .lock()
        .map_err(|_| "Unable to read pending settings state.".to_string())?;
    let should_open = *pending;
    *pending = false;
    if should_open {
        set_window_mode(&app, WindowMode::Settings)?;
        resize_window_centered(&app, SETTINGS_WIDTH, SETTINGS_HEIGHT)?;
        show_main_window(&app)?;
    }
    Ok(should_open)
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Athena window was not found".to_string())?;
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let target = normalize_url(&url);
    open_external(&target)
}

#[tauri::command]
fn open_windows_settings(target: String) -> Result<(), String> {
    let uri = match target.trim().to_lowercase().as_str() {
        "display" => "ms-settings:display",
        "sound" | "audio" => "ms-settings:sound",
        "date" | "time" | "date-time" | "dateandtime" => "ms-settings:dateandtime",
        "microphone" | "mic" => "ms-settings:privacy-microphone",
        "apps" => "ms-settings:appsfeatures",
        _ => "ms-settings:",
    };
    open_external(uri)
}

#[tauri::command]
fn open_app(name: String) -> Result<(), String> {
    let query = name.trim();
    if query.is_empty() {
        return Err("App name is required.".into());
    }
    if let Some(command) = app_alias_command(query) {
        return open_external(command);
    }
    if let Some(app) = find_installed_app(query) {
        return open_external(&app.path);
    }
    Err(format!("I could not find an installed app named {query}."))
}

#[tauri::command]
fn get_installed_apps() -> Result<Vec<InstalledApp>, String> {
    Ok(installed_apps())
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let target = expand_user_path(&path);
    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.to_string_lossy()));
    }
    open_external(&target.to_string_lossy())
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let target = expand_user_path(&path);
    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.to_string_lossy()));
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", target.to_string_lossy()))
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        open_external(&target.parent().unwrap_or(&target).to_string_lossy())
    }
}

#[tauri::command]
fn read_clipboard() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-Clipboard"])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).trim_end().to_string());
        }
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Clipboard read is currently implemented for Windows only.".into())
    }
}

#[tauri::command]
fn write_clipboard(text: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut child = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Set-Clipboard"])
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        let status = child.wait().map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err("Unable to write clipboard.".into());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = text;
        Err("Clipboard write is currently implemented for Windows only.".into())
    }
}

#[tauri::command]
fn save_provider_api_key(provider_id: String, api_key: String) -> Result<(), String> {
    let entry = Entry::new(KEY_SERVICE, &provider_id).map_err(|e| e.to_string())?;
    if api_key.trim().is_empty() {
        match entry.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(&api_key).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn has_provider_api_key(provider_id: String) -> Result<bool, String> {
    let entry = Entry::new(KEY_SERVICE, &provider_id).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn test_provider(config: ProviderConfig, state: tauri::State<'_, AppState>) -> Result<ProviderTestResult, String> {
    call_provider(&state.http_client, &config, "Reply with only OK.".to_string())
        .await
        .map(|reply| ProviderTestResult {
            ok: true,
            message: format!("Connected. Provider replied: {}", reply.trim()),
        })
        .or_else(|message| Ok(ProviderTestResult { ok: false, message }))
}

#[tauri::command]
async fn send_message(config: ProviderConfig, text: String, state: tauri::State<'_, AppState>) -> Result<ProviderTestResult, String> {
    let enriched = format!(
        "Local context:\n{}\n\nUser request:\n{}",
        device_context_prompt(),
        text
    );
    call_provider(&state.http_client, &config, enriched)
        .await
        .map(|reply| ProviderTestResult {
            ok: true,
            message: reply,
        })
        .or_else(|message| Ok(ProviderTestResult { ok: false, message }))
}

#[tauri::command]
fn get_device_context() -> Result<DeviceContext, String> {
    Ok(device_context())
}

#[tauri::command]
fn get_history(app: AppHandle) -> Result<Vec<HistoryEntry>, String> {
    read_history(&app)
}

#[tauri::command]
fn append_history_entry(app: AppHandle, entry: HistoryEntry) -> Result<(), String> {
    let mut entries = read_history(&app)?;
    entries.insert(0, entry);
    if entries.len() > 500 {
        entries.truncate(500);
    }
    write_history(&app, &entries)
}

#[tauri::command]
fn delete_history_entry(app: AppHandle, id: String) -> Result<(), String> {
    let mut entries = read_history(&app)?;
    entries.retain(|entry| entry.id != id);
    write_history(&app, &entries)
}

#[tauri::command]
fn clear_history(app: AppHandle) -> Result<(), String> {
    write_history(&app, &[])
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let target = expand_user_path(&path);
    let mut entries = Vec::new();
    for item in fs::read_dir(&target).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let metadata = item.metadata().map_err(|e| e.to_string())?;
        entries.push(FileEntry {
            name: item.file_name().to_string_lossy().to_string(),
            path: item.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified: metadata.modified().ok().and_then(system_time_ms),
        });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<FileReadResult, String> {
    let target = expand_user_path(&path);
    let metadata = fs::metadata(&target).map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("Path is not a file.".into());
    }

    let bytes = fs::read(&target).map_err(|e| e.to_string())?;
    if bytes.iter().take(4096).any(|byte| *byte == 0) {
        return Err("Binary files are not readable in Athena yet.".into());
    }
    let truncated = bytes.len() as u64 > MAX_TEXT_FILE_BYTES;
    let slice = if truncated { &bytes[..MAX_TEXT_FILE_BYTES as usize] } else { &bytes[..] };
    let content = String::from_utf8_lossy(slice).to_string();
    Ok(FileReadResult {
        path: target.to_string_lossy().to_string(),
        content,
        truncated,
    })
}

#[tauri::command]
fn search_files(root: String, query: String) -> Result<Vec<FileEntry>, String> {
    let root = expand_user_path(&root);
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let mut results = Vec::new();
    collect_file_matches(&root, &needle, &mut results, 0)?;
    Ok(results)
}

#[tauri::command]
fn take_screenshot(app: AppHandle) -> Result<ScreenshotResult, String> {
    let dir = app_data_dir(&app)?.join("screenshots");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("athena-screen-{}.png", now_ms()));
    capture_screen_with_powershell(&path)?;
    Ok(ScreenshotResult {
        path: path.to_string_lossy().to_string(),
        ok: true,
        message: "Screenshot captured. Vision analysis still depends on a vision-capable provider.".into(),
    })
}

#[tauri::command]
fn list_screenshots(app: AppHandle) -> Result<Vec<FileEntry>, String> {
    let dir = app_data_dir(&app)?.join("screenshots");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    list_directory(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn local_tts_status(app: AppHandle, state: tauri::State<AppState>, piper_path: String, model_path: String) -> Result<LocalTtsStatus, String> {
    let executable = resolve_piper_path(Some(&app), &piper_path);
    let model = resolve_voice_model_path(Some(&app), &model_path);
    let config = resolve_voice_config_path(Some(&app), &model_path);
    let espeak_data = executable.as_ref().and_then(|path| resolve_espeak_data_path(path));
    let diagnostics = voice_diagnostics_value(&state);
    let (available, message) = if executable.is_none() {
        (false, "Female voice is not installed. Click Install female voice in Settings.".into())
    } else if model.is_none() {
        (false, "Female voice model is not installed. Click Install female voice in Settings.".into())
    } else if config.is_none() {
        (false, "Female voice config missing. Reinstall female voice.".into())
    } else if espeak_data.is_none() {
        (false, "Piper espeak-ng-data is missing. Click Repair female voice in Settings.".into())
    } else {
        (true, "Piper local voice is ready.".into())
    };
    Ok(LocalTtsStatus {
        available,
        message,
        piper_path: executable.as_ref().map(|p| path_string(p)).unwrap_or_else(|| bundled_piper_path(&app).map(|p| path_string(&p)).unwrap_or_default()),
        model_path: model.as_ref().map(|p| path_string(p)).unwrap_or_else(|| bundled_amy_model_path(&app).map(|p| path_string(&p)).unwrap_or_default()),
        config_path: config.as_ref().map(|p| path_string(p)).unwrap_or_else(|| bundled_amy_config_path(&app).map(|p| path_string(&p)).unwrap_or_default()),
        last_wav_path: diagnostics.last_wav_path,
        wav_size: diagnostics.wav_size,
        last_piper_stderr: diagnostics.last_piper_stderr,
        last_playback_error: diagnostics.last_playback_error,
    })
}

#[tauri::command]
fn synthesize_piper(app: AppHandle, state: tauri::State<AppState>, text: String, piper_path: String, model_path: String) -> Result<String, String> {
    let result = synthesize_piper_file(&app, text, &piper_path, &model_path)?;
    update_voice_diagnostics(&state, |diagnostics| {
        diagnostics.piper_path = path_string(&result.piper_path);
        diagnostics.model_path = path_string(&result.model_path);
        diagnostics.config_path = path_string(&result.config_path);
        diagnostics.last_wav_path = path_string(&result.path);
        diagnostics.wav_size = result.size;
        diagnostics.last_piper_stderr = result.stderr.clone();
        diagnostics.last_playback_error.clear();
    });
    Ok(path_string(&result.path))
}

#[tauri::command]
fn play_wav_file(state: tauri::State<AppState>, path: String) -> Result<(), String> {
    let wav_path = PathBuf::from(path);
    match play_wav_native(&wav_path) {
        Ok(()) => {
            update_voice_diagnostics(&state, |diagnostics| {
                diagnostics.last_wav_path = path_string(&wav_path);
                diagnostics.wav_size = fs::metadata(&wav_path).map(|m| m.len()).unwrap_or(0);
                diagnostics.last_playback_error.clear();
            });
            Ok(())
        }
        Err(error) => {
            update_voice_diagnostics(&state, |diagnostics| {
                diagnostics.last_wav_path = path_string(&wav_path);
                diagnostics.wav_size = fs::metadata(&wav_path).map(|m| m.len()).unwrap_or(0);
                diagnostics.last_playback_error = error.clone();
            });
            Err(error)
        }
    }
}

#[tauri::command]
fn speak_piper(app: AppHandle, state: tauri::State<AppState>, text: String, piper_path: String, model_path: String) -> Result<String, String> {
    let result = synthesize_piper_file(&app, text, &piper_path, &model_path)?;
    update_voice_diagnostics(&state, |diagnostics| {
        diagnostics.piper_path = path_string(&result.piper_path);
        diagnostics.model_path = path_string(&result.model_path);
        diagnostics.config_path = path_string(&result.config_path);
        diagnostics.last_wav_path = path_string(&result.path);
        diagnostics.wav_size = result.size;
        diagnostics.last_piper_stderr = result.stderr.clone();
        diagnostics.last_playback_error.clear();
    });
    match play_wav_native(&result.path) {
        Ok(()) => Ok(format!("Played {} ({} bytes)", path_string(&result.path), result.size)),
        Err(error) => {
            update_voice_diagnostics(&state, |diagnostics| diagnostics.last_playback_error = error.clone());
            Err(error)
        }
    }
}

fn synthesize_piper_file(app: &AppHandle, text: String, piper_path: &str, model_path: &str) -> Result<PiperSynthesis, String> {
    let executable = resolve_piper_path(Some(app), piper_path).ok_or_else(|| "Female voice is not installed. Open Settings and click Install female voice.".to_string())?;
    let model = resolve_voice_model_path(Some(app), model_path).ok_or_else(|| "Female voice model is not installed. Open Settings and click Install female voice.".to_string())?;
    let config = resolve_voice_config_path(Some(app), model_path).ok_or_else(|| "Female voice config missing. Reinstall female voice.".to_string())?;
    let espeak_data = resolve_espeak_data_path(&executable).ok_or_else(|| "Piper espeak-ng-data is missing. Click Repair female voice in Settings.".to_string())?;
    let dir = app_data_dir(&app)?.join("tts");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let output = dir.join(format!("athena-{}.wav", now_ms()));
    let mut child = Command::new(&executable)
        .arg("--model")
        .arg(&model)
        .arg("--config")
        .arg(&config)
        .arg("--espeak_data")
        .arg(&espeak_data)
        .arg("--output_file")
        .arg(&output)
        .current_dir(executable.parent().unwrap_or_else(|| Path::new(".")))
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    }
    let output_status = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output_status.status.success() {
        let stderr = String::from_utf8_lossy(&output_status.stderr).trim().to_string();
        return Err(if stderr.is_empty() { "Piper synthesis failed.".into() } else { format!("Piper synthesis failed: {stderr}") });
    }
    let size = fs::metadata(&output).map_err(|e| e.to_string())?.len();
    if size < 44 {
        return Err(format!("Piper generated an invalid WAV file: {} bytes", size));
    }
    Ok(PiperSynthesis {
        path: output,
        size,
        stderr: String::from_utf8_lossy(&output_status.stderr).trim().to_string(),
        piper_path: executable,
        model_path: model,
        config_path: config,
    })
}

#[tauri::command]
fn female_voice_status(app: AppHandle, state: tauri::State<AppState>) -> Result<FemaleVoiceStatus, String> {
    Ok(female_voice_status_value(&app, &state))
}

#[tauri::command]
async fn install_female_voice(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<FemaleVoiceStatus, String> {
    let piper_dir = piper_app_dir(&app)?;
    let voices_dir = voices_app_dir(&app)?;
    fs::create_dir_all(&piper_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&voices_dir).map_err(|e| e.to_string())?;

    let piper_exe = piper_dir.join("piper.exe");
    if cfg!(target_os = "windows") && !piper_exe.is_file() {
        let zip_path = piper_dir.join("piper_windows_amd64.zip");
        download_file(&state.http_client, PIPER_WINDOWS_URL, &zip_path).await?;
        expand_zip(&zip_path, &piper_dir)?;
        let nested_dir = piper_dir.join("piper");
        let nested = nested_dir.join("piper.exe");
        if nested.is_file() {
            flatten_directory(&nested_dir, &piper_dir)?;
        }
    }

    let model_path = voices_dir.join(AMY_MODEL);
    if !model_path.is_file() {
        download_file(&state.http_client, AMY_MODEL_URL, &model_path).await?;
    }
    let config_path = voices_dir.join(AMY_CONFIG);
    if !config_path.is_file() {
        download_file(&state.http_client, AMY_CONFIG_URL, &config_path).await?;
    }

    let status = female_voice_status_value(&app, &state);
    if status.installed {
        Ok(status)
    } else {
        Err(status.message)
    }
}

async fn call_provider(client: &reqwest::Client, config: &ProviderConfig, text: String) -> Result<String, String> {
    let base_url = config.base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return Err("Base URL is required.".into());
    }
    if config.model.trim().is_empty() {
        return Err("Model is required.".into());
    }

    let api_key = read_api_key(&config.id)?;
    if config.requires_api_key && api_key.trim().is_empty() {
        return Err("API key is required for this provider.".into());
    }

    match config.compatibility {
        ProviderCompatibility::OpenAi => call_openai_compatible(client, config, base_url, &api_key, text).await,
        ProviderCompatibility::Anthropic => call_anthropic_compatible(client, config, base_url, &api_key, text).await,
        ProviderCompatibility::Gemini => call_gemini_compatible(client, config, base_url, &api_key, text).await,
    }
}

async fn call_openai_compatible(
    client: &reqwest::Client,
    config: &ProviderConfig,
    base_url: &str,
    api_key: &str,
    text: String,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", ensure_v1(base_url));
    let mut request = client.post(url).json(&json!({
        "model": config.model,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": text }
        ],
        "temperature": 0.2,
        "max_tokens": 220
    }));

    if !api_key.trim().is_empty() {
        request = request.bearer_auth(api_key);
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(provider_error(status.as_u16(), &body));
    }

    body["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Provider response did not include assistant text.".to_string())
}

async fn call_anthropic_compatible(
    client: &reqwest::Client,
    config: &ProviderConfig,
    base_url: &str,
    api_key: &str,
    text: String,
) -> Result<String, String> {
    let url = format!("{}/messages", ensure_v1(base_url));
    let response = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&json!({
            "model": config.model,
            "max_tokens": 220,
            "system": SYSTEM_PROMPT,
            "messages": [{ "role": "user", "content": text }]
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(provider_error(status.as_u16(), &body));
    }

    body["content"]
        .as_array()
        .and_then(|content| content.iter().find_map(|item| item["text"].as_str()))
        .map(|s| s.to_string())
        .ok_or_else(|| "Provider response did not include assistant text.".to_string())
}

async fn call_gemini_compatible(
    client: &reqwest::Client,
    config: &ProviderConfig,
    base_url: &str,
    api_key: &str,
    text: String,
) -> Result<String, String> {
    let url = format!(
        "{}/models/{}:generateContent?key={}",
        base_url,
        config.model.trim(),
        api_key.trim()
    );
    let response = client
        .post(url)
        .json(&json!({
            "systemInstruction": {
                "parts": [{ "text": SYSTEM_PROMPT }]
            },
            "contents": [{
                "parts": [{ "text": text }]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 220
            }
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(provider_error(status.as_u16(), &body));
    }

    body["candidates"][0]["content"]["parts"]
        .as_array()
        .and_then(|parts| parts.iter().find_map(|part| part["text"].as_str()))
        .map(|s| s.to_string())
        .ok_or_else(|| "Gemini response did not include assistant text.".to_string())
}

fn ensure_v1(base_url: &str) -> String {
    if base_url.ends_with("/v1") {
        base_url.to_string()
    } else {
        format!("{base_url}/v1")
    }
}

fn read_api_key(provider_id: &str) -> Result<String, String> {
    let entry = Entry::new(KEY_SERVICE, provider_id).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(value),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

fn provider_error(status: u16, body: &Value) -> String {
    let message = body["error"]["message"]
        .as_str()
        .or_else(|| body["message"].as_str())
        .unwrap_or("Provider request failed.");
    format!("HTTP {status}: {message}")
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn piper_app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("piper"))
}

fn voices_app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("voices"))
}

fn bundled_piper_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(piper_app_dir(app)?.join(if cfg!(windows) { "piper.exe" } else { "piper" }))
}

fn bundled_amy_model_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(voices_app_dir(app)?.join(AMY_MODEL))
}

fn bundled_amy_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(voices_app_dir(app)?.join(AMY_CONFIG))
}

fn female_voice_status_value(app: &AppHandle, state: &tauri::State<AppState>) -> FemaleVoiceStatus {
    let piper_path = bundled_piper_path(app).unwrap_or_default();
    let model_path = bundled_amy_model_path(app).unwrap_or_default();
    let config_path = bundled_amy_config_path(app).unwrap_or_default();
    let diagnostics = voice_diagnostics_value(state);
    let piper_exists = piper_path.is_file();
    let model_exists = model_path.is_file();
    let config_exists = config_path.is_file();
    let espeak_exists = resolve_espeak_data_path(&piper_path).is_some();
    let installed = piper_exists && model_exists && config_exists && espeak_exists;
    let message = if installed {
        "Athena female voice is installed.".into()
    } else if !config_exists && piper_exists && model_exists {
        "Female voice config missing. Reinstall female voice.".into()
    } else if !espeak_exists && piper_exists {
        "Piper espeak-ng-data is missing. Click Repair female voice in Settings.".into()
    } else if !model_exists {
        "Female voice model is not installed.".into()
    } else if !piper_exists {
        "Piper executable is not installed.".into()
    } else {
        "Athena female voice is not installed.".into()
    };
    FemaleVoiceStatus {
        installed,
        message,
        piper_path: path_string(&piper_path),
        model_path: path_string(&model_path),
        config_path: path_string(&config_path),
        last_wav_path: diagnostics.last_wav_path,
        wav_size: diagnostics.wav_size,
        last_piper_stderr: diagnostics.last_piper_stderr,
        last_playback_error: diagnostics.last_playback_error,
    }
}

fn voice_diagnostics_value(state: &tauri::State<AppState>) -> VoiceDiagnostics {
    state
        .voice_diagnostics
        .lock()
        .map(|diagnostics| diagnostics.clone())
        .unwrap_or_default()
}

fn update_voice_diagnostics(state: &tauri::State<AppState>, update: impl FnOnce(&mut VoiceDiagnostics)) {
    if let Ok(mut diagnostics) = state.voice_diagnostics.lock() {
        update(&mut diagnostics);
    }
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

async fn download_file(client: &reqwest::Client, url: &str, path: &Path) -> Result<(), String> {
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status().as_u16()));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, bytes).map_err(|e| e.to_string())
}

fn expand_zip(zip_path: &Path, destination: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|e| e.to_string())?;
        let Some(enclosed) = file.enclosed_name() else { continue; };
        let output_path = destination.join(enclosed);
        if file.is_dir() {
            fs::create_dir_all(&output_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut output = fs::File::create(&output_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut output).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn flatten_directory(source: &Path, destination: &Path) -> Result<(), String> {
    for item in fs::read_dir(source).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let target = destination.join(item.file_name());
        if item.path().is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            flatten_directory(&item.path(), &target)?;
        } else if item.path().is_file() {
            let _ = fs::copy(item.path(), target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("history.json"))
}

fn read_history(app: &AppHandle) -> Result<Vec<HistoryEntry>, String> {
    let path = history_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_history(app: &AppHandle, entries: &[HistoryEntry]) -> Result<(), String> {
    let path = history_path(app)?;
    let content = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn device_context() -> DeviceContext {
    DeviceContext {
        today: chrono::Local::now().format("%A, %B %d, %Y %I:%M %p").to_string(),
        timezone: chrono::Local::now().format("%Z").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
        exe_path: std::env::current_exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
    }
}

fn device_context_prompt() -> String {
    let context = device_context();
    format!(
        "Today: {}\nTimezone: {}\nOS: {}\nArchitecture: {}\nFamily: {}",
        context.today, context.timezone, context.os, context.arch, context.family
    )
}

fn system_time_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH).ok().map(|duration| duration.as_millis() as u64)
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|duration| duration.as_millis()).unwrap_or(0)
}

fn expand_user_path(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if trimmed == "~" || trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
            return PathBuf::from(home).join(trimmed.trim_start_matches('~').trim_start_matches(['/', '\\']));
        }
    }
    PathBuf::from(trimmed)
}

fn collect_file_matches(path: &Path, needle: &str, results: &mut Vec<FileEntry>, depth: usize) -> Result<(), String> {
    if results.len() >= MAX_SEARCH_RESULTS || depth > 8 {
        return Ok(());
    }
    let items = match fs::read_dir(path) {
        Ok(items) => items,
        Err(_) => return Ok(()),
    };
    for item in items {
        if results.len() >= MAX_SEARCH_RESULTS {
            break;
        }
        let item = match item {
            Ok(item) => item,
            Err(_) => continue,
        };
        let metadata = match item.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let name = item.file_name().to_string_lossy().to_string();
        if name.to_lowercase().contains(needle) {
            results.push(FileEntry {
                name,
                path: item.path().to_string_lossy().to_string(),
                is_dir: metadata.is_dir(),
                size: metadata.len(),
                modified: metadata.modified().ok().and_then(system_time_ms),
            });
        }
        if metadata.is_dir() {
            let _ = collect_file_matches(&item.path(), needle, results, depth + 1);
        }
    }
    Ok(())
}

fn resolve_piper_path(app: Option<&AppHandle>, configured: &str) -> Option<PathBuf> {
    let trimmed = configured.trim();
    if !trimmed.is_empty() {
        let path = PathBuf::from(trimmed);
        if path.is_file() {
            return Some(path);
        }
    }
    if let Some(app) = app {
        if let Ok(path) = bundled_piper_path(app) {
            if path.is_file() {
                return Some(path);
            }
        }
    }
    Some(PathBuf::from(if cfg!(windows) { "piper.exe" } else { "piper" }))
}

fn resolve_voice_model_path(app: Option<&AppHandle>, configured: &str) -> Option<PathBuf> {
    let trimmed = configured.trim();
    if !trimmed.is_empty() {
        let path = PathBuf::from(trimmed);
        if path.is_file() {
            return Some(path);
        }
    }
    if let Some(app) = app {
        if let Ok(path) = bundled_amy_model_path(app) {
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn resolve_voice_config_path(app: Option<&AppHandle>, configured_model: &str) -> Option<PathBuf> {
    let trimmed = configured_model.trim();
    if !trimmed.is_empty() {
        let model_path = PathBuf::from(trimmed);
        let config_path = PathBuf::from(format!("{}.json", model_path.to_string_lossy()));
        if config_path.is_file() {
            return Some(config_path);
        }
    }
    if let Some(app) = app {
        if let Ok(path) = bundled_amy_config_path(app) {
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn resolve_espeak_data_path(piper_executable: &Path) -> Option<PathBuf> {
    let piper_dir = piper_executable.parent()?;
    for path in [
        piper_dir.join("espeak-ng-data"),
        piper_dir.join("piper").join("espeak-ng-data"),
    ] {
        if path.join("phontab").is_file() {
            return Some(path);
        }
    }
    None
}

fn play_wav_native(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Err(format!("WAV file does not exist: {}", path_string(path)));
    }
    let size = fs::metadata(path).map_err(|e| e.to_string())?.len();
    if size < 44 {
        return Err(format!("WAV file is invalid or empty: {} bytes", size));
    }

    let file = fs::File::open(path).map_err(|e| format!("Unable to open generated WAV: {e}"))?;
    match rodio::OutputStream::try_default() {
        Ok((_stream, stream_handle)) => {
            let source = rodio::Decoder::new(BufReader::new(file)).map_err(|e| format!("Unable to decode generated WAV: {e}"))?;
            let sink = rodio::Sink::try_new(&stream_handle).map_err(|e| format!("Unable to start audio playback: {e}"))?;
            sink.append(source);
            sink.sleep_until_end();
            Ok(())
        }
        Err(rodio_error) => {
            #[cfg(target_os = "windows")]
            {
                let ffplay = r#"C:\\ffmpeg\\bin\\ffplay.exe"#;
                if Path::new(ffplay).is_file() {
                    let output = Command::new(ffplay)
                        .args(["-nodisp", "-autoexit", "-loglevel", "error", &path_string(path)])
                        .output()
                        .map_err(|e| format!("No working audio output device was found: {rodio_error}. ffplay fallback also failed to start: {e}"))?;
                    if output.status.success() {
                        return Ok(());
                    }
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    return Err(if stderr.is_empty() {
                        format!("No working audio output device was found: {rodio_error}. ffplay fallback failed.")
                    } else {
                        format!("No working audio output device was found: {rodio_error}. ffplay fallback failed: {stderr}")
                    });
                }
            }
            Err(format!("No working audio output device was found: {rodio_error}"))
        }
    }
}

fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Athena window was not found".to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

fn set_window_mode(app: &AppHandle, mode: WindowMode) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut window_mode = state
        .window_mode
        .lock()
        .map_err(|_| "Unable to update window mode.".to_string())?;
    *window_mode = mode;
    Ok(())
}

fn get_window_mode(app: &AppHandle) -> Result<WindowMode, String> {
    let state = app.state::<AppState>();
    let window_mode = state
        .window_mode
        .lock()
        .map_err(|_| "Unable to read window mode.".to_string())?;
    Ok(*window_mode)
}

fn resize_window_centered(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Athena window was not found".to_string())?;
    window
        .set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())
}

fn resize_window_bottom_center(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Athena window was not found".to_string())?;
    window
        .set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|e| e.to_string())?;

    let monitor = window
        .current_monitor()
        .or_else(|_| window.primary_monitor())
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No monitor available for Athena window.".to_string())?;
    let scale = monitor.scale_factor();
    let position = monitor.position();
    let size = monitor.size();
    let monitor_x = position.x as f64 / scale;
    let monitor_y = position.y as f64 / scale;
    let monitor_width = size.width as f64 / scale;
    let monitor_height = size.height as f64 / scale;
    let x = monitor_x + (monitor_width - width) / 2.0;
    let y = monitor_y + monitor_height - height - 22.0;

    window
        .set_position(Position::Logical(LogicalPosition::new(x, y)))
        .map_err(|e| e.to_string())
}

fn show_compact_window(app: &AppHandle) -> Result<(), String> {
    set_window_mode(app, WindowMode::Compact)?;
    resize_window_bottom_center(app, COMPACT_WIDTH, COMPACT_HEIGHT)?;
    show_main_window(app)
}

fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    set_window_mode(app, WindowMode::Settings)?;
    resize_window_centered(app, SETTINGS_WIDTH, SETTINGS_HEIGHT)?;
    show_main_window(app)?;
    app.state::<AppState>()
        .pending_settings_open
        .lock()
        .map(|mut pending| *pending = true)
        .map_err(|_| "Unable to store pending settings state.".to_string())?;
    app.emit("open-settings", ()).map_err(|e| e.to_string())
}

fn open_workspace_window(app: &AppHandle) -> Result<(), String> {
    set_window_mode(app, WindowMode::Settings)?;
    resize_window_centered(app, SETTINGS_WIDTH, SETTINGS_HEIGHT)?;
    show_main_window(app)
}

fn normalize_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") || trimmed.starts_with("ms-settings:") {
        trimmed.to_string()
    } else if trimmed.contains('.') && !trimmed.contains(' ') {
        format!("https://{trimmed}")
    } else {
        format!("https://www.google.com/search?q={}", trimmed.replace(' ', "+"))
    }
}

fn app_alias_command(name: &str) -> Option<&'static str> {
    let normalized = name.to_lowercase();
    let compact = normalized.replace([' ', '-', '_'], "");
    match compact.as_str() {
        "chrome" | "googlechrome" => Some("chrome"),
        "edge" | "microsoftedge" => Some("msedge"),
        "firefox" => Some("firefox"),
        "notepad" | "notes" => Some("notepad"),
        "calculator" | "calc" => Some("calc"),
        "explorer" | "fileexplorer" | "files" => Some("explorer"),
        "cmd" | "commandprompt" | "terminal" => Some("cmd"),
        "powershell" => Some("powershell"),
        "vscode" | "visualstudiocode" | "code" => Some("code"),
        "word" | "microsoftword" => Some("winword"),
        "excel" | "microsoftexcel" => Some("excel"),
        "powerpoint" | "microsoftpowerpoint" => Some("powerpnt"),
        "settings" | "windowssettings" => Some("ms-settings:"),
        _ => None,
    }
}

fn installed_apps() -> Vec<InstalledApp> {
    let mut apps = Vec::new();
    #[cfg(target_os = "windows")]
    {
        let mut roots = Vec::new();
        if let Some(program_data) = std::env::var_os("PROGRAMDATA") {
            roots.push(PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"));
        }
        if let Some(app_data) = std::env::var_os("APPDATA") {
            roots.push(PathBuf::from(app_data).join("Microsoft\\Windows\\Start Menu\\Programs"));
        }
        for root in roots {
            collect_shortcuts(&root, &mut apps, 0);
        }
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    apps
}

fn collect_shortcuts(path: &Path, apps: &mut Vec<InstalledApp>, depth: usize) {
    if depth > 5 || apps.len() > 600 {
        return;
    }
    let items = match fs::read_dir(path) {
        Ok(items) => items,
        Err(_) => return,
    };
    for item in items.flatten() {
        let path = item.path();
        if path.is_dir() {
            collect_shortcuts(&path, apps, depth + 1);
            continue;
        }
        let is_shortcut = path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.eq_ignore_ascii_case("lnk")).unwrap_or(false);
        if !is_shortcut {
            continue;
        }
        let name = path.file_stem().map(|name| name.to_string_lossy().to_string()).unwrap_or_default();
        if !name.is_empty() {
            apps.push(InstalledApp { name, path: path.to_string_lossy().to_string() });
        }
    }
}

fn find_installed_app(query: &str) -> Option<InstalledApp> {
    let needle = query.to_lowercase();
    installed_apps()
        .into_iter()
        .find(|app| app.name.to_lowercase() == needle)
        .or_else(|| installed_apps().into_iter().find(|app| app.name.to_lowercase().contains(&needle)))
}

fn open_external(target: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", target])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(target).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(target).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("Opening external targets is not supported on this OS.".into())
}

fn capture_screen_with_powershell(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let escaped = path.to_string_lossy().replace('"', "`\"");
        let script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$b.Size); $bmp.Save(\"{}\", [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose();",
            escaped
        );
        let output = Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("Screenshot capture is currently implemented for Windows only.".into())
    }
}

fn toggle_compact_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Athena window was not found".to_string())?;
    if window.is_visible().map_err(|e| e.to_string())? {
        window.hide().map_err(|e| e.to_string())
    } else {
        show_compact_window(app)
    }
}

fn install_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Athena", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Open Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Athena", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &quit])?;
    let icon = Image::from_bytes(include_bytes!("../icons/icon.png"))?;

    TrayIconBuilder::with_id("athena-tray")
        .tooltip("Athena")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = show_compact_window(app);
            }
            "settings" => {
                let _ = open_settings_window(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_compact_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn install_global_shortcut(app: &AppHandle) -> tauri::Result<()> {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);
    let app_handle = app.clone();
    app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            let _ = toggle_compact_window(&app_handle);
            let _ = app_handle.emit("shortcut-activated", ());
        }
    }).map_err(|e| tauri::Error::from(std::io::Error::other(e.to_string())))?;

    let settings_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
    let app_handle = app.clone();
    app.global_shortcut().on_shortcut(settings_shortcut, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            let _ = open_settings_window(&app_handle);
        }
    }).map_err(|e| tauri::Error::from(std::io::Error::other(e.to_string())))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            install_tray(app.handle())?;
            install_global_shortcut(app.handle())?;
            if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                let _ = window.hide();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let _ = window.hide();
                    api.prevent_close();
                }
                WindowEvent::Focused(false) => {
                    if let Ok(WindowMode::Settings) = get_window_mode(window.app_handle()) {
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            show_window,
            open_settings,
            open_workspace,
            show_compact,
            frontend_ready,
            hide_window,
            open_url,
            open_windows_settings,
            open_app,
            get_installed_apps,
            open_path,
            reveal_path,
            read_clipboard,
            write_clipboard,
            save_provider_api_key,
            has_provider_api_key,
            test_provider,
            send_message,
            get_device_context,
            get_history,
            append_history_entry,
            delete_history_entry,
            clear_history,
            list_directory,
            read_text_file,
            search_files,
            take_screenshot,
            list_screenshots,
            female_voice_status,
            install_female_voice,
            local_tts_status,
            synthesize_piper,
            play_wav_file,
            speak_piper
        ])
        .run(tauri::generate_context!())
        .expect("error while running Athena");
}
