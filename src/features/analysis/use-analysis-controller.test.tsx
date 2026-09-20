import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {LlmSettings} from '@/features/settings'

import type {AnalysisRepository} from './analysis-repository'
import type {OpenAiCompatibleClient} from './openai-client'
import {useAnalysisController} from './use-analysis-controller'

const roots: Root[] = []

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

function renderController({
    client,
    llmSettings,
    repository,
}: {
    client: OpenAiCompatibleClient
    llmSettings: LlmSettings
    repository: AnalysisRepository
}) {
    const root = createRoot(
        document.body.appendChild(document.createElement('div'))
    )
    roots.push(root)
    let controller: ReturnType<typeof useAnalysisController> | undefined

    function Harness() {
        controller = useAnalysisController({
            client,
            content: '安祥离世',
            documentKey: 'local:first',
            enabled: true,
            llmSettings,
            onError: vi.fn(),
            onSaveError: vi.fn(),
            repository,
        })
        return null
    }

    act(() => root.render(<Harness />))
    return () => {
        if (!controller) {
            throw new Error('Controller has not rendered')
        }
        return controller
    }
}

function createRepository(): AnalysisRepository {
    return {
        clear: vi.fn(async () => undefined),
        load: vi.fn(async () => null),
        move: vi.fn(async () => undefined),
        save: vi.fn(async () => undefined),
    }
}

const verifiedSettings: LlmSettings = {
    apiKey: 'key',
    baseUrl: 'https://example.com/v1',
    model: 'model',
    verified: true,
}

describe('useAnalysisController', () => {
    it('requires a verified complete model configuration', async () => {
        const getController = renderController({
            client: {
                complete: vi.fn(async () => '{"issues":[]}'),
                listModels: vi.fn(async () => []),
                testConnection: vi.fn(async () => undefined),
            },
            llmSettings: {...verifiedSettings, verified: false},
            repository: createRepository(),
        })
        await act(async () => Promise.resolve())

        await expect(getController().start()).resolves.toBe(
            'not-configured'
        )
    })

    it('saves valid completed results for the active document', async () => {
        const repository = createRepository()
        const client: OpenAiCompatibleClient = {
            complete: vi.fn(async () =>
                JSON.stringify({
                    issues: [
                        {
                            start: 0,
                            end: 2,
                            quote: '安祥',
                            category: '1.1',
                            severity: 'hard',
                            message: '同音字误用',
                            suggestion: '“安祥”应该是“安详”',
                            confidence: 0.99,
                        },
                    ],
                })
            ),
            listModels: vi.fn(async () => []),
            testConnection: vi.fn(async () => undefined),
        }
        const getController = renderController({
            client,
            llmSettings: verifiedSettings,
            repository,
        })
        await act(async () => Promise.resolve())

        await act(async () => {
            await getController().start()
            await Promise.resolve()
            await Promise.resolve()
        })

        expect(getController().status).toBe('completed')
        expect(getController().issues).toHaveLength(1)
        expect(repository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                documentKey: 'local:first',
                issues: [
                    expect.objectContaining({
                        quote: '安祥',
                        severity: 'hard',
                    }),
                ],
            })
        )
    })

    it('aborts a running request without saving partial results', async () => {
        const repository = createRepository()
        const complete: OpenAiCompatibleClient['complete'] = vi.fn(
            (
                _config: Parameters<
                    OpenAiCompatibleClient['complete']
                >[0],
                _messages: Parameters<
                    OpenAiCompatibleClient['complete']
                >[1],
                signal?: AbortSignal
            ): Promise<string> =>
                new Promise((_, reject) => {
                    signal?.addEventListener('abort', () =>
                        reject(
                            new DOMException(
                                'The operation was aborted',
                                'AbortError'
                            )
                        )
                    )
                })
        )
        const getController = renderController({
            client: {
                complete,
                listModels: vi.fn(async () => []),
                testConnection: vi.fn(async () => undefined),
            },
            llmSettings: verifiedSettings,
            repository,
        })
        await act(async () => Promise.resolve())

        await act(async () => {
            await getController().start()
        })
        expect(getController().running).toBe(true)

        await act(async () => {
            getController().cancel()
            await Promise.resolve()
        })
        expect(getController().running).toBe(false)
        expect(repository.save).not.toHaveBeenCalled()
    })
})
