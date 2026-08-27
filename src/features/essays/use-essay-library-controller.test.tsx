import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {DraftRepository} from '@/features/editor'

import type {EssayLibraryClient, EssayListItem} from './essay-library-client'
import {useEssayLibraryController} from './use-essay-library-controller'

type Controller = ReturnType<typeof useEssayLibraryController>

const roots: Root[] = []

function essays(count: number, offset = 0): EssayListItem[] {
    return Array.from({length: count}, (_, index) => ({
        id: String(index + offset),
        content: `published ${index + offset}`,
    }))
}

function renderController(client: EssayLibraryClient, repository: DraftRepository) {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    let date: string | null = null
    let controller: Controller | undefined

    function Harness() {
        controller = useEssayLibraryController({
            accessToken: 'token',
            client,
            date,
            draftRepository: repository,
            enabled: true,
            onError: vi.fn(),
            userId: 'user',
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
        setDate: async (nextDate: string | null) => {
            date = nextDate
            await act(async () => {
                root.render(<Harness />)
                await Promise.resolve()
                await Promise.resolve()
            })
        },
    }
}

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
})

describe('useEssayLibraryController', () => {
    it('hydrates local drafts, appends pages, and resets for a date', async () => {
        const list = vi.fn(async ({page}: {page: number}) =>
            page === 1 ? essays(20) : essays(1, 20)
        )
        const client: EssayLibraryClient = {
            list,
            update: vi.fn(async () => undefined),
        }
        const repository: DraftRepository = {
            clear: vi.fn(async () => undefined),
            load: vi.fn(async (key) =>
                key === 'essay:1'
                    ? {
                          version: 1 as const,
                          content: 'local one',
                          updatedAt: 1,
                      }
                    : null
            ),
            save: vi.fn(async () => undefined),
        }
        const {getController, setDate} = renderController(client, repository)

        await act(async () => {
            await Promise.resolve()
            await Promise.resolve()
        })
        expect(getController().entries).toHaveLength(20)
        expect(getController().entries[1].localContent).toBe('local one')
        expect(getController().hasMore).toBe(true)

        await act(async () => getController().loadMore())
        expect(getController().entries).toHaveLength(21)
        expect(getController().hasMore).toBe(false)

        await setDate('2026-08-27')
        expect(list).toHaveBeenLastCalledWith(
            expect.objectContaining({date: '2026-08-27', page: 1})
        )
        expect(getController().entries).toHaveLength(20)
    })
})
