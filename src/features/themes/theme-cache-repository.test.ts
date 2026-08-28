import {describe, expect, it, vi} from 'vitest'

import type {KeyValueStore} from '@/shared/platform/store'

import {createThemeCacheRepository} from './theme-cache-repository'

function createStore(initial: Record<string, unknown> = {}) {
    const values = new Map(Object.entries(initial))
    const store: KeyValueStore = {
        delete: vi.fn(async (key) => values.delete(key)),
        get: async <T,>(key: string) => values.get(key) as T | undefined,
        save: vi.fn(async () => undefined),
        set: vi.fn(async (key, value) => {
            values.set(key, value)
        }),
    }
    return {store, values}
}

const snapshot = {
    fetchedAt: 123,
    themes: [{id: 1, name: '频道', slug: 'theme', brief: '简介'}],
}

describe('ThemeCacheRepository', () => {
    it('stores one shared device-level snapshot', async () => {
        const {store, values} = createStore()
        const repository = createThemeCacheRepository({
            loadStore: async () => store,
        })

        await repository.save(snapshot)

        await expect(repository.load()).resolves.toEqual(snapshot)
        expect(values.get('themeSnapshots')).toEqual({
            version: 1,
            ...snapshot,
        })
    })

    it('ignores malformed cached data', async () => {
        const {store} = createStore({
            themeSnapshots: {
                version: 1,
                fetchedAt: 123,
                themes: [{id: '1'}],
            },
        })
        const repository = createThemeCacheRepository({
            loadStore: async () => store,
        })

        await expect(repository.load()).resolves.toBeNull()
    })
})
