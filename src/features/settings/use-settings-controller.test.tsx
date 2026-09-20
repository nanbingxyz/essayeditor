import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {DesktopAdapter} from '@/shared/platform/desktop'
import type {OpenAiCompatibleClient} from '@/features/analysis'

import type {SettingsRepository} from './settings-repository'
import type {SettingsSnapshot} from './model'
import {useSettingsController} from './use-settings-controller'

type SettingsController = ReturnType<typeof useSettingsController>

const roots: Root[] = []

function renderController(
    repository: SettingsRepository,
    desktop: DesktopAdapter,
    llmClient?: OpenAiCompatibleClient
) {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    let controller: SettingsController | undefined
    const onAppearanceSaveError = vi.fn()
    const onLoadError = vi.fn()

    function Harness() {
        controller = useSettingsController({
            desktop,
            llmClient,
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
                    llm: {
                        apiKey: '',
                        baseUrl: '',
                        model: '',
                        reasoningEnabled: true,
                        verified: false,
                    },
                })
            ),
            saveAccessToken: vi.fn(async () => undefined),
            saveAppearance: vi.fn(async () => undefined),
            saveLlmSettings: vi.fn(async () => undefined),
        }
        const desktop: DesktopAdapter = {
            exportMarkdown: vi.fn(async () => false),
            exportDocx: vi.fn(async () => false),
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
                    llm: {
                        apiKey: '',
                        baseUrl: '',
                        model: '',
                        reasoningEnabled: true,
                        verified: false,
                    },
                })
            ),
            saveAccessToken: vi.fn(async () => undefined),
            saveAppearance: vi.fn(async () => {
                throw new Error('disk full')
            }),
            saveLlmSettings: vi.fn(async () => undefined),
        }
        const desktop: DesktopAdapter = {
            exportMarkdown: vi.fn(async () => false),
            exportDocx: vi.fn(async () => false),
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

    it('discovers models, verifies the selected model, and invalidates changed configuration', async () => {
        const repository: SettingsRepository = {
            load: vi.fn(
                async (): Promise<SettingsSnapshot> => ({
                    accessToken: '',
                    appearance: 'system',
                    llm: {
                        apiKey: '',
                        baseUrl: '',
                        model: '',
                        reasoningEnabled: true,
                        verified: false,
                    },
                })
            ),
            saveAccessToken: vi.fn(async () => undefined),
            saveAppearance: vi.fn(async () => undefined),
            saveLlmSettings: vi.fn(async () => undefined),
        }
        const desktop: DesktopAdapter = {
            exportMarkdown: vi.fn(async () => false),
            exportDocx: vi.fn(async () => false),
            exportPdf: vi.fn(async () => false),
            interceptClose: vi.fn(async () => () => undefined),
            openExternal: vi.fn(async () => undefined),
            setWindowAppearance: vi.fn(async () => undefined),
            showMainWindow: vi.fn(async () => undefined),
        }
        const llmClient: OpenAiCompatibleClient = {
            complete: vi.fn(async () => ''),
            listModels: vi.fn(async () => ['model-a', 'model-b']),
            testConnection: vi.fn(async () => undefined),
        }
        const {getController} = renderController(
            repository,
            desktop,
            llmClient
        )
        await act(async () => Promise.resolve())

        act(() => {
            getController().changeLlmBaseUrl('https://example.com/v1')
            getController().changeLlmApiKey('secret')
        })
        await act(async () => {
            await getController().discoverModels()
        })
        expect(getController().models).toEqual(['model-a', 'model-b'])
        expect(getController().llmSettings.model).toBe('model-a')

        await act(async () => {
            await getController().testLlmConnection()
        })
        expect(getController().llmSettings.verified).toBe(true)
        expect(getController().testStatus).toBe('success')
        expect(llmClient.testConnection).toHaveBeenCalledWith(
            expect.objectContaining({
                extra_body: {
                    reasoning_effort: 'medium',
                    thinking: {type: 'enabled'},
                },
            }),
            expect.anything()
        )

        act(() => getController().changeLlmReasoningEnabled(false))
        expect(getController().llmSettings.reasoningEnabled).toBe(false)
        expect(getController().llmSettings.verified).toBe(true)
        await act(async () => Promise.resolve())
        expect(repository.saveLlmSettings).toHaveBeenCalledWith(
            expect.objectContaining({reasoningEnabled: false, verified: true})
        )

        act(() => getController().changeLlmModel('model-b'))
        expect(getController().llmSettings.verified).toBe(false)
        expect(getController().testStatus).toBe('idle')
    })
})
