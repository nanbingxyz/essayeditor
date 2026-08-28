import {describe, expect, it, vi} from 'vitest'

import type {KeyValueStore} from '@/shared/platform/store'

import {
    ALL_ESSAYS_QUERY_KEY,
    createEssayLibraryCacheRepository,
} from './essay-library-cache-repository'

function createStore(initial: Record<string, unknown> = {}) {
    const values = new Map(Object.entries(initial))
    const store: KeyValueStore = {
        delete: vi.fn(async (key) => values.delete(key)),
        get: async <T,>(key: string) =>
            values.get(key) as T | undefined,
        save: vi.fn(async () => undefined),
        set: vi.fn(async (key, value) => {
            values.set(key, value)
        }),
    }
    return {store, values}
}

function snapshot(id: string) {
    return {
        cachedAt: 200,
        entries: [
            {id, content: `essay ${id}`, isPrivate: false, themeSlug: null},
        ],
        firstPageFetchedAt: 100,
        hasMore: true,
        page: 2,
    }
}

describe('essay library cache repository', () => {
    it('isolates snapshots by account fingerprint and query', async () => {
        const {store, values} = createStore()
        const fingerprint = vi.fn(async (token: string) =>
            token === 'secret-a' ? 'account-a' : 'account-b'
        )
        const repository = createEssayLibraryCacheRepository({
            fingerprint,
            loadStore: async () => store,
        })

        await repository.save(
            {accessToken: 'secret-a', queryKey: ALL_ESSAYS_QUERY_KEY},
            snapshot('all')
        )
        await repository.save(
            {accessToken: 'secret-a', queryKey: 'date:2026-08-28'},
            snapshot('dated')
        )

        await expect(
            repository.load({
                accessToken: 'secret-a',
                queryKey: ALL_ESSAYS_QUERY_KEY,
            })
        ).resolves.toEqual(snapshot('all'))
        await expect(
            repository.load({
                accessToken: 'secret-b',
                queryKey: ALL_ESSAYS_QUERY_KEY,
            })
        ).resolves.toBeNull()
        expect(JSON.stringify(values.get('querySnapshots'))).not.toContain(
            'secret-a'
        )
    })

    it('rejects a malformed collection and replaces it on the next save', async () => {
        const {store} = createStore({
            querySnapshots: {version: 1, snapshots: [{entries: 'invalid'}]},
        })
        const repository = createEssayLibraryCacheRepository({
            fingerprint: async () => 'account',
            loadStore: async () => store,
        })

        await expect(
            repository.load({accessToken: 'token', queryKey: 'all'})
        ).resolves.toBeNull()
        await repository.save(
            {accessToken: 'token', queryKey: 'all'},
            snapshot('one')
        )
        await expect(
            repository.load({accessToken: 'token', queryKey: 'all'})
        ).resolves.toEqual(snapshot('one'))
    })

    it('serializes saves and applies mutations across account snapshots', async () => {
        const {store} = createStore()
        const repository = createEssayLibraryCacheRepository({
            fingerprint: async () => 'account',
            loadStore: async () => store,
        })

        await Promise.all([
            repository.save(
                {accessToken: 'token', queryKey: 'all'},
                snapshot('one')
            ),
            repository.save(
                {accessToken: 'token', queryKey: 'date:2026-08-28'},
                snapshot('one')
            ),
        ])
        await repository.updateEssay(
            'token',
            'one',
            'updated',
            false,
            'tech'
        )
        await repository.prependToAll('token', {
            id: 'new',
            content: 'new essay',
            themeSlug: null,
        })
        await repository.removeEssay('token', 'one')

        await expect(
            repository.load({accessToken: 'token', queryKey: 'all'})
        ).resolves.toMatchObject({
            cachedAt: 200,
            entries: [{id: 'new', content: 'new essay', themeSlug: null}],
            firstPageFetchedAt: 100,
        })
        await expect(
            repository.load({
                accessToken: 'token',
                queryKey: 'date:2026-08-28',
            })
        ).resolves.toMatchObject({entries: []})
    })
})
