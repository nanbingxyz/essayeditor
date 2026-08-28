import {loadTauriStore, type StoreLoader} from '@/shared/platform/store'

import type {Note, NoteFolder} from './note-client'

const CACHE_STORE_PATH = 'notes.bin'
const CACHE_COLLECTION_KEY = 'noteSnapshots'

export interface NoteCacheSnapshot {
    folders: NoteFolder[]
    foldersFetchedAt: number
    notes: Note[]
    notesFetchedAt: number
    notesHasMore: boolean
}

export interface NoteCacheRepository {
    load: (accessToken: string) => Promise<NoteCacheSnapshot | null>
    saveFolders: (
        accessToken: string,
        folders: NoteFolder[],
        fetchedAt: number
    ) => Promise<void>
    saveNotes: (
        accessToken: string,
        notes: Note[],
        hasMore: boolean,
        fetchedAt: number
    ) => Promise<void>
}

interface StoredSnapshot extends NoteCacheSnapshot {
    account: string
}

interface StoredCollection {
    version: 1
    snapshots: StoredSnapshot[]
}

interface NoteCacheRepositoryOptions {
    fingerprint?: (accessToken: string) => Promise<string>
    loadStore?: StoreLoader
}

function isTimestamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function parseFolder(value: unknown): NoteFolder | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const candidate = value as Partial<NoteFolder>
    return typeof candidate.id === 'string' && candidate.id &&
        typeof candidate.name === 'string' && candidate.name
        ? {id: candidate.id, name: candidate.name}
        : null
}

function parseNote(value: unknown): Note | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const candidate = value as Partial<Note>
    if (
        typeof candidate.id !== 'string' ||
        !candidate.id ||
        typeof candidate.content !== 'string' ||
        typeof candidate.createdAt !== 'string' ||
        !candidate.createdAt ||
        !Array.isArray(candidate.comments)
    ) {
        return null
    }
    const folder = candidate.folder === null ? null : parseFolder(candidate.folder)
    if (candidate.folder !== null && !folder) {
        return null
    }
    const comments = candidate.comments.map((comment) => {
        if (
            !comment ||
            typeof comment.id !== 'number' ||
            !Number.isInteger(comment.id) ||
            typeof comment.content !== 'string' ||
            typeof comment.createdAt !== 'string' ||
            !comment.createdAt
        ) {
            return null
        }
        return {...comment}
    })
    if (comments.some((comment) => comment === null)) {
        return null
    }
    return {
        id: candidate.id,
        content: candidate.content,
        createdAt: candidate.createdAt,
        folder,
        comments: comments as Note['comments'],
    }
}

function parseSnapshot(value: unknown): StoredSnapshot | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const candidate = value as Partial<StoredSnapshot>
    if (
        typeof candidate.account !== 'string' ||
        !candidate.account ||
        !isTimestamp(candidate.foldersFetchedAt) ||
        !isTimestamp(candidate.notesFetchedAt) ||
        typeof candidate.notesHasMore !== 'boolean' ||
        !Array.isArray(candidate.folders) ||
        !Array.isArray(candidate.notes)
    ) {
        return null
    }
    const folders = candidate.folders.map(parseFolder)
    const notes = candidate.notes.map(parseNote)
    if (
        folders.some((folder) => folder === null) ||
        notes.some((note) => note === null)
    ) {
        return null
    }
    return {
        account: candidate.account,
        folders: folders as NoteFolder[],
        foldersFetchedAt: candidate.foldersFetchedAt,
        notes: notes as Note[],
        notesFetchedAt: candidate.notesFetchedAt,
        notesHasMore: candidate.notesHasMore,
    }
}

function parseCollection(value: unknown): StoredCollection | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const candidate = value as Partial<StoredCollection>
    if (candidate.version !== 1 || !Array.isArray(candidate.snapshots)) {
        return null
    }
    const snapshots = candidate.snapshots.map(parseSnapshot)
    if (snapshots.some((snapshot) => snapshot === null)) {
        return null
    }
    return {version: 1, snapshots: snapshots as StoredSnapshot[]}
}

async function createTokenFingerprint(accessToken: string) {
    const encoded = new TextEncoder().encode(accessToken)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, '0')
    ).join('')
}

function cloneSnapshot(snapshot: StoredSnapshot): NoteCacheSnapshot {
    return {
        folders: snapshot.folders.map((folder) => ({...folder})),
        foldersFetchedAt: snapshot.foldersFetchedAt,
        notes: snapshot.notes.map((note) => ({
            ...note,
            folder: note.folder ? {...note.folder} : null,
            comments: note.comments.map((comment) => ({...comment})),
        })),
        notesFetchedAt: snapshot.notesFetchedAt,
        notesHasMore: snapshot.notesHasMore,
    }
}

export function createNoteCacheRepository({
    fingerprint = createTokenFingerprint,
    loadStore = loadTauriStore,
}: NoteCacheRepositoryOptions = {}): NoteCacheRepository {
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

    const mutate = (
        accessToken: string,
        update: (current: StoredSnapshot | null, account: string) => StoredSnapshot
    ) => {
        const result = mutationQueue.then(async () => {
            const account = await fingerprint(accessToken)
            const collection = await readCollection()
            const current =
                collection.snapshots.find(
                    (snapshot) => snapshot.account === account
                ) ?? null
            const next = update(current, account)
            const store = await getStore()
            await store.set(CACHE_COLLECTION_KEY, {
                version: 1,
                snapshots: [
                    ...collection.snapshots.filter(
                        (snapshot) => snapshot.account !== account
                    ),
                    next,
                ],
            })
            await store.save()
        })
        mutationQueue = result.then(
            () => undefined,
            () => undefined
        )
        return result
    }

    const emptySnapshot = (account: string): StoredSnapshot => ({
        account,
        folders: [],
        foldersFetchedAt: 0,
        notes: [],
        notesFetchedAt: 0,
        notesHasMore: false,
    })

    return {
        load: async (accessToken) => {
            const account = await fingerprint(accessToken)
            await mutationQueue
            const collection = await readCollection()
            const snapshot = collection.snapshots.find(
                (candidate) => candidate.account === account
            )
            return snapshot ? cloneSnapshot(snapshot) : null
        },
        saveFolders: (accessToken, folders, fetchedAt) =>
            mutate(accessToken, (current, account) => ({
                ...(current ?? emptySnapshot(account)),
                folders: folders.map((folder) => ({...folder})),
                foldersFetchedAt: fetchedAt,
            })),
        saveNotes: (accessToken, notes, hasMore, fetchedAt) =>
            mutate(accessToken, (current, account) => ({
                ...(current ?? emptySnapshot(account)),
                notes: notes.map((note) => ({
                    ...note,
                    folder: note.folder ? {...note.folder} : null,
                    comments: note.comments.map((comment) => ({...comment})),
                })),
                notesFetchedAt: fetchedAt,
                notesHasMore: hasMore,
            })),
    }
}
