import {loadTauriStore, type StoreLoader} from '@/shared/platform/store'

import type {Theme} from './theme-client'

const CACHE_STORE_PATH = 'themes.bin'
const CACHE_COLLECTION_KEY = 'themeSnapshots'

export interface ThemeCacheSnapshot {
    fetchedAt: number
    themes: Theme[]
}

export interface ThemeCacheRepository {
    load: () => Promise<ThemeCacheSnapshot | null>
    save: (snapshot: ThemeCacheSnapshot) => Promise<void>
}

interface ThemeCacheRepositoryOptions {
    loadStore?: StoreLoader
}

function isTheme(value: unknown): value is Theme {
    if (!value || typeof value !== 'object') {
        return false
    }
    const candidate = value as Partial<Theme>
    return (
        typeof candidate.id === 'number' &&
        Number.isFinite(candidate.id) &&
        Number.isInteger(candidate.id) &&
        typeof candidate.name === 'string' &&
        typeof candidate.slug === 'string' &&
        typeof candidate.brief === 'string'
    )
}

function parseSnapshot(value: unknown): ThemeCacheSnapshot | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const candidate = value as Partial<ThemeCacheSnapshot> & {
        version?: unknown
    }
    if (
        candidate.version !== 1 ||
        typeof candidate.fetchedAt !== 'number' ||
        !Number.isFinite(candidate.fetchedAt) ||
        candidate.fetchedAt < 0 ||
        !Array.isArray(candidate.themes) ||
        !candidate.themes.every(isTheme)
    ) {
        return null
    }
    return {
        fetchedAt: candidate.fetchedAt,
        themes: candidate.themes.map((theme) => ({...theme})),
    }
}

export function createThemeCacheRepository({
    loadStore = loadTauriStore,
}: ThemeCacheRepositoryOptions = {}): ThemeCacheRepository {
    let storePromise: ReturnType<StoreLoader> | undefined
    let mutationQueue: Promise<void> = Promise.resolve()

    const getStore = () => {
        storePromise ??= loadStore(CACHE_STORE_PATH)
        return storePromise
    }

    return {
        load: async () => {
            await mutationQueue
            const store = await getStore()
            return parseSnapshot(
                await store.get<unknown>(CACHE_COLLECTION_KEY)
            )
        },
        save: async (snapshot) => {
            const mutation = mutationQueue.then(async () => {
                const store = await getStore()
                await store.set(CACHE_COLLECTION_KEY, {
                    version: 1,
                    fetchedAt: snapshot.fetchedAt,
                    themes: snapshot.themes.map((theme) => ({...theme})),
                })
                await store.save()
            })
            mutationQueue = mutation.then(
                () => undefined,
                () => undefined
            )
            await mutation
        },
    }
}
