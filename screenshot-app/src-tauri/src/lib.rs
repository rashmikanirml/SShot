use serde::Serialize;
use std::sync::{Mutex, MutexGuard};

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

fn lock_active_flag(state: &tauri::State<AppState>) -> Result<MutexGuard<'_, bool>, String> {
    state
        .is_window_active
        .lock()
        .map_err(|_| "Failed to read app focus state.".to_string())
}

fn ensure_active(state: &tauri::State<AppState>) -> Result<(), String> {
    let is_active = *lock_active_flag(state)?;

    if is_active {
        Ok(())
    } else {
        Err("Capture blocked: app window is not active.".to_string())
    }
}

fn build_stub_result(mode: &str) -> CaptureResult {
    let timestamp = chrono::Utc::now().to_rfc3339();
    let file_tag = timestamp.replace(':', "-");

    CaptureResult {
        mode: mode.to_string(),
        message: format!(
            "{} capture pipeline started. Native capture engine will be connected in next slice.",
            mode
        ),
        saved_path: format!("captures/{}_{}.png", mode, file_tag),
        timestamp,
    }
}

#[tauri::command]
fn set_window_active(state: tauri::State<AppState>, active: bool) -> Result<(), String> {
    let mut current = lock_active_flag(&state)?;
    *current = active;
    Ok(())
}

#[tauri::command]
fn capture_area(state: tauri::State<AppState>) -> Result<CaptureResult, String> {
    ensure_active(&state)?;
    Ok(build_stub_result("area"))
}

#[tauri::command]
fn capture_fullscreen(state: tauri::State<AppState>) -> Result<CaptureResult, String> {
    ensure_active(&state)?;
    Ok(build_stub_result("fullscreen"))
}

#[tauri::command]
fn capture_window(state: tauri::State<AppState>) -> Result<CaptureResult, String> {
    ensure_active(&state)?;
    Ok(build_stub_result("window"))
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
