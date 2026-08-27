import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {DraftRepository, DraftSnapshot} from './draft-repository'
import {useDraftController} from './use-draft-controller'

type DraftController = ReturnType<typeof useDraftController>

const roots: Root[] = []

function renderController(repository: DraftRepository) {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    let controller: DraftController | undefined

    function Harness() {
        controller = useDraftController({
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
            clear: vi.fn(async () => undefined),
            load: vi.fn(
                async (): Promise<DraftSnapshot> => ({
                    version: 1,
                    content: 'restored',
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
            expect.objectContaining({content: 'latest'})
        )
    })

    it('clears persistence when the editor becomes empty', async () => {
        const repository: DraftRepository = {
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

        expect(repository.clear).toHaveBeenCalledTimes(1)
        expect(repository.save).not.toHaveBeenCalled()
        expect(getController().updatedAt).toBe(0)
    })
})
