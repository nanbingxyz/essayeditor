import {describe, expect, it, vi} from 'vitest'

import type {KeyValueStore} from '@/shared/platform/store'

import {
    createDraftRepository,
    NEW_DRAFT_KEY,
    type DraftSnapshot,
    parseDraftSnapshot,
} from './draft-repository'

function createStore(initialValues: Record<string, unknown> = {}): KeyValueStore {
    const values = new Map(Object.entries(initialValues))
    return {
        delete: vi.fn(async (key) => values.delete(key)),
        get: async <T,>(key: string) => values.get(key) as T | undefined,
        save: vi.fn(async () => undefined),
        set: vi.fn(async (key, nextValue) => {
            values.set(key, nextValue)
        }),
    }
}

const storedDraft: DraftSnapshot = {
    version: 1,
    content: 'stored content',
    updatedAt: 123,
}

describe('DraftRepository', () => {
    it('loads a valid draft from the Tauri store', async () => {
        const store = createStore({'draft:new': storedDraft})
        const repository = createDraftRepository({
            loadStore: async () => store,
            legacyStorage: localStorage,
        })

        await expect(repository.load(NEW_DRAFT_KEY)).resolves.toEqual(
            storedDraft
        )
    })

    it('migrates a valid legacy backup before removing it', async () => {
        const store = createStore()
        const legacyStorage = {
            getItem: vi.fn(() =>
                JSON.stringify({content: 'legacy', timestamp: 456})
            ),
            removeItem: vi.fn(),
        }
        const repository = createDraftRepository({
            loadStore: async () => store,
            legacyStorage,
        })

        await expect(repository.load(NEW_DRAFT_KEY)).resolves.toEqual({
            version: 1,
            content: 'legacy',
            updatedAt: 456,
        })
        expect(vi.mocked(store.save).mock.invocationCallOrder[0]).toBeLessThan(
            legacyStorage.removeItem.mock.invocationCallOrder[0]
        )
        expect(legacyStorage.removeItem).toHaveBeenCalledWith('backup')
    })

    it('restores and retains the legacy backup when migration fails', async () => {
        const store = createStore()
        vi.mocked(store.save).mockRejectedValue(new Error('disk full'))
        const legacyStorage = {
            getItem: vi.fn(() =>
                JSON.stringify({content: 'legacy', timestamp: 456})
            ),
            removeItem: vi.fn(),
        }
        const repository = createDraftRepository({
            loadStore: async () => store,
            legacyStorage,
        })

        await expect(repository.load(NEW_DRAFT_KEY)).resolves.toMatchObject({
            content: 'legacy',
        })
        expect(legacyStorage.removeItem).not.toHaveBeenCalled()
    })

    it('clears the persisted draft for empty editor content', async () => {
        const store = createStore({'draft:new': storedDraft})
        const repository = createDraftRepository({
            loadStore: async () => store,
            legacyStorage: localStorage,
        })

        await repository.clear(NEW_DRAFT_KEY)

        expect(store.delete).toHaveBeenCalledWith('draft:new')
        expect(store.save).toHaveBeenCalled()
    })

    it('rejects unversioned and malformed snapshots', () => {
        expect(parseDraftSnapshot({content: 'old', updatedAt: 1})).toBeNull()
        expect(
            parseDraftSnapshot({version: 1, content: 3, updatedAt: 1})
        ).toBeNull()
    })

    it('migrates the former current draft and isolates document keys', async () => {
        const store = createStore({currentDraft: storedDraft})
        const repository = createDraftRepository({
            loadStore: async () => store,
            legacyStorage: localStorage,
        })

        await expect(repository.load(NEW_DRAFT_KEY)).resolves.toEqual(
            storedDraft
        )
        expect(store.set).toHaveBeenCalledWith('draft:new', storedDraft)
        expect(store.delete).toHaveBeenCalledWith('currentDraft')

        const essayDraft = {...storedDraft, content: 'essay draft'}
        await repository.save('essay:one', essayDraft)
        await expect(repository.load('essay:one')).resolves.toEqual(essayDraft)
        await expect(repository.load('essay:two')).resolves.toBeNull()
    })
})
