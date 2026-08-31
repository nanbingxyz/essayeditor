import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {DraftRepository, DraftSnapshot} from './draft-repository'
import {useDraftController} from './use-draft-controller'

type DraftController = ReturnType<typeof useDraftController>

const roots: Root[] = []

function localDraftMethods() {
    return {
        createLocalDraft: vi.fn(async () => ({
            localId: 'local',
            content: '',
            createdAt: 1,
            themeId: null,
            updatedAt: 1,
        })),
        listOrCreateLocalDrafts: vi.fn(async () => []),
        listLocalDrafts: vi.fn(async () => []),
        removeLocalDraft: vi.fn(async () => undefined),
    }
}

function renderController(
    repository: DraftRepository,
    {
        baselineContent = '',
        documentKey = 'new',
    }: {baselineContent?: string; documentKey?: string} = {}
) {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    let controller: DraftController | undefined

    function Harness() {
        controller = useDraftController({
            baselineContent,
            documentKey,
            repository,
            onError: vi.fn(),
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

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'))
})

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
    vi.useRealTimers()
})

describe('useDraftController', () => {
    it('waits for restoration and only persists the latest debounced content', async () => {
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(
                async (): Promise<DraftSnapshot> => ({
                    version: 2,
                    content: 'restored',
                    themeId: 7,
                    updatedAt: 100,
                })
            ),
            save: vi.fn(async () => undefined),
        }
        const getController = renderController(repository)

        expect(getController().ready).toBe(false)
        await act(async () => Promise.resolve())
        expect(getController().ready).toBe(true)
        expect(getController().initialContent).toBe('restored')
        expect(getController().themeId).toBe(7)

        act(() => {
            getController().onContentChange('first')
            getController().onContentChange('latest')
            vi.advanceTimersByTime(1000)
        })
        await act(async () => {
            await getController().flush()
        })

        expect(repository.save).toHaveBeenCalledTimes(1)
        expect(repository.save).toHaveBeenCalledWith(
            'new',
            expect.objectContaining({content: 'latest'})
        )
    })

    it('clears persistence when the editor becomes empty', async () => {
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async () => null),
            save: vi.fn(async () => undefined),
        }
        const getController = renderController(repository)
        await act(async () => Promise.resolve())

        act(() => {
            getController().onContentChange('temporary')
            getController().onContentChange('')
            vi.advanceTimersByTime(1000)
        })
        await act(async () => {
            await getController().flush()
        })

        expect(repository.clear).toHaveBeenCalledWith('new')
        expect(repository.save).not.toHaveBeenCalled()
        expect(getController().updatedAt).toBe(0)
    })

    it('restores an essay override and clears it when content matches published', async () => {
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async () => ({
                version: 2 as const,
                content: 'local edit',
                themeId: null,
                updatedAt: 100,
            })),
            save: vi.fn(async () => undefined),
        }
        const getController = renderController(repository, {
            baselineContent: 'published',
            documentKey: 'essay:one',
        })
        await act(async () => Promise.resolve())
        expect(getController().content).toBe('local edit')

        act(() => {
            getController().onContentChange('published')
            vi.advanceTimersByTime(1000)
        })
        await act(async () => getController().flush())

        expect(repository.clear).toHaveBeenCalledWith('essay:one')
        expect(getController().updatedAt).toBe(0)
    })

    it('persists an empty local draft when baseline retention is enabled', async () => {
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async () => null),
            save: vi.fn(async () => undefined),
        }
        const container = document.createElement('div')
        document.body.append(container)
        const root = createRoot(container)
        roots.push(root)
        let controller: DraftController | undefined

        function Harness() {
            controller = useDraftController({
                baselineContent: '',
                documentKey: 'local:one',
                persistBaseline: true,
                repository,
                onError: vi.fn(),
            })
            return null
        }

        act(() => root.render(<Harness />))
        await act(async () => Promise.resolve())
        act(() => {
            controller?.onContentChange('')
            vi.advanceTimersByTime(1000)
        })
        await act(async () => controller?.flush())

        expect(repository.save).toHaveBeenCalledWith(
            'local:one',
            expect.objectContaining({content: ''})
        )
        expect(repository.clear).not.toHaveBeenCalled()
    })

    it('persists and restores a theme-only published override', async () => {
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async () => null),
            save: vi.fn(async () => undefined),
        }
        const getController = renderController(repository, {
            baselineContent: 'published',
            documentKey: 'essay:one',
        })
        await act(async () => Promise.resolve())

        act(() => {
            getController().onThemeChange(9)
            vi.advanceTimersByTime(1000)
        })
        await act(async () => getController().flush())

        expect(repository.save).toHaveBeenCalledWith(
            'essay:one',
            expect.objectContaining({content: 'published', themeId: 9})
        )
    })

    it('keeps rapid document switches isolated by document key', async () => {
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async () => null),
            save: vi.fn(async () => undefined),
        }
        const container = document.createElement('div')
        document.body.append(container)
        const root = createRoot(container)
        roots.push(root)
        let controller: DraftController | undefined

        function Harness({
            content,
            documentKey,
        }: {
            content: string
            documentKey: string
        }) {
            controller = useDraftController({
                baselineContent: '',
                documentKey,
                persistBaseline: true,
                repository,
                seed: {
                    content,
                    isPrivate: false,
                    themeId: null,
                    updatedAt: 1,
                },
                onError: vi.fn(),
            })
            return null
        }

        const renderDocument = (documentKey: string, content: string) => {
            act(() => root.render(
                <Harness documentKey={documentKey} content={content} />
            ))
        }
        renderDocument('local:a', 'A')
        act(() => {
            controller?.onContentChange('A edited')
            void controller?.flush()
        })
        renderDocument('local:b', 'B')
        act(() => {
            controller?.onContentChange('B edited')
            void controller?.flush()
        })
        renderDocument('local:c', 'C')
        act(() => {
            controller?.onContentChange('C edited')
            void controller?.flush()
        })
        renderDocument('local:a', 'A')

        expect(controller?.content).toBe('A edited')
        await act(async () => Promise.resolve())
        await act(async () => Promise.resolve())
        expect(repository.save).toHaveBeenNthCalledWith(
            1,
            'local:a',
            expect.objectContaining({content: 'A edited'})
        )
        expect(repository.save).toHaveBeenNthCalledWith(
            2,
            'local:b',
            expect.objectContaining({content: 'B edited'})
        )
        expect(repository.save).toHaveBeenNthCalledWith(
            3,
            'local:c',
            expect.objectContaining({content: 'C edited'})
        )
    })

    it('retains a failed snapshot and retries it on the next flush', async () => {
        const onError = vi.fn()
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async () => null),
            save: vi
                .fn()
                .mockRejectedValueOnce(new Error('disk unavailable'))
                .mockResolvedValue(undefined),
        }
        const container = document.createElement('div')
        document.body.append(container)
        const root = createRoot(container)
        roots.push(root)
        let controller: DraftController | undefined

        function Harness() {
            controller = useDraftController({
                baselineContent: '',
                documentKey: 'local:retry',
                persistBaseline: true,
                repository,
                seed: {
                    content: 'Original',
                    isPrivate: false,
                    themeId: null,
                    updatedAt: 1,
                },
                onError,
            })
            return null
        }

        act(() => root.render(<Harness />))
        act(() => controller?.onContentChange('Keep me'))
        let firstResult = true
        await act(async () => {
            firstResult = (await controller?.flush()) ?? true
        })
        expect(firstResult).toBe(false)
        expect(onError).toHaveBeenCalledOnce()

        let retryResult = false
        await act(async () => {
            retryResult = (await controller?.flush()) ?? false
        })
        expect(retryResult).toBe(true)
        expect(repository.save).toHaveBeenCalledTimes(2)
        expect(repository.save).toHaveBeenLastCalledWith(
            'local:retry',
            expect.objectContaining({content: 'Keep me'})
        )
    })

})
