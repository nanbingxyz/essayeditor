import {invoke} from '@tauri-apps/api/core'
import {getCurrentWindow} from '@tauri-apps/api/window'
import {open} from '@tauri-apps/plugin-shell'

export type WindowAppearance = 'light' | 'dark' | 'system'

export interface DesktopAdapter {
    exportMarkdown: (
        content: string,
        defaultFileName: string
    ) => Promise<boolean>
    exportPdf: (
        content: Uint8Array,
        defaultFileName: string
    ) => Promise<boolean>
    openExternal: (url: string) => Promise<void>
    interceptClose: (
        flushBeforeClose: () => Promise<boolean>
    ) => Promise<() => void>
    setWindowAppearance: (appearance: WindowAppearance) => Promise<void>
    showMainWindow: () => Promise<void>
}

export const tauriDesktopAdapter: DesktopAdapter = {
    exportMarkdown: (content, defaultFileName) =>
        invoke<boolean>('export_markdown', {content, defaultFileName}),
    exportPdf: (content, defaultFileName) =>
        invoke<boolean>('export_pdf', {
            content: Array.from(content),
            defaultFileName,
        }),
    openExternal: open,
    interceptClose: async (flushBeforeClose) => {
        const window = getCurrentWindow()
        let closing = false
        return window.onCloseRequested(async (event) => {
            event.preventDefault()
            if (closing) {
                return
            }
            closing = true
            const saved = await flushBeforeClose().catch(() => false)
            if (!saved) {
                closing = false
                return
            }
            try {
                await window.destroy()
            } catch (error) {
                closing = false
                throw error
            }
        })
    },
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
