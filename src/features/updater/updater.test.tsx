import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import SettingsUpdateSection from './settings-update-section'
import {
    calculateProgress,
    UpdaterProvider,
} from './updater-context'
import type {AvailableUpdate, UpdaterService} from './updater-service'
import Updater from './updater'

vi.mock('@tauri-apps/plugin-log', () => ({
    info: vi.fn(async () => undefined),
}))

const roots: Root[] = []

function buttonWithText(text: string) {
    return Array.from(document.body.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === text
    ) as HTMLButtonElement | undefined
}

async function settle(iterations = 4) {
    for (let index = 0; index < iterations; index += 1) {
        await Promise.resolve()
    }
}

async function renderUpdater(
    service: UpdaterService,
    autoCheck = true,
    includeSettings = false
) {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    await act(async () => {
        root.render(
            <UpdaterProvider service={service} autoCheck={autoCheck}>
                {includeSettings && <SettingsUpdateSection />}
                <Updater />
            </UpdaterProvider>
        )
        await settle()
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

    it('keeps automatic update checks in the dialog and waits to restart', async () => {
        let finishDownload: (() => void) | undefined
        const relaunch = vi.fn(async () => undefined)
        const downloadAndInstall = vi.fn(
            (onEvent: Parameters<AvailableUpdate['downloadAndInstall']>[0]) =>
                new Promise<void>((resolve) => {
                    onEvent?.({
                        event: 'Started',
                        data: {contentLength: 100},
                    })
                    onEvent?.({
                        event: 'Progress',
                        data: {chunkLength: 50},
                    })
                    finishDownload = resolve
                })
        )
        const service: UpdaterService = {
            check: vi.fn(async () => ({
                version: '2.0.0',
                downloadAndInstall,
            })),
            getVersion: vi.fn(async () => '1.0.0'),
            relaunch,
        }

        await renderUpdater(service)
        expect(document.body.textContent).toContain('发现新版本 2.0.0')

        await act(async () => {
            buttonWithText('下载更新')?.click()
            await settle()
        })
        expect(document.body.textContent).toContain('50%')
        expect(relaunch).not.toHaveBeenCalled()

        await act(async () => {
            finishDownload?.()
            await settle()
        })
        expect(document.body.textContent).toContain('更新已安装')
        expect(relaunch).not.toHaveBeenCalled()

        await act(async () => {
            buttonWithText('重启应用')?.click()
            await settle()
        })
        expect(relaunch).toHaveBeenCalledTimes(1)
    })

    it('shows a manual no-update result inline without opening a dialog', async () => {
        const service: UpdaterService = {
            check: vi.fn(async () => null),
            getVersion: vi.fn(async () => '1.2.3'),
            relaunch: vi.fn(async () => undefined),
        }

        await renderUpdater(service, false, true)
        expect(document.body.textContent).toContain('当前版本 1.2.3')

        await act(async () => {
            buttonWithText('检查更新')?.click()
            await settle()
        })
        expect(document.body.textContent).toContain('已是最新版本')
        expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    })

    it('shows indeterminate manual download progress without opening a dialog', async () => {
        let finishDownload: (() => void) | undefined
        const downloadAndInstall = vi.fn(
            (onEvent: Parameters<AvailableUpdate['downloadAndInstall']>[0]) =>
                new Promise<void>((resolve) => {
                    onEvent?.({event: 'Started', data: {}})
                    onEvent?.({
                        event: 'Progress',
                        data: {chunkLength: 25},
                    })
                    finishDownload = resolve
                })
        )
        const service: UpdaterService = {
            check: vi.fn(async () => ({
                version: '3.0.0',
                downloadAndInstall,
            })),
            getVersion: vi.fn(async () => '2.0.0'),
            relaunch: vi.fn(async () => undefined),
        }

        await renderUpdater(service, false, true)
        await act(async () => {
            buttonWithText('检查更新')?.click()
            await settle()
        })
        expect(document.body.textContent).toContain('发现新版本 3.0.0')
        expect(document.body.querySelector('[role="dialog"]')).toBeNull()

        await act(async () => {
            buttonWithText('更新')?.click()
            await settle()
        })
        expect(document.body.textContent).toContain('正在下载…')
        const progress = document.body.querySelector(
            '[aria-label="更新下载进度"]'
        )
        expect(progress?.hasAttribute('aria-valuenow')).toBe(false)

        await act(async () => {
            finishDownload?.()
            await settle()
        })
        expect(buttonWithText('重启应用')).toBeDefined()
    })

    it('shows check and download failures inline and allows retrying', async () => {
        const check = vi
            .fn<UpdaterService['check']>()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({
                version: '2.0.0',
                downloadAndInstall: vi
                    .fn()
                    .mockRejectedValue(new Error('download failed')),
            })
        const service: UpdaterService = {
            check,
            getVersion: vi.fn(async () => '1.0.0'),
            relaunch: vi.fn(async () => undefined),
        }

        await renderUpdater(service, false, true)
        await act(async () => {
            buttonWithText('检查更新')?.click()
            await settle()
        })
        expect(document.body.textContent).toContain('无法检查更新')

        await act(async () => {
            buttonWithText('检查更新')?.click()
            await settle()
        })
        await act(async () => {
            buttonWithText('更新')?.click()
            await settle()
        })
        expect(document.body.textContent).toContain('更新失败')
        expect(buttonWithText('重试更新')).toBeDefined()
    })
})
