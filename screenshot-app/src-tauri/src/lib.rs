use chrono::Utc;
use dirs::picture_dir;
use screenshots::Screen;
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

#[derive(Default)]
struct AppState {
    is_window_active: Mutex<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureResult {
    mode: String,
    message: String,
    saved_path: String,
    timestamp: String,
}

fn ensure_active(state: &tauri::State<AppState>) -> Result<(), String> {
    let is_active = *state
        .is_window_active
        .lock()
        .map_err(|_| "Failed to read app focus state.".to_string())?;

    if is_active {
        Ok(())
    } else {
        Err("Capture blocked: app window is not active.".to_string())
    }
}

fn capture_output_dir() -> Result<PathBuf, String> {
    let root = picture_dir().or_else(|| std::env::current_dir().ok());
    let base = root.ok_or_else(|| "Failed to resolve output directory.".to_string())?;
    let output_dir = base.join("SShot").join("captures");

    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("Failed to create capture directory: {error}"))?;

    Ok(output_dir)
}

fn capture_file_path(mode: &str, output_dir: &Path, timestamp: &str) -> PathBuf {
    let file_tag = timestamp.replace(':', "-");
    output_dir.join(format!("{}_{}.png", mode, file_tag))
}

fn build_result(mode: &str, saved_path: &Path, message: &str, timestamp: &str) -> CaptureResult {
    CaptureResult {
        mode: mode.to_string(),
        message: message.to_string(),
        saved_path: saved_path.to_string_lossy().to_string(),
        timestamp: timestamp.to_string(),
    }
}

fn primary_screen() -> Result<Screen, String> {
    let screens = Screen::all().map_err(|error| format!("Unable to detect screens: {error}"))?;
    screens
        .into_iter()
        .next()
        .ok_or_else(|| "No display detected for screenshot capture.".to_string())
}

fn capture_fullscreen_impl() -> Result<CaptureResult, String> {
    let timestamp = Utc::now().to_rfc3339();
    let output_dir = capture_output_dir()?;
    let saved_path = capture_file_path("fullscreen", &output_dir, &timestamp);

    let screen = primary_screen()?;
    let image = screen
        .capture()
        .map_err(|error| format!("Fullscreen capture failed: {error}"))?;

    image
        .save(&saved_path)
        .map_err(|error| format!("Unable to save image: {error}"))?;

    Ok(build_result(
        "fullscreen",
        &saved_path,
        "Fullscreen capture completed.",
        &timestamp,
    ))
}

fn capture_area_impl() -> Result<CaptureResult, String> {
    let timestamp = Utc::now().to_rfc3339();
    let output_dir = capture_output_dir()?;
    let saved_path = capture_file_path("area", &output_dir, &timestamp);

    let screen = primary_screen()?;
    let bounds = screen.display_info;

    // Until region-select overlay is wired, capture the center 60% of the primary display.
    let area_width = (bounds.width as f32 * 0.6).round() as u32;
    let area_height = (bounds.height as f32 * 0.6).round() as u32;
    let left = bounds.x + ((bounds.width as i32 - area_width as i32) / 2);
    let top = bounds.y + ((bounds.height as i32 - area_height as i32) / 2);

    let image = screen
        .capture_area(left, top, area_width, area_height)
        .map_err(|error| format!("Area capture failed: {error}"))?;

    image
        .save(&saved_path)
        .map_err(|error| format!("Unable to save image: {error}"))?;

    Ok(build_result(
        "area",
        &saved_path,
        "Area capture completed (center region placeholder until region-select UI is added).",
        &timestamp,
    ))
}

fn capture_window_impl() -> Result<CaptureResult, String> {
    let timestamp = Utc::now().to_rfc3339();
    let output_dir = capture_output_dir()?;
    let saved_path = capture_file_path("window", &output_dir, &timestamp);

    // Current fallback: capture primary screen while active-window locator is being integrated.
    let screen = primary_screen()?;
    let image = screen
        .capture()
        .map_err(|error| format!("Window capture failed: {error}"))?;

    image
        .save(&saved_path)
        .map_err(|error| format!("Unable to save image: {error}"))?;

    Ok(build_result(
        "window",
        &saved_path,
        "Window capture is temporarily using full-screen fallback until active-window targeting is integrated.",
        &timestamp,
    ))
}

#[tauri::command]
fn set_window_active(state: tauri::State<AppState>, active: bool) -> Result<(), String> {
    let mut current = state
        .is_window_active
        .lock()
        .map_err(|_| "Failed to read app focus state.".to_string())?;
    *current = active;
    Ok(())
}

#[tauri::command]
fn capture_area(state: tauri::State<AppState>) -> Result<CaptureResult, String> {
    ensure_active(&state)?;
    capture_area_impl()
}

#[tauri::command]
fn capture_fullscreen(state: tauri::State<AppState>) -> Result<CaptureResult, String> {
    ensure_active(&state)?;
    capture_fullscreen_impl()
}

#[tauri::command]
fn capture_window(state: tauri::State<AppState>) -> Result<CaptureResult, String> {
    ensure_active(&state)?;
    capture_window_impl()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            set_window_active,
            capture_area,
            capture_fullscreen,
            capture_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
