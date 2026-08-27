import {describe, expect, it, vi} from 'vitest'

import type {KeyValueStore} from '@/shared/platform/store'

import {
    createDraftRepository,
    getLocalDraftDocumentKey,
    type DraftSnapshot,
    parseDraftSnapshot,
} from './draft-repository'

function createStore(initialValues: Record<string, unknown> = {}) {
    const values = new Map(Object.entries(initialValues))
    const store: KeyValueStore = {
        delete: vi.fn(async (key) => values.delete(key)),
        get: async <T,>(key: string) => values.get(key) as T | undefined,
        save: vi.fn(async () => undefined),
        set: vi.fn(async (key, nextValue) => {
            values.set(key, nextValue)
        }),
    }
    return {store, values}
}

const storedDraft: DraftSnapshot = {
    version: 1,
    content: 'stored content',
    updatedAt: 123,
}

describe('DraftRepository', () => {
    it('creates, persists, and sorts multiple local drafts by last edit', async () => {
        const {store} = createStore()
        const ids = ['one', 'two']
        const timestamps = [10, 20]
        const repository = createDraftRepository({
            createId: () => ids.shift()!,
            loadStore: async () => store,
            legacyStorage: localStorage,
            now: () => timestamps.shift()!,
        })

        const first = await repository.createLocalDraft()
        const second = await repository.createLocalDraft('second')
        await repository.save(getLocalDraftDocumentKey(first.localId), {
            version: 1,
            content: 'first edited',
            updatedAt: 30,
        })

        expect(await repository.listLocalDrafts()).toEqual([
            {
                ...first,
                content: 'first edited',
                updatedAt: 30,
            },
            second,
        ])
        await expect(
            repository.load(getLocalDraftDocumentKey(second.localId))
        ).resolves.toMatchObject({content: 'second'})
    })

    it('removes one local draft without affecting the others', async () => {
        const {store} = createStore()
        const ids = ['one', 'two']
        const repository = createDraftRepository({
            createId: () => ids.shift()!,
            loadStore: async () => store,
            legacyStorage: localStorage,
            now: () => 10,
        })
        await repository.createLocalDraft('one')
        await repository.createLocalDraft('two')

        await repository.removeLocalDraft('one')

        expect(await repository.listLocalDrafts()).toEqual([
            expect.objectContaining({localId: 'two'}),
        ])
    })

    it('serializes concurrent local draft creation', async () => {
        const {store} = createStore()
        const ids = ['one', 'two']
        const repository = createDraftRepository({
            createId: () => ids.shift()!,
            loadStore: async () => store,
            legacyStorage: localStorage,
            now: () => 10,
        })

        await Promise.all([
            repository.createLocalDraft('one'),
            repository.createLocalDraft('two'),
        ])

        expect(await repository.listLocalDrafts()).toHaveLength(2)
    })

    it('keeps published essay overrides isolated by document key', async () => {
        const {store} = createStore()
        const repository = createDraftRepository({
            loadStore: async () => store,
            legacyStorage: localStorage,
        })

        await repository.save('essay:one', storedDraft)

        await expect(repository.load('essay:one')).resolves.toEqual(storedDraft)
        await expect(repository.load('essay:two')).resolves.toBeNull()
    })

    it.each([
        ['draft:new', {'draft:new': storedDraft}],
        ['currentDraft', {currentDraft: storedDraft}],
    ])('migrates the former %s value into a local draft', async (_, initial) => {
        const {store} = createStore(initial)
        const repository = createDraftRepository({
            createId: () => 'migrated',
            loadStore: async () => store,
            legacyStorage: localStorage,
        })

        await expect(repository.listLocalDrafts()).resolves.toEqual([
            {
                localId: 'migrated',
                content: storedDraft.content,
                createdAt: storedDraft.updatedAt,
                updatedAt: storedDraft.updatedAt,
            },
        ])
        expect(store.delete).toHaveBeenCalledWith('draft:new')
        expect(store.delete).toHaveBeenCalledWith('currentDraft')
    })

    it('migrates a legacy backup only after the collection is saved', async () => {
        const {store} = createStore()
        const legacyStorage = {
            getItem: vi.fn(() =>
                JSON.stringify({content: 'legacy', timestamp: 456})
            ),
            removeItem: vi.fn(),
        }
        const repository = createDraftRepository({
            createId: () => 'legacy',
            loadStore: async () => store,
            legacyStorage,
        })

        await expect(repository.listLocalDrafts()).resolves.toEqual([
            expect.objectContaining({
                localId: 'legacy',
                content: 'legacy',
                updatedAt: 456,
            }),
        ])
        expect(vi.mocked(store.save).mock.invocationCallOrder[0]).toBeLessThan(
            legacyStorage.removeItem.mock.invocationCallOrder[0]
        )
        expect(legacyStorage.removeItem).toHaveBeenCalledWith('backup')
    })

    it('retains the legacy backup when migration persistence fails', async () => {
        const {store} = createStore()
        vi.mocked(store.save).mockRejectedValue(new Error('disk full'))
        const legacyStorage = {
            getItem: vi.fn(() =>
                JSON.stringify({content: 'legacy', timestamp: 456})
            ),
            removeItem: vi.fn(),
        }
        const repository = createDraftRepository({
            createId: () => 'legacy',
            loadStore: async () => store,
            legacyStorage,
        })

        await expect(repository.listLocalDrafts()).rejects.toThrow('disk full')
        expect(legacyStorage.removeItem).not.toHaveBeenCalled()
    })

    it('rejects unversioned and malformed snapshots', () => {
        expect(parseDraftSnapshot({content: 'old', updatedAt: 1})).toBeNull()
        expect(
            parseDraftSnapshot({version: 1, content: 3, updatedAt: 1})
        ).toBeNull()
    })
})
