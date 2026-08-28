import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {DraftRepository} from '@/features/editor'

import type {EssayLibraryCacheRepository} from './essay-library-cache-repository'
import type {EssayLibraryClient, EssayListItem} from './essay-library-client'
import {useEssayLibraryController} from './use-essay-library-controller'

type Controller = ReturnType<typeof useEssayLibraryController>

const roots: Root[] = []

function emptyCacheRepository(): EssayLibraryCacheRepository {
    return {
        load: vi.fn(async () => null),
        prependToAll: vi.fn(async () => undefined),
        removeEssay: vi.fn(async () => undefined),
        save: vi.fn(async () => undefined),
        updateEssay: vi.fn(async () => undefined),
    }
}

function localDraftMethods() {
    return {
        createLocalDraft: vi.fn(async () => ({
            localId: 'local',
            content: '',
            createdAt: 1,
            themeId: null,
            updatedAt: 1,
        })),
        listLocalDrafts: vi.fn(async () => []),
        removeLocalDraft: vi.fn(async () => undefined),
    }
}

function repositoryWithoutDrafts(): DraftRepository {
    return {
        ...localDraftMethods(),
        clear: vi.fn(async () => undefined),
        load: vi.fn(async () => null),
        save: vi.fn(async () => undefined),
    }
}

async function settle(iterations = 8) {
    for (let index = 0; index < iterations; index += 1) {
        await Promise.resolve()
    }
}

function essays(count: number, offset = 0): EssayListItem[] {
    return Array.from({length: count}, (_, index) => ({
        id: String(index + offset),
        content: `published ${index + offset}`,
        themeSlug: null,
    }))
}

function resolvedEssays(count: number, offset = 0) {
    return essays(count, offset).map((essay) => ({
        ...essay,
        themeId: null,
    }))
}

interface RenderControllerOptions {
    cacheRepository?: EssayLibraryCacheRepository
    now?: () => number
    userId?: string
}

