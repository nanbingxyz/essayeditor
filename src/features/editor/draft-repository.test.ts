import {describe, expect, it, vi} from 'vitest'

import type {KeyValueStore} from '@/shared/platform/store'

import {
    createDraftRepository,
    type DraftSnapshot,
    parseDraftSnapshot,
} from './draft-repository'

function createStore(initialValue?: unknown): KeyValueStore {
    let value = initialValue
    return {
        delete: vi.fn(async () => {
            const existed = value !== undefined
            value = undefined
            return existed
        }),
        get: async <T,>() => value as T | undefined,
        save: vi.fn(async () => undefined),
        set: vi.fn(async (_key, nextValue) => {
            value = nextValue
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
        const store = createStore(storedDraft)
        const repository = createDraftRepository({
            loadStore: async () => store,
            legacyStorage: localStorage,
        })

        await expect(repository.load()).resolves.toEqual(storedDraft)
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

        await expect(repository.load()).resolves.toEqual({
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

        await expect(repository.load()).resolves.toMatchObject({
            content: 'legacy',
        })
        expect(legacyStorage.removeItem).not.toHaveBeenCalled()
    })

    it('clears the persisted draft for empty editor content', async () => {
        const store = createStore(storedDraft)
        const repository = createDraftRepository({
            loadStore: async () => store,
            legacyStorage: localStorage,
        })

        await repository.clear()

        expect(store.delete).toHaveBeenCalledWith('currentDraft')
        expect(store.save).toHaveBeenCalled()
    })

    it('rejects unversioned and malformed snapshots', () => {
        expect(parseDraftSnapshot({content: 'old', updatedAt: 1})).toBeNull()
        expect(
            parseDraftSnapshot({version: 1, content: 3, updatedAt: 1})
        ).toBeNull()
    })
})
