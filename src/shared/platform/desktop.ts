import {invoke} from '@tauri-apps/api/core'
import {getCurrentWindow} from '@tauri-apps/api/window'
import {open} from '@tauri-apps/plugin-shell'

export type WindowAppearance = 'light' | 'dark' | 'system'

export interface DesktopAdapter {
    exportMarkdown: (
        content: string,
        defaultFileName: string
    ) => Promise<boolean>
    openExternal: (url: string) => Promise<void>
    setWindowAppearance: (appearance: WindowAppearance) => Promise<void>
    showMainWindow: () => Promise<void>
}

export const tauriDesktopAdapter: DesktopAdapter = {
    exportMarkdown: (content, defaultFileName) =>
        invoke<boolean>('export_markdown', {content, defaultFileName}),
    openExternal: open,
    setWindowAppearance: async (appearance) => {
        await invoke('set_macos_window_appearance', {appearance})
        await getCurrentWindow().setTheme(
            appearance === 'system' ? null : appearance
        )
    },
    showMainWindow: async () => {
        await getCurrentWindow().show()
    },
}
