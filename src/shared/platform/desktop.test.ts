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

    it('exports PDF bytes with the requested default file name', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(true)

        const exported = await tauriDesktopAdapter.exportPdf(
            new Uint8Array([37, 80, 68, 70]),
            'essay_42.pdf'
        )

        expect(exported).toBe(true)
        expect(invoke).toHaveBeenCalledWith('export_pdf', {
            content: [37, 80, 68, 70],
            defaultFileName: 'essay_42.pdf',
        })
    })

    it('exports DOCX bytes with the requested default file name', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(true)

        const exported = await tauriDesktopAdapter.exportDocx(
            new Uint8Array([80, 75, 3, 4]),
            'essay_42.docx'
        )

        expect(exported).toBe(true)
        expect(invoke).toHaveBeenCalledWith('export_docx', {
            content: [80, 75, 3, 4],
            defaultFileName: 'essay_42.docx',
        })
    })

    it('waits for pending drafts before destroying the window', async () => {
        let closeHandler:
            | ((event: {preventDefault: () => void}) => Promise<void>)
            | undefined
        let finishFlush: ((saved: boolean) => void) | undefined
        const destroy = vi.fn(async () => undefined)
        const unlisten = vi.fn()
        const onCloseRequested = vi.fn(async (handler) => {
            closeHandler = handler
            return unlisten
        })
        vi.mocked(getCurrentWindow).mockReturnValue({
            destroy,
            onCloseRequested,
        } as unknown as ReturnType<typeof getCurrentWindow>)
        const flush = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    finishFlush = resolve
                })
        )
        const stopIntercepting = await tauriDesktopAdapter.interceptClose(flush)
        const preventDefault = vi.fn()

        const closeTask = closeHandler?.({preventDefault})
        await Promise.resolve()
        expect(preventDefault).toHaveBeenCalledOnce()
        expect(destroy).not.toHaveBeenCalled()

        finishFlush?.(true)
        await closeTask
        expect(destroy).toHaveBeenCalledOnce()
        stopIntercepting()
        expect(unlisten).toHaveBeenCalledOnce()
    })

    it('keeps the window open when draft persistence fails', async () => {
        let closeHandler:
            | ((event: {preventDefault: () => void}) => Promise<void>)
            | undefined
        const destroy = vi.fn(async () => undefined)
        vi.mocked(getCurrentWindow).mockReturnValue({
            destroy,
            onCloseRequested: vi.fn(async (handler) => {
                closeHandler = handler
                return () => undefined
            }),
        } as unknown as ReturnType<typeof getCurrentWindow>)
        await tauriDesktopAdapter.interceptClose(async () => false)

        await closeHandler?.({preventDefault: vi.fn()})
        expect(destroy).not.toHaveBeenCalled()
    })
})
