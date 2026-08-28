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
    version: 2,
    content: 'stored content',
    themeId: 3,
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
            now: () => timestamps.shift()!,
        })

        const first = await repository.createLocalDraft()
        const second = await repository.createLocalDraft('second')
        await repository.save(getLocalDraftDocumentKey(first.localId), {
            version: 2,
            content: 'first edited',
            themeId: 4,
            updatedAt: 30,
        })

        expect(await repository.listLocalDrafts()).toEqual([
            {
                ...first,
                content: 'first edited',
                themeId: 4,
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
            now: () => 10,
        })

        await Promise.all([
            repository.createLocalDraft('one'),
            repository.createLocalDraft('two'),
        ])

        expect(await repository.listLocalDrafts()).toHaveLength(2)
    })

    it('creates only one default draft during concurrent initialization', async () => {
        const {store} = createStore()
        const createId = vi.fn(() => 'default')
        const repository = createDraftRepository({
            createId,
            loadStore: async () => store,
            now: () => 10,
        })

        const [first, second] = await Promise.all([
            repository.listOrCreateLocalDrafts(),
            repository.listOrCreateLocalDrafts(),
        ])

        expect(first).toEqual(second)
        expect(first).toHaveLength(1)
        expect(createId).toHaveBeenCalledTimes(1)
        expect(await repository.listLocalDrafts()).toHaveLength(1)
    })

    it('still allows manually creating drafts after initialization', async () => {
        const {store} = createStore()
        const ids = ['default', 'manual']
        const repository = createDraftRepository({
            createId: () => ids.shift()!,
            loadStore: async () => store,
            now: () => 10,
        })

        await repository.listOrCreateLocalDrafts()
        await repository.createLocalDraft()

        expect(await repository.listLocalDrafts()).toHaveLength(2)
    })

    it('keeps published essay overrides isolated by document key', async () => {
        const {store} = createStore()
        const repository = createDraftRepository({
            loadStore: async () => store,
        })

        await repository.save('essay:one', storedDraft)

        await expect(repository.load('essay:one')).resolves.toEqual(storedDraft)
        await expect(repository.load('essay:two')).resolves.toBeNull()
    })

    it('rejects an unsupported local draft collection without mutating it', async () => {
        const {store} = createStore({
            localDrafts: {version: 1, drafts: []},
        })
        const repository = createDraftRepository({
            loadStore: async () => store,
        })

        await expect(repository.listLocalDrafts()).rejects.toThrow(
            'Unable to read the local draft collection'
        )
        expect(store.set).not.toHaveBeenCalled()
        expect(store.delete).not.toHaveBeenCalled()
    })

    it('rejects unversioned and malformed snapshots', () => {
        expect(parseDraftSnapshot({content: 'old', updatedAt: 1})).toBeNull()
        expect(
            parseDraftSnapshot({version: 2, content: 3, updatedAt: 1})
        ).toBeNull()
    })

    it('rejects old snapshots without theme metadata', () => {
        expect(
            parseDraftSnapshot({
                version: 1,
                content: 'legacy',
                updatedAt: 1,
            })
        ).toBeNull()
    })
})
