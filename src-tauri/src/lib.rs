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

#[tauri::command]
async fn export_markdown(
    app: tauri::AppHandle,
    content: String,
    default_file_name: String,
) -> Result<bool, String> {
    save_export_file(
        &app,
        content.into_bytes(),
        default_file_name,
        "导出 Markdown 文件",
        "Markdown",
        "md",
    )
}

#[tauri::command]
async fn export_pdf(
    app: tauri::AppHandle,
    content: Vec<u8>,
    default_file_name: String,
) -> Result<bool, String> {
    save_export_file(
        &app,
        content,
        default_file_name,
        "导出 PDF 文件",
        "PDF",
        "pdf",
    )
}

#[tauri::command]
async fn export_docx(
    app: tauri::AppHandle,
    content: Vec<u8>,
    default_file_name: String,
) -> Result<bool, String> {
    save_export_file(
        &app,
        content,
        default_file_name,
        "导出 DOCX 文件",
        "Word 文档",
        "docx",
    )
}

fn save_export_file(
    app: &tauri::AppHandle,
    content: Vec<u8>,
    default_file_name: String,
    title: &str,
    filter_name: &str,
    extension: &str,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let Some(file_path) = app
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(default_file_name)
        .add_filter(filter_name, &[extension])
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    std::fs::write(path, content).map_err(|error| error.to_string())?;

    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            export_markdown,
            export_pdf,
            export_docx,
            set_macos_window_appearance
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
