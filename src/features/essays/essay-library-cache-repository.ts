import {
    loadTauriStore,
    type StoreLoader,
} from '@/shared/platform/store'

import type {EssayListItem} from './essay-library-client'

const CACHE_STORE_PATH = 'essay-library.bin'
const CACHE_COLLECTION_KEY = 'querySnapshots'

export const ALL_ESSAYS_QUERY_KEY = 'all'

export interface EssayLibraryCacheQuery {
    accessToken: string
    queryKey: string
}

export interface EssayLibraryCacheSnapshot {
    cachedAt: number
    entries: EssayListItem[]
    firstPageFetchedAt: number
    hasMore: boolean
    page: number
}

export interface EssayLibraryCacheRepository {
    load: (
        query: EssayLibraryCacheQuery
    ) => Promise<EssayLibraryCacheSnapshot | null>
    prependToAll: (
        accessToken: string,
        essay: EssayListItem
    ) => Promise<void>
    removeEssay: (accessToken: string, essayId: string) => Promise<void>
    save: (
        query: EssayLibraryCacheQuery,
        snapshot: EssayLibraryCacheSnapshot
    ) => Promise<void>
    updateEssay: (
        accessToken: string,
        essayId: string,
        content: string
    ) => Promise<void>
}

interface StoredQuerySnapshot extends EssayLibraryCacheSnapshot {
    account: string
    queryKey: string
}

interface StoredCacheCollection {
    version: 1
    snapshots: StoredQuerySnapshot[]
}

interface EssayLibraryCacheRepositoryOptions {
    fingerprint?: (accessToken: string) => Promise<string>
    loadStore?: StoreLoader
}

function isFiniteTimestamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function parseEssay(value: unknown): EssayListItem | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const candidate = value as Partial<EssayListItem>
    if (
        typeof candidate.id !== 'string' ||
        !candidate.id ||
        typeof candidate.content !== 'string'
    ) {
        return null
    }
    return {id: candidate.id, content: candidate.content}
}

function parseSnapshot(value: unknown): StoredQuerySnapshot | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const candidate = value as Partial<StoredQuerySnapshot>
    if (
        typeof candidate.account !== 'string' ||
        !candidate.account ||
        typeof candidate.queryKey !== 'string' ||
        !candidate.queryKey ||
        !Array.isArray(candidate.entries) ||
        !Number.isInteger(candidate.page) ||
        (candidate.page ?? 0) < 1 ||
        typeof candidate.hasMore !== 'boolean' ||
        !isFiniteTimestamp(candidate.cachedAt) ||
        !isFiniteTimestamp(candidate.firstPageFetchedAt)
    ) {
        return null
    }

    const entries: EssayListItem[] = []
    const ids = new Set<string>()
    for (const value of candidate.entries) {
        const essay = parseEssay(value)
        if (!essay || ids.has(essay.id)) {
            return null
        }
        ids.add(essay.id)
        entries.push(essay)
    }

    return {
        account: candidate.account,
        queryKey: candidate.queryKey,
        cachedAt: candidate.cachedAt,
        entries,
        firstPageFetchedAt: candidate.firstPageFetchedAt,
        hasMore: candidate.hasMore,
        page: candidate.page as number,
    }
}

function parseCollection(value: unknown): StoredCacheCollection | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const candidate = value as Partial<StoredCacheCollection>
    if (candidate.version !== 1 || !Array.isArray(candidate.snapshots)) {
        return null
    }

    const snapshots: StoredQuerySnapshot[] = []
    const keys = new Set<string>()
    for (const value of candidate.snapshots) {
        const snapshot = parseSnapshot(value)
        const key = snapshot
            ? JSON.stringify([snapshot.account, snapshot.queryKey])
            : ''
        if (!snapshot || keys.has(key)) {
            return null
        }
        keys.add(key)
        snapshots.push(snapshot)
    }
    return {version: 1, snapshots}
}

async function createTokenFingerprint(accessToken: string) {
    const encoded = new TextEncoder().encode(accessToken)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, '0')
    ).join('')
}

