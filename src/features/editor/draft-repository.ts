import {
    loadTauriStore,
    type StoreLoader,
} from '@/shared/platform/store'

const DRAFT_STORE_PATH = 'drafts.bin'
const CURRENT_DRAFT_KEY = 'currentDraft'
const LEGACY_BACKUP_KEY = 'backup'
const DRAFT_KEY_PREFIX = 'draft:'
const LOCAL_DRAFT_KEY_PREFIX = 'local:'
const LOCAL_DRAFT_COLLECTION_KEY = 'localDrafts'

export const NEW_DRAFT_KEY = 'new'

export interface DraftSnapshot {
    version: 1
    content: string
    updatedAt: number
}

export interface LocalDraft {
    localId: string
    content: string
    createdAt: number
    updatedAt: number
}

interface LocalDraftCollection {
    version: 1
    drafts: LocalDraft[]
}

export interface DraftRepository {
    clear: (documentKey: string) => Promise<void>
    createLocalDraft: (content?: string) => Promise<LocalDraft>
    listLocalDrafts: () => Promise<LocalDraft[]>
    load: (documentKey: string) => Promise<DraftSnapshot | null>
    removeLocalDraft: (localId: string) => Promise<void>
    save: (documentKey: string, draft: DraftSnapshot) => Promise<void>
}

export interface LegacyStorage {
    getItem: (key: string) => string | null
    removeItem: (key: string) => void
}

interface DraftRepositoryOptions {
    createId?: () => string
    legacyStorage?: LegacyStorage
    loadStore?: StoreLoader
    now?: () => number
}

function isFiniteTimestamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function createDefaultId() {
    return globalThis.crypto.randomUUID()
}

function sortLocalDrafts(drafts: LocalDraft[]) {
    return [...drafts].sort(
        (left, right) =>
            right.updatedAt - left.updatedAt ||
            right.createdAt - left.createdAt ||
            left.localId.localeCompare(right.localId)
    )
}

function parseLocalDraft(value: unknown): LocalDraft | null {
    if (!value || typeof value !== 'object') {
        return null
    }

    const candidate = value as Partial<LocalDraft>
    if (
        typeof candidate.localId !== 'string' ||
        !candidate.localId ||
        typeof candidate.content !== 'string' ||
        !isFiniteTimestamp(candidate.createdAt) ||
        !isFiniteTimestamp(candidate.updatedAt)
    ) {
        return null
    }

    return {
        localId: candidate.localId,
        content: candidate.content,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
    }
}

function parseLocalDraftCollection(value: unknown): LocalDraftCollection | null {
    if (!value || typeof value !== 'object') {
        return null
    }

    const candidate = value as Partial<LocalDraftCollection>
    if (candidate.version !== 1 || !Array.isArray(candidate.drafts)) {
        return null
    }

    const drafts: LocalDraft[] = []
    const ids = new Set<string>()
    for (const value of candidate.drafts) {
        const draft = parseLocalDraft(value)
        if (!draft || ids.has(draft.localId)) {
            return null
        }
        ids.add(draft.localId)
        drafts.push(draft)
    }

    return {version: 1, drafts: sortLocalDrafts(drafts)}
}

export function getLocalDraftDocumentKey(localId: string) {
    return `${LOCAL_DRAFT_KEY_PREFIX}${localId}`
}

function getLocalId(documentKey: string) {
    if (!documentKey.startsWith(LOCAL_DRAFT_KEY_PREFIX)) {
        return null
    }
    return documentKey.slice(LOCAL_DRAFT_KEY_PREFIX.length) || null
}

export function parseDraftSnapshot(value: unknown): DraftSnapshot | null {
    if (!value || typeof value !== 'object') {
        return null
    }

    const candidate = value as Partial<DraftSnapshot>
    if (
        candidate.version !== 1 ||
        typeof candidate.content !== 'string' ||
        !isFiniteTimestamp(candidate.updatedAt)
    ) {
        return null
    }

    return {
        version: 1,
        content: candidate.content,
        updatedAt: candidate.updatedAt,
    }
}

export function parseLegacyBackup(serialized: string | null): DraftSnapshot | null {
    if (!serialized) {
        return null
    }

    try {
        const candidate = JSON.parse(serialized) as {
            content?: unknown
            timestamp?: unknown
        }
        if (
            typeof candidate.content !== 'string' ||
            !isFiniteTimestamp(candidate.timestamp)
        ) {
            return null
        }

        return {
            version: 1,
            content: candidate.content,
            updatedAt: candidate.timestamp,
        }
    } catch {
        return null
    }
}

