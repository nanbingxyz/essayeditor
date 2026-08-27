import {
    loadTauriStore,
    type StoreLoader,
} from '@/shared/platform/store'

const DRAFT_STORE_PATH = 'drafts.bin'
const CURRENT_DRAFT_KEY = 'currentDraft'
const LEGACY_BACKUP_KEY = 'backup'
const DRAFT_KEY_PREFIX = 'draft:'

export const NEW_DRAFT_KEY = 'new'

export interface DraftSnapshot {
    version: 1
    content: string
    updatedAt: number
}

export interface DraftRepository {
    clear: (documentKey: string) => Promise<void>
    load: (documentKey: string) => Promise<DraftSnapshot | null>
    save: (documentKey: string, draft: DraftSnapshot) => Promise<void>
}

export interface LegacyStorage {
    getItem: (key: string) => string | null
    removeItem: (key: string) => void
}

interface DraftRepositoryOptions {
    legacyStorage?: LegacyStorage
    loadStore?: StoreLoader
}

function isFiniteTimestamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
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
    legacyStorage = window.localStorage,
    loadStore = loadTauriStore,
}: DraftRepositoryOptions = {}): DraftRepository {
    let storePromise: ReturnType<StoreLoader> | undefined
    const getStore = () => {
        storePromise ??= loadStore(DRAFT_STORE_PATH)
        return storePromise
    }

    const getDraftStoreKey = (documentKey: string) =>
        `${DRAFT_KEY_PREFIX}${documentKey}`

    const save = async (documentKey: string, draft: DraftSnapshot) => {
        const store = await getStore()
        await store.set(getDraftStoreKey(documentKey), draft)
        await store.save()
    }

    return {
        clear: async (documentKey) => {
            const store = await getStore()
            await store.delete(getDraftStoreKey(documentKey))
            await store.save()
        },
        load: async (documentKey) => {
            try {
                const store = await getStore()
                const storedDraft = parseDraftSnapshot(
                    await store.get<unknown>(getDraftStoreKey(documentKey))
                )
                if (storedDraft) {
                    return storedDraft
                }

                if (documentKey === NEW_DRAFT_KEY) {
                    const oldCurrentDraft = parseDraftSnapshot(
                        await store.get<unknown>(CURRENT_DRAFT_KEY)
                    )
                    if (oldCurrentDraft) {
                        await store.set(
                            getDraftStoreKey(NEW_DRAFT_KEY),
                            oldCurrentDraft
                        )
                        await store.delete(CURRENT_DRAFT_KEY)
                        await store.save()
                        return oldCurrentDraft
                    }
                }
            } catch {
                if (documentKey !== NEW_DRAFT_KEY) {
                    throw new Error('Unable to load the draft store')
                }
                const legacyDraft = parseLegacyBackup(
                    legacyStorage.getItem(LEGACY_BACKUP_KEY)
                )
                if (legacyDraft) {
                    return legacyDraft
                }
                throw new Error('Unable to load the draft store')
            }

            if (documentKey !== NEW_DRAFT_KEY) {
                return null
            }

            const legacyDraft = parseLegacyBackup(
                legacyStorage.getItem(LEGACY_BACKUP_KEY)
            )
            if (!legacyDraft) {
                return null
            }

            try {
                await save(NEW_DRAFT_KEY, legacyDraft)
                legacyStorage.removeItem(LEGACY_BACKUP_KEY)
            } catch {
                // Keep the legacy backup until a future migration succeeds.
            }
            return legacyDraft
        },
        save,
    }
}
