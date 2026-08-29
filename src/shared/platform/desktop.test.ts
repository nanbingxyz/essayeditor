import {invoke} from '@tauri-apps/api/core'
import {getCurrentWindow} from '@tauri-apps/api/window'
import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(async () => undefined),
}))

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-shell', () => ({
    open: vi.fn(async () => undefined),
}))

import {tauriDesktopAdapter} from './desktop'

describe('tauriDesktopAdapter', () => {
    const setTheme = vi.fn(async () => undefined)

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getCurrentWindow).mockReturnValue({
            setTheme,
        } as unknown as ReturnType<typeof getCurrentWindow>)
    })

    it('synchronizes manual themes with the native material', async () => {
        await tauriDesktopAdapter.setWindowAppearance('dark')

        expect(invoke).toHaveBeenCalledWith(
            'set_macos_window_appearance',
            {appearance: 'dark'}
        )
        expect(setTheme).toHaveBeenCalledWith('dark')
        expect(vi.mocked(invoke).mock.invocationCallOrder[0]).toBeLessThan(
            setTheme.mock.invocationCallOrder[0]
        )
    })

    it('clears the native override when following the system', async () => {
        await tauriDesktopAdapter.setWindowAppearance('system')

        expect(invoke).toHaveBeenCalledWith(
            'set_macos_window_appearance',
            {appearance: 'system'}
        )
        expect(setTheme).toHaveBeenCalledWith(null)
    })

    it('exports Markdown with the requested default file name', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(true)

        const exported = await tauriDesktopAdapter.exportMarkdown(
            '# Essay',
            'essay_42.md'
        )

        expect(exported).toBe(true)
        expect(invoke).toHaveBeenCalledWith('export_markdown', {
            content: '# Essay',
            defaultFileName: 'essay_42.md',
        })
    })
})
