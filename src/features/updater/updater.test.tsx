import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import SettingsUpdateSection from './settings-update-section'
import SidebarUpdateStatus from './sidebar-update-status'
import {calculateProgress, UpdaterProvider} from './updater-context'
import type {AvailableUpdate, UpdaterService} from './updater-service'

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
    {
        autoCheck = true,
        includeSettings = false,
    }: {
        autoCheck?: boolean
        includeSettings?: boolean
    } = {}
) {
    const root = createRoot(
        document.body.appendChild(document.createElement('div'))
    )
    roots.push(root)
    await act(async () => {
        root.render(
            <UpdaterProvider service={service} autoCheck={autoCheck}>
                <SidebarUpdateStatus />
                {includeSettings && <SettingsUpdateSection />}
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

    it('downloads an automatic update immediately and waits for the user to restart', async () => {
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
        const check = vi.fn(async () => ({
            version: '2.0.0',
            downloadAndInstall,
        }))
        const service: UpdaterService = {
            check,
            getVersion: vi.fn(async () => '1.0.0'),
            relaunch,
        }

        await renderUpdater(service)

        expect(check).toHaveBeenCalledTimes(1)
        expect(downloadAndInstall).toHaveBeenCalledTimes(1)
        expect(document.body.textContent).toContain('v2.0.0 下载中')
        expect(document.body.querySelector('[role="dialog"]')).toBeNull()

        await act(async () => {
            finishDownload?.()
            await settle()
        })
        expect(buttonWithText('重启更新版本')).toBeDefined()
        expect(relaunch).not.toHaveBeenCalled()

        await act(async () => {
            buttonWithText('重启更新版本')?.click()
            await settle()
        })
        expect(relaunch).toHaveBeenCalledTimes(1)
    })

    it('keeps automatic download state in the sidebar and disables settings actions', async () => {
        let finishDownload: (() => void) | undefined
        const downloadAndInstall = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    finishDownload = resolve
                })
        )
        const service: UpdaterService = {
            check: vi.fn(async () => ({
                version: '2.1.0',
                downloadAndInstall,
            })),
            getVersion: vi.fn(async () => '2.0.0'),
            relaunch: vi.fn(async () => undefined),
        }

        await renderUpdater(service, {includeSettings: true})

        expect(document.body.textContent).toContain('v2.1.0 下载中')
        expect(document.body.textContent).toContain('正在自动下载 v2.1.0')
        expect(buttonWithText('正在下载…')?.disabled).toBe(true)
        expect(
            document.body.querySelector('[aria-label="更新下载进度"]')
        ).toBeNull()

        await act(async () => {
            finishDownload?.()
            await settle()
        })
        expect(buttonWithText('已下载')?.disabled).toBe(true)
        expect(document.body.textContent).toContain(
            '更新已下载，请在侧栏重启'
        )
    })

    it('offers automatic download retry only in the sidebar', async () => {
        const downloadAndInstall = vi
            .fn<AvailableUpdate['downloadAndInstall']>()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(undefined)
        const service: UpdaterService = {
            check: vi.fn(async () => ({
                version: '2.2.0',
                downloadAndInstall,
            })),
            getVersion: vi.fn(async () => '2.0.0'),
            relaunch: vi.fn(async () => undefined),
        }

        await renderUpdater(service, {includeSettings: true})

        expect(buttonWithText('v2.2.0 更新失败 · 重试')).toBeDefined()
        expect(buttonWithText('更新失败')?.disabled).toBe(true)
        expect(document.body.textContent).toContain(
            '自动更新失败，请在侧栏重试'
        )

        await act(async () => {
            buttonWithText('v2.2.0 更新失败 · 重试')?.click()
            await settle()
        })
        expect(downloadAndInstall).toHaveBeenCalledTimes(2)
        expect(buttonWithText('重启更新版本')).toBeDefined()
    })

    it('keeps automatic check failures silent and allows a manual retry', async () => {
        const check = vi
            .fn<UpdaterService['check']>()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(null)
        const service: UpdaterService = {
            check,
            getVersion: vi.fn(async () => '1.0.0'),
            relaunch: vi.fn(async () => undefined),
        }

        await renderUpdater(service, {includeSettings: true})

        expect(document.querySelector('.sidebar-update-status')).toBeNull()
        expect(document.body.textContent).not.toContain(
            '你仍可以继续使用当前版本'
        )
        expect(buttonWithText('检查更新')?.disabled).toBe(false)

        await act(async () => {
            buttonWithText('检查更新')?.click()
            await settle()
        })
        expect(check).toHaveBeenCalledTimes(2)
        expect(document.body.textContent).toContain('已是最新版本')
    })

    it('keeps an automatic no-update result out of the sidebar', async () => {
        const check = vi.fn(async () => null)
        const service: UpdaterService = {
            check,
            getVersion: vi.fn(async () => '1.2.3'),
            relaunch: vi.fn(async () => undefined),
        }

        await renderUpdater(service, {includeSettings: true})

        expect(check).toHaveBeenCalledTimes(1)
        expect(document.body.textContent).toContain('已是最新版本')
        expect(document.querySelector('.sidebar-update-status')).toBeNull()
    })

    it('shows a manual no-update result only in settings', async () => {
        const service: UpdaterService = {
            check: vi.fn(async () => null),
            getVersion: vi.fn(async () => '1.2.3'),
            relaunch: vi.fn(async () => undefined),
        }

        await renderUpdater(service, {
            autoCheck: false,
            includeSettings: true,
        })

        await act(async () => {
            buttonWithText('检查更新')?.click()
            await settle()
        })
        expect(document.body.textContent).toContain('已是最新版本')
        expect(document.querySelector('.sidebar-update-status')).toBeNull()
    })

    it('keeps manual download progress and restart controls in settings', async () => {
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

        await renderUpdater(service, {
            autoCheck: false,
            includeSettings: true,
        })
        await act(async () => {
            buttonWithText('检查更新')?.click()
            await settle()
        })
        expect(document.body.textContent).toContain('发现新版本 3.0.0')
        expect(document.querySelector('.sidebar-update-status')).toBeNull()

        await act(async () => {
            buttonWithText('更新')?.click()
            await settle()
        })
        expect(document.body.textContent).toContain('正在下载…')
        expect(
            document.body.querySelector('[aria-label="更新下载进度"]')
        ).not.toBeNull()
        expect(document.querySelector('.sidebar-update-status')).toBeNull()

        await act(async () => {
            finishDownload?.()
            await settle()
        })
        expect(buttonWithText('重启应用')).toBeDefined()
    })
})