export function createDraftRepository({
    createId = createDefaultId,
    legacyStorage = window.localStorage,
    loadStore = loadTauriStore,
    now = Date.now,
}: DraftRepositoryOptions = {}): DraftRepository {
    let storePromise: ReturnType<StoreLoader> | undefined
    let initializePromise: Promise<void> | undefined
    let mutationQueue: Promise<void> = Promise.resolve()

    const getStore = () => {
        storePromise ??= loadStore(DRAFT_STORE_PATH)
        return storePromise
    }

    const getDraftStoreKey = (documentKey: string) =>
        `${DRAFT_KEY_PREFIX}${documentKey}`

    const enqueueMutation = <T,>(mutation: () => Promise<T>) => {
        const result = mutationQueue.then(mutation)
        mutationQueue = result.then(
            () => undefined,
            () => undefined
        )
        return result
    }

    const initializeLocalDrafts = () => {
        if (initializePromise) {
            return initializePromise
        }

        const initialization = (async () => {
            const store = await getStore()
            const storedCollection = await store.get<unknown>(
                LOCAL_DRAFT_COLLECTION_KEY
            )
            const collection = parseLocalDraftCollection(
                storedCollection
            )
            if (collection) {
                const removedNewDraft = await store.delete(
                    getDraftStoreKey(NEW_DRAFT_KEY)
                )
                const removedCurrentDraft = await store.delete(
                    CURRENT_DRAFT_KEY
                )
                if (removedNewDraft || removedCurrentDraft) {
                    try {
                        await store.save()
                    } catch {
                        return
                    }
                }
                legacyStorage.removeItem(LEGACY_BACKUP_KEY)
                return
            }
            if (storedCollection !== undefined) {
                throw new Error('Unable to read the local draft collection')
            }

            const migratedDraft =
                parseDraftSnapshot(
                    await store.get<unknown>(getDraftStoreKey(NEW_DRAFT_KEY))
                ) ??
                parseDraftSnapshot(
                    await store.get<unknown>(CURRENT_DRAFT_KEY)
                ) ??
                parseLegacyBackup(legacyStorage.getItem(LEGACY_BACKUP_KEY))
            const drafts = migratedDraft
                ? [
                      {
                          localId: createId(),
                          content: migratedDraft.content,
                          createdAt: migratedDraft.updatedAt,
                          updatedAt: migratedDraft.updatedAt,
                      },
                  ]
                : []

            await store.set(LOCAL_DRAFT_COLLECTION_KEY, {
                version: 1,
                drafts,
            } satisfies LocalDraftCollection)
            try {
                await store.save()
            } catch (error) {
                await store.delete(LOCAL_DRAFT_COLLECTION_KEY)
                throw error
            }

            await store.delete(getDraftStoreKey(NEW_DRAFT_KEY))
            await store.delete(CURRENT_DRAFT_KEY)
            try {
                await store.save()
                if (migratedDraft) {
                    legacyStorage.removeItem(LEGACY_BACKUP_KEY)
                }
            } catch {
                // The migrated collection is already durable. Keep legacy
                // sources so a future launch can retry cleanup safely.
            }
        })()
        initializePromise = initialization.catch((error) => {
            initializePromise = undefined
            throw error
        })
        return initializePromise
    }

    const readLocalDrafts = async () => {
        await initializeLocalDrafts()
        const store = await getStore()
        return (
            parseLocalDraftCollection(
                await store.get<unknown>(LOCAL_DRAFT_COLLECTION_KEY)
            ) ?? {version: 1, drafts: []}
        )
    }

    const writeLocalDrafts = async (collection: LocalDraftCollection) => {
        const store = await getStore()
        await store.set(LOCAL_DRAFT_COLLECTION_KEY, {
            version: 1,
            drafts: sortLocalDrafts(collection.drafts),
        } satisfies LocalDraftCollection)
        await store.save()
    }

    const removeLocalDraft = (localId: string) =>
        enqueueMutation(async () => {
            const collection = await readLocalDrafts()
            await writeLocalDrafts({
                version: 1,
                drafts: collection.drafts.filter(
                    (draft) => draft.localId !== localId
                ),
            })
        })

    return {
        clear: async (documentKey) => {
            const localId = getLocalId(documentKey)
            if (localId) {
                await removeLocalDraft(localId)
                return
            }

            await enqueueMutation(async () => {
                const store = await getStore()
                await store.delete(getDraftStoreKey(documentKey))
                await store.save()
            })
        },
        createLocalDraft: (content = '') =>
            enqueueMutation(async () => {
                const collection = await readLocalDrafts()
                const timestamp = now()
                const draft: LocalDraft = {
                    localId: createId(),
                    content,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                }
                await writeLocalDrafts({
                    version: 1,
                    drafts: [draft, ...collection.drafts],
                })
                return draft
            }),
        listLocalDrafts: async () => {
            await mutationQueue
            return sortLocalDrafts((await readLocalDrafts()).drafts)
        },
        load: async (documentKey) => {
            const localId = getLocalId(documentKey)
            if (localId) {
                await mutationQueue
                const draft = (await readLocalDrafts()).drafts.find(
                    (candidate) => candidate.localId === localId
                )
                return draft
                    ? {
                          version: 1,
                          content: draft.content,
                          updatedAt: draft.updatedAt,
                      }
                    : null
            }

            const store = await getStore()
            return parseDraftSnapshot(
                await store.get<unknown>(getDraftStoreKey(documentKey))
            )
        },
        removeLocalDraft,
        save: async (documentKey, snapshot) => {
            const localId = getLocalId(documentKey)
            if (localId) {
                await enqueueMutation(async () => {
                    const collection = await readLocalDrafts()
                    const existing = collection.drafts.find(
                        (draft) => draft.localId === localId
                    )
                    const draft: LocalDraft = {
                        localId,
                        content: snapshot.content,
                        createdAt: existing?.createdAt ?? snapshot.updatedAt,
                        updatedAt: snapshot.updatedAt,
                    }
                    await writeLocalDrafts({
                        version: 1,
                        drafts: [
                            draft,
                            ...collection.drafts.filter(
                                (candidate) => candidate.localId !== localId
                            ),
                        ],
                    })
                })
                return
            }

            await enqueueMutation(async () => {
                const store = await getStore()
                await store.set(getDraftStoreKey(documentKey), snapshot)
                await store.save()
            })
        },
    }
}
