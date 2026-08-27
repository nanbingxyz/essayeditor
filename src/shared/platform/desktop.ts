import {getCurrentWindow} from '@tauri-apps/api/window'
import {open} from '@tauri-apps/plugin-shell'

export type WindowAppearance = 'light' | 'dark' | 'system'

export interface DesktopAdapter {
    openExternal: (url: string) => Promise<void>
    setWindowAppearance: (appearance: WindowAppearance) => Promise<void>
    showMainWindow: () => Promise<void>
}

export const tauriDesktopAdapter: DesktopAdapter = {
    openExternal: open,
    setWindowAppearance: async (appearance) => {
        await getCurrentWindow().setTheme(
            appearance === 'system' ? null : appearance
        )
    },
    showMainWindow: async () => {
        await getCurrentWindow().show()
    },
}
