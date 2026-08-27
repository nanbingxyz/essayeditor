import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {UpdaterService} from './updater-service'
import Updater, {calculateProgress} from './updater'

vi.mock('@tauri-apps/plugin-log', () => ({
    info: vi.fn(async () => undefined),
}))

const roots: Root[] = []

async function renderUpdater(service: UpdaterService) {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    await act(async () => {
        root.render(<Updater service={service} />)
        await Promise.resolve()
    })
}

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
})

describe('Updater', () => {
    it('calculates bounded percentages and handles unknown totals', () => {
        expect(calculateProgress(50, 100)).toBe(50)
        expect(calculateProgress(120, 100)).toBe(100)
        expect(calculateProgress(10, 0)).toBeUndefined()
    })

    it('shows the detected version and reports download progress as percent', async () => {
        const relaunch = vi.fn(async () => undefined)
        const downloadAndInstall = vi.fn(async (onEvent) => {
            onEvent?.({
                event: 'Started',
                data: {contentLength: 100},
            })
            onEvent?.({
                event: 'Progress',
                data: {chunkLength: 50},
            })
        })
        const service: UpdaterService = {
            check: vi.fn(async () => ({
                version: '2.0.0',
                downloadAndInstall,
            })),
            relaunch,
        }

        await renderUpdater(service)
        expect(document.body.textContent).toContain('发现新版本 2.0.0')

        const downloadButton = Array.from(
            document.body.querySelectorAll('button')
        ).find((button) => button.textContent === '下载更新')
        expect(downloadButton).toBeDefined()
        await act(async () => {
            downloadButton?.click()
            await Promise.resolve()
        })
        expect(downloadAndInstall).toHaveBeenCalled()
        expect(relaunch).toHaveBeenCalled()
    })
})
