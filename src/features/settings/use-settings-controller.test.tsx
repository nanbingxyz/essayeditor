import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {DesktopAdapter} from '@/shared/platform/desktop'

import type {SettingsRepository} from './settings-repository'
import type {SettingsSnapshot} from './model'
import {useSettingsController} from './use-settings-controller'

type SettingsController = ReturnType<typeof useSettingsController>

const roots: Root[] = []

function renderController(
    repository: SettingsRepository,
    desktop: DesktopAdapter
) {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    let controller: SettingsController | undefined
    const onAppearanceSaveError = vi.fn()
    const onLoadError = vi.fn()

    function Harness() {
        controller = useSettingsController({
            desktop,
            repository,
            onAppearanceSaveError,
            onLoadError,
        })
        return null
    }

    act(() => root.render(<Harness />))
    return {
        getController: () => {
            if (!controller) {
                throw new Error('Controller has not rendered')
            }
            return controller
        },
        onAppearanceSaveError,
        onLoadError,
    }
}

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
    delete document.documentElement.dataset.theme
    vi.useRealTimers()
})

describe('useSettingsController', () => {
    it('loads settings and serializes the latest API key save', async () => {
        const repository: SettingsRepository = {
            load: vi.fn(
                async (): Promise<SettingsSnapshot> => ({
                    accessToken: 'stored',
                    appearance: 'dark',
                })
            ),
            saveAccessToken: vi.fn(async () => undefined),
            saveAppearance: vi.fn(async () => undefined),
        }
        const desktop: DesktopAdapter = {
            exportMarkdown: vi.fn(async () => false),
            exportPdf: vi.fn(async () => false),
            interceptClose: vi.fn(async () => () => undefined),
            openExternal: vi.fn(async () => undefined),
            setWindowAppearance: vi.fn(async () => undefined),
            showMainWindow: vi.fn(async () => undefined),
        }
        const {getController} = renderController(repository, desktop)

        await act(async () => Promise.resolve())
        expect(getController().accessToken).toBe('stored')
        expect(document.documentElement.dataset.theme).toBe('dark')

        act(() => {
            getController().scheduleApiKeySave(' first ')
            getController().scheduleApiKeySave(' latest ')
            vi.advanceTimersByTime(400)
        })
        await act(async () => {
            await getController().flushApiKeySave()
            await Promise.resolve()
        })

        expect(repository.saveAccessToken).toHaveBeenCalledTimes(1)
        expect(repository.saveAccessToken).toHaveBeenCalledWith('latest')
        expect(getController().accessToken).toBe('latest')
        expect(getController().saveStatus).toBe('saved')
    })

    it('keeps the selected appearance when persistence fails', async () => {
        const repository: SettingsRepository = {
            load: vi.fn(
                async (): Promise<SettingsSnapshot> => ({
                    accessToken: '',
                    appearance: 'system',
                })
            ),
            saveAccessToken: vi.fn(async () => undefined),
            saveAppearance: vi.fn(async () => {
                throw new Error('disk full')
            }),
        }
        const desktop: DesktopAdapter = {
            exportMarkdown: vi.fn(async () => false),
            exportPdf: vi.fn(async () => false),
            interceptClose: vi.fn(async () => () => undefined),
            openExternal: vi.fn(async () => undefined),
            setWindowAppearance: vi.fn(async () => undefined),
            showMainWindow: vi.fn(async () => undefined),
        }
        const {getController, onAppearanceSaveError} = renderController(
            repository,
            desktop
        )
        await act(async () => Promise.resolve())

        await act(async () => {
            getController().changeAppearance('dark')
            await Promise.resolve()
        })

        expect(getController().appearance).toBe('dark')
        expect(document.documentElement.dataset.theme).toBe('dark')
        expect(onAppearanceSaveError).toHaveBeenCalled()
    })
})
