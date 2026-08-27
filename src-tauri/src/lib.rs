// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command

#[tauri::command]
fn set_macos_window_appearance(
    window: tauri::WebviewWindow,
    appearance: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{
            NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua,
            NSAppearanceNameDarkAqua, NSWindow,
        };
        use window_vibrancy::{
            apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
        };

        let appearance = match appearance.as_str() {
            "light" => Some(false),
            "dark" => Some(true),
            "system" => None,
            _ => return Err(format!("unsupported appearance: {appearance}")),
        };
        let ns_window = window.ns_window().map_err(|error| error.to_string())? as usize;
        let window_with_effect = window.clone();

        window
            .run_on_main_thread(move || unsafe {
                let native_appearance = appearance.and_then(|dark| {
                    NSAppearance::appearanceNamed(if dark {
                        NSAppearanceNameDarkAqua
                    } else {
                        NSAppearanceNameAqua
                    })
                });
                let native_appearance = native_appearance.as_deref();
                let native_window = &*(ns_window as *const NSWindow);

                native_window.setAppearance(native_appearance);

                if let Err(error) = clear_vibrancy(&window_with_effect) {
                    eprintln!("failed to clear macOS sidebar material: {error}");
                }
                if let Err(error) = apply_vibrancy(
                    &window_with_effect,
                    NSVisualEffectMaterial::Sidebar,
                    Some(NSVisualEffectState::FollowsWindowActiveState),
                    None,
                ) {
                    eprintln!("failed to apply macOS sidebar material: {error}");
                }
            })
            .map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (window, appearance);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![set_macos_window_appearance])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