function toPublicSnapshot(
    snapshot: StoredQuerySnapshot
): EssayLibraryCacheSnapshot {
    return {
        cachedAt: snapshot.cachedAt,
        entries: snapshot.entries.map((entry) => ({...entry})),
        firstPageFetchedAt: snapshot.firstPageFetchedAt,
        hasMore: snapshot.hasMore,
        page: snapshot.page,
    }
}

export function createEssayLibraryCacheRepository({
    fingerprint = createTokenFingerprint,
    loadStore = loadTauriStore,
}: EssayLibraryCacheRepositoryOptions = {}): EssayLibraryCacheRepository {
    let storePromise: ReturnType<StoreLoader> | undefined
    let mutationQueue: Promise<void> = Promise.resolve()

    const getStore = () => {
        storePromise ??= loadStore(CACHE_STORE_PATH)
        return storePromise
    }

    const readCollection = async () => {
        const store = await getStore()
        return (
            parseCollection(await store.get<unknown>(CACHE_COLLECTION_KEY)) ?? {
                version: 1 as const,
                snapshots: [],
            }
        )
    }

    const writeCollection = async (collection: StoredCacheCollection) => {
        const store = await getStore()
        await store.set(CACHE_COLLECTION_KEY, collection)
        await store.save()
    }

    const enqueueMutation = <T,>(mutation: () => Promise<T>) => {
        const result = mutationQueue.then(mutation)
        mutationQueue = result.then(
            () => undefined,
            () => undefined
        )
        return result
    }

    const mutateAccount = async (
        accessToken: string,
        mutate: (snapshot: StoredQuerySnapshot) => StoredQuerySnapshot
    ) => {
        const account = await fingerprint(accessToken)
        await enqueueMutation(async () => {
            const collection = await readCollection()
            await writeCollection({
                version: 1,
                snapshots: collection.snapshots.map((snapshot) =>
                    snapshot.account === account ? mutate(snapshot) : snapshot
                ),
            })
        })
    }

    return {
        load: async ({accessToken, queryKey}) => {
            const account = await fingerprint(accessToken)
            await mutationQueue
            const collection = await readCollection()
            const snapshot = collection.snapshots.find(
                (candidate) =>
                    candidate.account === account &&
                    candidate.queryKey === queryKey
            )
            return snapshot ? toPublicSnapshot(snapshot) : null
        },
        prependToAll: (accessToken, essay) =>
            mutateAccount(accessToken, (snapshot) =>
                snapshot.queryKey === ALL_ESSAYS_QUERY_KEY
                    ? {
                          ...snapshot,
                          entries: [
                              essay,
                              ...snapshot.entries.filter(
                                  (entry) => entry.id !== essay.id
                              ),
                          ],
                      }
                    : snapshot
            ),
        removeEssay: (accessToken, essayId) =>
            mutateAccount(accessToken, (snapshot) => ({
                ...snapshot,
                entries: snapshot.entries.filter(
                    (entry) => entry.id !== essayId
                ),
            })),
        save: ({accessToken, queryKey}, snapshot) =>
            enqueueMutation(async () => {
                const account = await fingerprint(accessToken)
                const collection = await readCollection()
                const nextSnapshot: StoredQuerySnapshot = {
                    account,
                    queryKey,
                    cachedAt: snapshot.cachedAt,
                    entries: snapshot.entries.map((entry) => ({...entry})),
                    firstPageFetchedAt: snapshot.firstPageFetchedAt,
                    hasMore: snapshot.hasMore,
                    page: snapshot.page,
                }
                await writeCollection({
                    version: 1,
                    snapshots: [
                        ...collection.snapshots.filter(
                            (candidate) =>
                                candidate.account !== account ||
                                candidate.queryKey !== queryKey
                        ),
                        nextSnapshot,
                    ],
                })
            }),
        updateEssay: (accessToken, essayId, content) =>
            mutateAccount(accessToken, (snapshot) => ({
                ...snapshot,
                entries: snapshot.entries.map((entry) =>
                    entry.id === essayId ? {id: essayId, content} : entry
                ),
            })),
    }
}
