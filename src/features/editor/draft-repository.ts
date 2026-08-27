import {
    loadTauriStore,
    type StoreLoader,
} from '@/shared/platform/store'

const DRAFT_STORE_PATH = 'drafts.bin'
const CURRENT_DRAFT_KEY = 'currentDraft'
const LEGACY_BACKUP_KEY = 'backup'

export interface DraftSnapshot {
    version: 1
    content: string
    updatedAt: number
}

export interface DraftRepository {
    clear: () => Promise<void>
    load: () => Promise<DraftSnapshot | null>
    save: (draft: DraftSnapshot) => Promise<void>
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

    const save = async (draft: DraftSnapshot) => {
        const store = await getStore()
        await store.set(CURRENT_DRAFT_KEY, draft)
        await store.save()
    }

    return {
        clear: async () => {
            const store = await getStore()
            await store.delete(CURRENT_DRAFT_KEY)
            await store.save()
        },
        load: async () => {
            try {
                const store = await getStore()
                const storedDraft = parseDraftSnapshot(
                    await store.get<unknown>(CURRENT_DRAFT_KEY)
                )
                if (storedDraft) {
                    return storedDraft
                }
            } catch {
                const legacyDraft = parseLegacyBackup(
                    legacyStorage.getItem(LEGACY_BACKUP_KEY)
                )
                if (legacyDraft) {
                    return legacyDraft
                }
                throw new Error('Unable to load the draft store')
            }

            const legacyDraft = parseLegacyBackup(
                legacyStorage.getItem(LEGACY_BACKUP_KEY)
            )
            if (!legacyDraft) {
                return null
            }

            try {
                await save(legacyDraft)
                legacyStorage.removeItem(LEGACY_BACKUP_KEY)
            } catch {
                // Keep the legacy backup until a future migration succeeds.
            }
            return legacyDraft
        },
        save,
    }
}
