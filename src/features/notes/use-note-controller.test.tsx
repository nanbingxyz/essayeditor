import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {NoteCacheRepository} from './note-cache-repository'
import type {Note, NoteClient} from './note-client'
import {NOTE_CACHE_TTL, useNoteController} from './use-note-controller'

const roots: Root[] = []

const cachedNote: Note = {
    id: 'cached',
    content: 'Cached',
    createdAt: '2026-08-28T08:00:00Z',
    folder: null,
    comments: [],
}

const remoteNote: Note = {
    ...cachedNote,
    id: 'remote',
    content: 'Remote',
}

function cacheRepository(snapshot: Awaited<ReturnType<NoteCacheRepository['load']>>): NoteCacheRepository {
    return {
        load: vi.fn(async () => snapshot),
        saveFolders: vi.fn(async () => undefined),
        saveNotes: vi.fn(async () => undefined),
    }
}

function client(): NoteClient {
    return {
        create: vi.fn(async () => 'created'),
        list: vi.fn(async (page) => ({
            data: page === 1 ? [remoteNote] : [{...remoteNote, id: 'more'}],
            meta: {page, limit: 20, hasMore: page === 1},
        })),
        listFolders: vi.fn(async () => [{id: 'folder', name: 'Folder'}]),
        remove: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined),
    }
}

async function settle(iterations = 12) {
    for (let index = 0; index < iterations; index += 1) {
        await Promise.resolve()
    }
}

function renderController(
    repository: NoteCacheRepository,
    noteClient: NoteClient,
    timestamp: number
) {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    let controller: ReturnType<typeof useNoteController> | undefined
    function Harness() {
        controller = useNoteController({
            accessToken: 'token',
            active: true,
            cacheRepository: repository,
            client: noteClient,
            enabled: true,
            now: () => timestamp,
            onError: vi.fn(),
        })
        return null
    }
    act(() => root.render(<Harness />))
    return () => controller!
}

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
})

describe('useNoteController', () => {
    it('restores a fresh cache and still refreshes the first page once', async () => {
        const timestamp = 2 * NOTE_CACHE_TTL
        const repository = cacheRepository({
            folders: [{id: 'cached-folder', name: 'Cached folder'}],
            foldersFetchedAt: timestamp,
            notes: [cachedNote],
            notesFetchedAt: timestamp - 1,
            notesHasMore: true,
        })
        let resolveList: ((value: Awaited<ReturnType<NoteClient['list']>>) => void) | undefined
        const noteClient = client()
        vi.mocked(noteClient.list).mockImplementation(
            () => new Promise((resolve) => {
                resolveList = resolve
            })
        )
        const getController = renderController(repository, noteClient, timestamp)

        await act(async () => settle())
        expect(getController().notes).toEqual([cachedNote])
        expect(noteClient.list).toHaveBeenCalledTimes(1)
        expect(noteClient.listFolders).not.toHaveBeenCalled()

        await act(async () => {
            resolveList?.({
                data: [remoteNote],
                meta: {page: 1, limit: 20, hasMore: false},
            })
            await settle()
        })
        expect(getController().notes).toEqual([remoteNote])
    })

    it('loads more with server hasMore and updates mutations locally', async () => {
        const repository = cacheRepository(null)
        const noteClient = client()
        const getController = renderController(repository, noteClient, 1000)
        await act(async () => settle())

        expect(getController().notes).toEqual([remoteNote])
        await act(async () => getController().loadMore())
        expect(getController().notes.map((note) => note.id)).toEqual([
            'remote',
            'more',
        ])

        await act(async () => {
            await getController().createNote('Created', 'folder')
        })
        expect(getController().notes[0]).toMatchObject({
            id: 'created',
            content: 'Created',
            folder: {id: 'folder'},
        })
        await act(async () => {
            await getController().updateNote('created', 'Updated', null)
        })
        expect(getController().notes[0]).toMatchObject({
            id: 'created',
            content: 'Updated',
            folder: null,
        })
        await act(async () => {
            await getController().removeNote('created')
        })
        expect(getController().notes.some((note) => note.id === 'created')).toBe(false)
    })

    it('uses the active query for pagination and keeps filtered results out of cache', async () => {
        const repository = cacheRepository(null)
        const noteClient = client()
        const getController = renderController(repository, noteClient, 1000)
        await act(async () => settle())
        vi.mocked(repository.saveNotes).mockClear()
        vi.mocked(noteClient.list).mockClear()

        await act(async () => {
            await getController().search({
                keyword: ' first,second ',
                folderIds: ['folder', 'unclassified', 'folder'],
            })
        })

        expect(getController().query).toEqual({
            keyword: 'first,second',
            folderIds: ['folder', 'unclassified'],
        })
        expect(noteClient.list).toHaveBeenLastCalledWith(
            1,
            {
                keyword: 'first,second',
                folderIds: ['folder', 'unclassified'],
            },
            'token',
            expect.any(AbortSignal)
        )
        expect(repository.saveNotes).not.toHaveBeenCalled()

        await act(async () => getController().loadMore())
        expect(noteClient.list).toHaveBeenLastCalledWith(
            2,
            {
                keyword: 'first,second',
                folderIds: ['folder', 'unclassified'],
            },
            'token',
            expect.any(AbortSignal)
        )

        await act(async () => getController().refresh())
        expect(noteClient.list).toHaveBeenLastCalledWith(
            1,
            {
                keyword: 'first,second',
                folderIds: ['folder', 'unclassified'],
            },
            'token',
            expect.any(AbortSignal)
        )

        await act(async () => {
            await getController().search({keyword: '', folderIds: []})
        })
        expect(repository.saveNotes).toHaveBeenCalledTimes(1)
    })

    it('ignores a superseded query response', async () => {
        const repository = cacheRepository(null)
        const noteClient = client()
        const getController = renderController(repository, noteClient, 1000)
        await act(async () => settle())

        let resolveOld:
            | ((value: Awaited<ReturnType<NoteClient['list']>>) => void)
            | undefined
        let resolveNew:
            | ((value: Awaited<ReturnType<NoteClient['list']>>) => void)
            | undefined
        vi.mocked(noteClient.list).mockImplementation((_page, query) =>
            new Promise((resolve) => {
                if (query.keyword === 'old') {
                    resolveOld = resolve
                } else {
                    resolveNew = resolve
                }
            })
        )

        let oldSearch: Promise<boolean>
        let newSearch: Promise<boolean>
        await act(async () => {
            oldSearch = getController().search({
                keyword: 'old',
                folderIds: [],
            })
            await settle()
        })
        await act(async () => {
            newSearch = getController().search({
                keyword: 'new',
                folderIds: [],
            })
            await settle()
        })
        await act(async () => {
            resolveNew?.({
                data: [{...remoteNote, id: 'new-result'}],
                meta: {page: 1, limit: 20, hasMore: false},
            })
            await newSearch!
        })
        await act(async () => {
            resolveOld?.({
                data: [{...remoteNote, id: 'old-result'}],
                meta: {page: 1, limit: 20, hasMore: false},
            })
            await oldSearch!
        })

        expect(getController().query.keyword).toBe('new')
        expect(getController().notes.map((entry) => entry.id)).toEqual([
            'new-result',
        ])
    })
})