function renderController(
    client: EssayLibraryClient,
    repository: DraftRepository,
    options: RenderControllerOptions = {}
) {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    const cacheRepository = options.cacheRepository ?? emptyCacheRepository()
    const now = options.now ?? Date.now
    let date: string | null = null
    let userId = options.userId ?? 'user'
    let controller: Controller | undefined
    const resolveThemeId = (themeSlug: string | null) =>
        themeSlug === 'theme-six' ? 6 : null

    function Harness() {
        controller = useEssayLibraryController({
            accessToken: 'token',
            cacheRepository,
            client,
            date,
            draftRepository: repository,
            enabled: true,
            now,
            onError: vi.fn(),
            resolveThemeId,
            userId,
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
        setDateImmediately: (nextDate: string | null) => {
            date = nextDate
            act(() => root.render(<Harness />))
        },
        setUserId: async (nextUserId: string) => {
            userId = nextUserId
            await act(async () => {
                root.render(<Harness />)
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
    it('restores every cached page and skips startup refresh within ten minutes', async () => {
        const timestamp = 1_000_000
        const cacheRepository = emptyCacheRepository()
        vi.mocked(cacheRepository.load).mockResolvedValue({
            cachedAt: timestamp - 5 * 60 * 1000,
            entries: essays(25),
            firstPageFetchedAt: timestamp - 5 * 60 * 1000,
            hasMore: true,
            page: 2,
        })
        const list = vi.fn(async () => essays(1, 100))
        const client: EssayLibraryClient = {
            list,
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const {getController} = renderController(
            client,
            repositoryWithoutDrafts(),
            {cacheRepository, now: () => timestamp}
        )

        await act(async () => settle())

        expect(getController().entries).toHaveLength(25)
        expect(getController().hasMore).toBe(true)
        expect(getController().loading).toBe(false)
        expect(getController().refreshing).toBe(false)
        expect(list).not.toHaveBeenCalled()
    })

    it('restores cache before the account request provides a user id', async () => {
        const timestamp = 1_000_000
        const cacheRepository = emptyCacheRepository()
        vi.mocked(cacheRepository.load).mockResolvedValue({
            cachedAt: timestamp,
            entries: essays(2),
            firstPageFetchedAt: timestamp,
            hasMore: false,
            page: 1,
        })
        const list = vi.fn(async () => essays(1, 100))
        const client: EssayLibraryClient = {
            list,
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const {getController} = renderController(
            client,
            repositoryWithoutDrafts(),
            {
                cacheRepository,
                now: () => timestamp,
                userId: '',
            }
        )

        await act(async () => settle())

        expect(getController().entries).toEqual(resolvedEssays(2))
        expect(getController().loading).toBe(false)
        expect(list).not.toHaveBeenCalled()
    })

    it('shows only the cached first page and refreshes when ten minutes old', async () => {
        const timestamp = 2_000_000
        let resolveRefresh: ((entries: EssayListItem[]) => void) | undefined
        const cacheRepository = emptyCacheRepository()
        vi.mocked(cacheRepository.load).mockResolvedValue({
            cachedAt: timestamp - 60 * 60 * 1000,
            entries: essays(25),
            firstPageFetchedAt: timestamp - 10 * 60 * 1000,
            hasMore: false,
            page: 2,
        })
        const list = vi.fn(
            () =>
                new Promise<EssayListItem[]>((resolve) => {
                    resolveRefresh = resolve
                })
        )
        const client: EssayLibraryClient = {
            list,
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const {getController} = renderController(
            client,
            repositoryWithoutDrafts(),
            {cacheRepository, now: () => timestamp}
        )

        await act(async () => settle())
        expect(getController().entries).toHaveLength(20)
        expect(getController().loading).toBe(false)
        expect(getController().refreshing).toBe(true)
        expect(list).toHaveBeenCalledWith(
            expect.objectContaining({page: 1})
        )

        await act(async () => {
            resolveRefresh?.(essays(2, 100))
            await settle()
        })
        expect(getController().entries).toEqual(resolvedEssays(2, 100))
        expect(getController().refreshing).toBe(false)
        expect(cacheRepository.save).toHaveBeenCalledWith(
            {accessToken: 'token', queryKey: 'all'},
            expect.objectContaining({page: 1})
        )
    })

    it('keeps the skeleton state for expired cache until the network returns', async () => {
        const timestamp = 10 * 24 * 60 * 60 * 1000
        const cacheRepository = emptyCacheRepository()
        vi.mocked(cacheRepository.load).mockResolvedValue({
            cachedAt: timestamp - 5 * 24 * 60 * 60 * 1000 - 1,
            entries: essays(20),
            firstPageFetchedAt: timestamp - 1,
            hasMore: true,
            page: 1,
        })
        const client: EssayLibraryClient = {
            list: vi.fn(() => new Promise<EssayListItem[]>(() => undefined)),
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const {getController} = renderController(
            client,
            repositoryWithoutDrafts(),
            {cacheRepository, now: () => timestamp}
        )

        await act(async () => settle())

        expect(getController().entries).toEqual([])
        expect(getController().loading).toBe(true)
        expect(getController().refreshing).toBe(true)
    })

    it('shows a skeleton while reading a filtered cache, then refreshes it', async () => {
        const timestamp = 3_000_000
        let resolveCache:
            | ((snapshot: Awaited<ReturnType<EssayLibraryCacheRepository['load']>>) => void)
            | undefined
        const cacheRepository = emptyCacheRepository()
        vi.mocked(cacheRepository.load).mockImplementation(({queryKey}) => {
            if (queryKey === 'all') {
                return Promise.resolve({
                    cachedAt: timestamp,
                    entries: essays(1),
                    firstPageFetchedAt: timestamp,
                    hasMore: false,
                    page: 1,
                })
            }
            return new Promise((resolve) => {
                resolveCache = resolve
            })
        })
        const client: EssayLibraryClient = {
            list: vi.fn(() => new Promise<EssayListItem[]>(() => undefined)),
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const {getController, setDateImmediately} = renderController(
            client,
            repositoryWithoutDrafts(),
            {cacheRepository, now: () => timestamp}
        )
        await act(async () => settle())

        setDateImmediately('2026-08-28')
        expect(getController().entries).toEqual([])
        expect(getController().loading).toBe(true)

        await act(async () => {
            resolveCache?.({
                cachedAt: timestamp - 1,
                entries: essays(2, 50),
                firstPageFetchedAt: timestamp - 1,
                hasMore: false,
                page: 1,
            })
            await settle()
        })
        expect(getController().entries).toEqual(resolvedEssays(2, 50))
        expect(getController().loading).toBe(false)
        expect(getController().refreshing).toBe(true)
        expect(client.list).toHaveBeenCalledWith(
            expect.objectContaining({date: '2026-08-28', page: 1})
        )
    })

    it('hydrates local drafts, appends pages, and resets for a date', async () => {
        const list = vi.fn(async ({page}: {page: number}) =>
            page === 1 ? essays(21) : essays(1, 20)
        )
        const client: EssayLibraryClient = {
            list,
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async (key) =>
                key === 'essay:1'
                    ? {
                          version: 2 as const,
                          content: 'local one',
                          themeId: 6,
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

    it('resolves the response theme slug through the theme list', async () => {
        const client: EssayLibraryClient = {
            list: vi.fn(async () => [
                {
                    id: 'themed-essay',
                    content: 'themed',
                    themeSlug: 'theme-six',
                },
            ]),
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const {getController} = renderController(
            client,
            repositoryWithoutDrafts()
        )

        await act(async () => settle())

        expect(getController().entries).toEqual([
            {
                id: 'themed-essay',
                content: 'themed',
                themeId: 6,
                themeSlug: 'theme-six',
            },
        ])
    })

    it('keeps existing entries visible while refreshing the first page', async () => {
        let resolveRefresh: ((entries: EssayListItem[]) => void) | undefined
        const list = vi
            .fn()
            .mockResolvedValueOnce(essays(2))
            .mockImplementationOnce(
                () =>
                    new Promise<EssayListItem[]>((resolve) => {
                        resolveRefresh = resolve
                    })
            )
        const client: EssayLibraryClient = {
            list,
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async () => null),
            save: vi.fn(async () => undefined),
        }
        const {getController} = renderController(client, repository)

        await act(async () => {
            await Promise.resolve()
            await Promise.resolve()
        })
        expect(getController().entries).toHaveLength(2)

        act(() => getController().refresh())
        expect(getController().refreshing).toBe(true)
        expect(getController().entries).toHaveLength(2)

        await act(async () => {
            resolveRefresh?.(essays(1, 10))
            await Promise.resolve()
            await Promise.resolve()
        })
        expect(getController().refreshing).toBe(false)
        expect(getController().entries).toEqual([
            {
                id: '10',
                content: 'published 10',
                themeId: null,
                themeSlug: null,
            },
        ])
    })

    it('uses the extra API item only to detect another page', async () => {
        const list = vi.fn(async ({page}: {page: number}) =>
            page === 1 ? essays(21) : essays(2, 20)
        )
        const client: EssayLibraryClient = {
            list,
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async () => null),
            save: vi.fn(async () => undefined),
        }
        const {getController} = renderController(client, repository)

        await act(async () => {
            await Promise.resolve()
            await Promise.resolve()
        })
        expect(getController().entries).toHaveLength(20)
        expect(getController().entries.at(-1)?.id).toBe('19')
        expect(getController().hasMore).toBe(true)

        await act(async () => getController().loadMore())
        expect(getController().entries).toHaveLength(22)
        expect(getController().entries.at(-1)?.id).toBe('21')
        expect(getController().hasMore).toBe(false)
        expect(list).toHaveBeenLastCalledWith(
            expect.objectContaining({page: 2})
        )
    })

    it('prepends a published draft by its real id without duplicates', async () => {
        const client: EssayLibraryClient = {
            list: vi.fn(async () => essays(2)),
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async () => null),
            save: vi.fn(async () => undefined),
        }
        const {getController} = renderController(client, repository)
        await act(async () => {
            await Promise.resolve()
            await Promise.resolve()
        })

        act(() => {
            getController().commitPublish('1', 'newly published', 3, 'tech')
            getController().commitPublish('1', 'newly published', 3, 'tech')
        })

        expect(getController().entries).toEqual([
            {
                id: '1',
                content: 'newly published',
                themeId: 3,
                themeSlug: 'tech',
            },
            {
                id: '0',
                content: 'published 0',
                themeId: null,
                themeSlug: null,
            },
        ])
    })

    it('removes only the committed published essay', async () => {
        const client: EssayLibraryClient = {
            list: vi.fn(async () => essays(3)),
            remove: vi.fn(async () => undefined),
            update: vi.fn(async () => undefined),
        }
        const repository: DraftRepository = {
            ...localDraftMethods(),
            clear: vi.fn(async () => undefined),
            load: vi.fn(async () => null),
            save: vi.fn(async () => undefined),
        }
        const {getController} = renderController(client, repository)
        await act(async () => {
            await Promise.resolve()
            await Promise.resolve()
        })

        act(() => getController().commitRemove('1'))

        expect(getController().entries).toEqual([
            {
                id: '0',
                content: 'published 0',
                themeId: null,
                themeSlug: null,
            },
            {
                id: '2',
                content: 'published 2',
                themeId: null,
                themeSlug: null,
            },
        ])
    })
})
