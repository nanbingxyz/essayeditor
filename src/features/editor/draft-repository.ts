import {
    loadTauriStore,
    type StoreLoader,
} from '@/shared/platform/store'

const DRAFT_STORE_PATH = 'drafts.bin'
const DRAFT_KEY_PREFIX = 'draft:'
const LOCAL_DRAFT_KEY_PREFIX = 'local:'
const LOCAL_DRAFT_COLLECTION_KEY = 'localDrafts'

export interface DraftSnapshot {
    version: 2
    content: string
    themeId: number | null
    updatedAt: number
}

export interface LocalDraft {
    localId: string
    content: string
    createdAt: number
    themeId: number | null
    updatedAt: number
}

interface LocalDraftCollection {
    version: 2
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

interface DraftRepositoryOptions {
    createId?: () => string
    loadStore?: StoreLoader
    now?: () => number
}

function isFiniteTimestamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function parseThemeId(value: unknown) {
    return value === null
        ? null
        : typeof value === 'number' &&
            Number.isFinite(value) &&
            Number.isInteger(value)
          ? value
          : undefined
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
    const themeId = parseThemeId(candidate.themeId)
    if (
        typeof candidate.localId !== 'string' ||
        !candidate.localId ||
        typeof candidate.content !== 'string' ||
        !isFiniteTimestamp(candidate.createdAt) ||
        !isFiniteTimestamp(candidate.updatedAt) ||
        themeId === undefined
    ) {
        return null
    }

    return {
        localId: candidate.localId,
        content: candidate.content,
        createdAt: candidate.createdAt,
        themeId,
        updatedAt: candidate.updatedAt,
    }
}

function parseLocalDraftCollection(value: unknown): LocalDraftCollection | null {
    if (!value || typeof value !== 'object') {
        return null
    }

    const candidate = value as Partial<LocalDraftCollection>
    if (candidate.version !== 2 || !Array.isArray(candidate.drafts)) {
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

    return {version: 2, drafts: sortLocalDrafts(drafts)}
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
    const themeId = parseThemeId(candidate.themeId)
    if (
        candidate.version !== 2 ||
        typeof candidate.content !== 'string' ||
        !isFiniteTimestamp(candidate.updatedAt) ||
        themeId === undefined
    ) {
        return null
    }

    return {
        version: 2,
        content: candidate.content,
        themeId,
        updatedAt: candidate.updatedAt,
    }
}

export function createDraftRepository({
    createId = createDefaultId,
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
                return
            }
            if (storedCollection !== undefined) {
                throw new Error('Unable to read the local draft collection')
            }
            await store.set(LOCAL_DRAFT_COLLECTION_KEY, {
                version: 2,
                drafts: [],
            } satisfies LocalDraftCollection)
            await store.save()
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
            ) ?? {version: 2, drafts: []}
        )
    }

    const writeLocalDrafts = async (collection: LocalDraftCollection) => {
        const store = await getStore()
        await store.set(LOCAL_DRAFT_COLLECTION_KEY, {
            version: 2,
            drafts: sortLocalDrafts(collection.drafts),
        } satisfies LocalDraftCollection)
        await store.save()
    }

    const removeLocalDraft = (localId: string) =>
        enqueueMutation(async () => {
            const collection = await readLocalDrafts()
            await writeLocalDrafts({
                version: 2,
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
                    themeId: null,
                    updatedAt: timestamp,
                }
                await writeLocalDrafts({
                    version: 2,
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
                          version: 2,
                          content: draft.content,
                          themeId: draft.themeId,
                          updatedAt: draft.updatedAt,
                      }
                    : null
            }

            await mutationQueue
            const store = await getStore()
            const storeKey = getDraftStoreKey(documentKey)
            const value = await store.get<unknown>(storeKey)
            return parseDraftSnapshot(value)
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
                        themeId: snapshot.themeId,
                        updatedAt: snapshot.updatedAt,
                    }
                    await writeLocalDrafts({
                        version: 2,
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
