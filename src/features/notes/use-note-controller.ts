import {useCallback, useEffect, useRef, useState} from 'react'

import type {NoteCacheRepository} from './note-cache-repository'
import {
    NOTE_PAGE_SIZE,
    type Note,
    type NoteClient,
    type NoteFolder,
} from './note-client'

const HOUR = 60 * 60 * 1000

export const NOTE_CACHE_TTL = 4 * HOUR
export const NOTE_FOLDER_CACHE_TTL = 8 * HOUR

interface NoteControllerOptions {
    accessToken: string
    active: boolean
    cacheRepository: NoteCacheRepository
    client: NoteClient
    enabled: boolean
    now?: () => number
    onError: (message: string) => void
}

function isValidCache(fetchedAt: number, ttl: number, timestamp: number) {
    const age = timestamp - fetchedAt
    return age >= 0 && age <= ttl
}

export function useNoteController({
    accessToken,
    active,
    cacheRepository,
    client,
    enabled,
    now = Date.now,
    onError,
}: NoteControllerOptions) {
    const [notes, setNotes] = useState<Note[]>([])
    const [folders, setFolders] = useState<NoteFolder[]>([])
    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [moreError, setMoreError] = useState<string | null>(null)
    const [hasMore, setHasMore] = useState(false)
    const [mutating, setMutating] = useState(false)
    const notesRef = useRef<Note[]>([])
    const foldersRef = useRef<NoteFolder[]>([])
    const pageRef = useRef(0)
    const hasMoreRef = useRef(false)
    const startedRef = useRef(false)
    const generationRef = useRef(0)
    const firstPageBusyRef = useRef(false)
    const loadingMoreRef = useRef(false)
    const refreshingRef = useRef(false)
    const mutatingRef = useRef(false)
    const onErrorRef = useRef(onError)
    const abortControllersRef = useRef(new Set<AbortController>())

    notesRef.current = notes
    foldersRef.current = folders
    hasMoreRef.current = hasMore
    onErrorRef.current = onError

    const setCurrentNotes = useCallback((next: Note[]) => {
        notesRef.current = next
        setNotes(next)
    }, [])

    const setCurrentFolders = useCallback((next: NoteFolder[]) => {
        foldersRef.current = next
        setFolders(next)
    }, [])

    const setCurrentHasMore = useCallback((next: boolean) => {
        hasMoreRef.current = next
        setHasMore(next)
    }, [])

    const createAbortController = () => {
        const controller = new AbortController()
        abortControllersRef.current.add(controller)
        return controller
    }

    const releaseAbortController = (controller: AbortController) => {
        abortControllersRef.current.delete(controller)
    }

    useEffect(() => {
        generationRef.current += 1
        startedRef.current = false
        firstPageBusyRef.current = false
        loadingMoreRef.current = false
        refreshingRef.current = false
        mutatingRef.current = false
        abortControllersRef.current.forEach((controller) => controller.abort())
        abortControllersRef.current.clear()
        setCurrentNotes([])
        setCurrentFolders([])
        setCurrentHasMore(false)
        pageRef.current = 0
        setLoading(false)
        setLoadingMore(false)
        setRefreshing(false)
        setError(null)
        setMoreError(null)
        setMutating(false)
    }, [accessToken, enabled, setCurrentFolders, setCurrentHasMore, setCurrentNotes])

    useEffect(
        () => () => {
            abortControllersRef.current.forEach((controller) =>
                controller.abort()
            )
        },
        []
    )

    const saveFirstPage = useCallback(
        (nextNotes: Note[], nextHasMore: boolean, fetchedAt: number) => {
            if (!accessToken) {
                return
            }
            void cacheRepository
                .saveNotes(
                    accessToken,
                    nextNotes.slice(0, NOTE_PAGE_SIZE),
                    nextHasMore,
                    fetchedAt
                )
                .catch(() => undefined)
        },
        [accessToken, cacheRepository]
    )

    const fetchFirstPage = useCallback(
        async (showRefreshState: boolean, preserve: Note[] = []) => {
            if (
                !enabled ||
                !accessToken ||
                firstPageBusyRef.current ||
                loadingMoreRef.current
            ) {
                return false
            }
            firstPageBusyRef.current = true
            const generation = generationRef.current
            const hadNotes = notesRef.current.length > 0
            const controller = createAbortController()
            setError(null)
            setMoreError(null)
            if (!hadNotes) {
                setLoading(true)
            }
            if (showRefreshState) {
                refreshingRef.current = true
                setRefreshing(true)
            }
            try {
                const result = await client.list(
                    1,
                    accessToken,
                    controller.signal
                )
                if (
                    controller.signal.aborted ||
                    generation !== generationRef.current
                ) {
                    return false
                }
                const remoteIds = new Set(result.data.map((note) => note.id))
                const nextNotes = [
                    ...preserve.filter((note) => !remoteIds.has(note.id)),
                    ...result.data,
                ]
                setCurrentNotes(nextNotes)
                setCurrentHasMore(result.meta.hasMore)
                pageRef.current = result.meta.page
                setLoading(false)
                saveFirstPage(nextNotes, result.meta.hasMore, now())
                return true
            } catch (requestError) {
                if (
                    controller.signal.aborted ||
                    generation !== generationRef.current
                ) {
                    return false
                }
                const message =
                    requestError instanceof Error
                        ? requestError.message
                        : '无法加载笔记，请稍后重试'
                if (!hadNotes) {
                    setError(message)
                    setLoading(false)
                }
                onErrorRef.current(message)
                return false
            } finally {
                releaseAbortController(controller)
                if (generation === generationRef.current) {
                    firstPageBusyRef.current = false
                    if (showRefreshState) {
                        refreshingRef.current = false
                        setRefreshing(false)
                    }
                }
            }
        },
        [accessToken, client, enabled, now, saveFirstPage, setCurrentHasMore, setCurrentNotes]
    )

    const fetchFolders = useCallback(
        async (reportError: boolean) => {
            if (!enabled || !accessToken) {
                return false
            }
            const generation = generationRef.current
            const controller = createAbortController()
            try {
                const nextFolders = await client.listFolders(
                    accessToken,
                    controller.signal
                )
                if (
                    controller.signal.aborted ||
                    generation !== generationRef.current
                ) {
                    return false
                }
                const fetchedAt = now()
                setCurrentFolders(nextFolders)
                void cacheRepository
                    .saveFolders(accessToken, nextFolders, fetchedAt)
                    .catch(() => undefined)
                return true
            } catch (requestError) {
                if (
                    controller.signal.aborted ||
                    generation !== generationRef.current
                ) {
                    return false
                }
                if (reportError) {
                    onErrorRef.current(
                        requestError instanceof Error
                            ? requestError.message
                            : '无法加载笔记文件夹'
                    )
                }
                return false
            } finally {
                releaseAbortController(controller)
            }
        },
        [accessToken, cacheRepository, client, enabled, now, setCurrentFolders]
    )

    useEffect(() => {
        if (
            !active ||
            !enabled ||
            !accessToken ||
            startedRef.current
        ) {
            return
        }
        startedRef.current = true
        const generation = generationRef.current
        setLoading(true)

        void cacheRepository
            .load(accessToken)
            .catch(() => null)
            .then(async (snapshot) => {
                if (generation !== generationRef.current) {
                    return
                }
                const timestamp = now()
                const validNotes = Boolean(
                    snapshot &&
                        isValidCache(
                            snapshot.notesFetchedAt,
                            NOTE_CACHE_TTL,
                            timestamp
                        )
                )
                const validFolders = Boolean(
                    snapshot &&
                        isValidCache(
                            snapshot.foldersFetchedAt,
                            NOTE_FOLDER_CACHE_TTL,
                            timestamp
                        )
                )
                if (snapshot && validNotes) {
                    setCurrentNotes(snapshot.notes)
                    setCurrentHasMore(snapshot.notesHasMore)
                    pageRef.current = 1
                    setLoading(false)
                }
                if (snapshot && validFolders) {
                    setCurrentFolders(snapshot.folders)
                }

                const tasks: Promise<boolean>[] = [fetchFirstPage(false)]
                if (!validFolders) {
                    tasks.push(fetchFolders(true))
                }
                await Promise.allSettled(tasks)
            })
    }, [
        accessToken,
        active,
        cacheRepository,
        enabled,
        fetchFirstPage,
        fetchFolders,
        now,
        setCurrentFolders,
        setCurrentHasMore,
        setCurrentNotes,
    ])

    const refresh = useCallback(async () => {
        if (
            !enabled ||
            !accessToken ||
            refreshingRef.current ||
            loadingMoreRef.current
        ) {
            return
        }
        refreshingRef.current = true
        setRefreshing(true)
        await Promise.allSettled([
            fetchFirstPage(false),
            fetchFolders(true),
        ])
        refreshingRef.current = false
        setRefreshing(false)
    }, [accessToken, enabled, fetchFirstPage, fetchFolders])

    const loadMore = useCallback(async () => {
        if (
            !enabled ||
            !accessToken ||
            !hasMoreRef.current ||
            loadingMoreRef.current ||
            firstPageBusyRef.current
        ) {
            return
        }
        loadingMoreRef.current = true
        setLoadingMore(true)
        setMoreError(null)
        const generation = generationRef.current
        const controller = createAbortController()
        try {
            const result = await client.list(
                pageRef.current + 1,
                accessToken,
                controller.signal
            )
            if (
                controller.signal.aborted ||
                generation !== generationRef.current
            ) {
                return
            }
            const existingIds = new Set(notesRef.current.map((note) => note.id))
            const next = [
                ...notesRef.current,
                ...result.data.filter((note) => !existingIds.has(note.id)),
            ]
            setCurrentNotes(next)
            setCurrentHasMore(result.meta.hasMore)
            pageRef.current = result.meta.page
        } catch (requestError) {
            if (
                controller.signal.aborted ||
                generation !== generationRef.current
            ) {
                return
            }
            setMoreError(
                requestError instanceof Error
                    ? requestError.message
                    : '无法加载更多笔记'
            )
        } finally {
            releaseAbortController(controller)
            if (generation === generationRef.current) {
                loadingMoreRef.current = false
                setLoadingMore(false)
            }
        }
    }, [accessToken, client, enabled, setCurrentHasMore, setCurrentNotes])

    const createNote = useCallback(
        async (content: string, folderId: string | null) => {
            if (!enabled || !accessToken || mutatingRef.current) {
                return false
            }
            mutatingRef.current = true
            setMutating(true)
            try {
                const id = await client.create(content, folderId, accessToken)
                const folder =
                    foldersRef.current.find((entry) => entry.id === folderId) ??
                    null
                const optimistic: Note = {
                    id,
                    content,
                    createdAt: new Date(now()).toISOString(),
                    folder,
                    comments: [],
                }
                const next = [
                    optimistic,
                    ...notesRef.current.filter((note) => note.id !== id),
                ]
                setCurrentNotes(next)
                saveFirstPage(next, hasMoreRef.current, now())
                void fetchFirstPage(false, [optimistic])
                return true
            } catch (requestError) {
                onErrorRef.current(
                    requestError instanceof Error
                        ? requestError.message
                        : '创建笔记失败，请稍后重试'
                )
                return false
            } finally {
                mutatingRef.current = false
                setMutating(false)
            }
        },
        [accessToken, client, enabled, fetchFirstPage, now, saveFirstPage, setCurrentNotes]
    )

    const updateNote = useCallback(
        async (noteId: string, content: string, folderId: string | null) => {
            if (!enabled || !accessToken || mutatingRef.current) {
                return false
            }
            mutatingRef.current = true
            setMutating(true)
            try {
                await client.update(noteId, content, folderId, accessToken)
                const folder =
                    foldersRef.current.find((entry) => entry.id === folderId) ??
                    null
                const next = notesRef.current.map((note) =>
                    note.id === noteId ? {...note, content, folder} : note
                )
                setCurrentNotes(next)
                saveFirstPage(next, hasMoreRef.current, now())
                return true
            } catch (requestError) {
                onErrorRef.current(
                    requestError instanceof Error
                        ? requestError.message
                        : '更新笔记失败，请稍后重试'
                )
                return false
            } finally {
                mutatingRef.current = false
                setMutating(false)
            }
        },
        [accessToken, client, enabled, now, saveFirstPage, setCurrentNotes]
    )

    const removeNote = useCallback(
        async (noteId: string) => {
            if (!enabled || !accessToken || mutatingRef.current) {
                return false
            }
            mutatingRef.current = true
            setMutating(true)
            try {
                await client.remove(noteId, accessToken)
                const next = notesRef.current.filter((note) => note.id !== noteId)
                setCurrentNotes(next)
                saveFirstPage(next, hasMoreRef.current, now())
                return true
            } catch (requestError) {
                onErrorRef.current(
                    requestError instanceof Error
                        ? requestError.message
                        : '删除笔记失败，请稍后重试'
                )
                return false
            } finally {
                mutatingRef.current = false
                setMutating(false)
            }
        },
        [accessToken, client, enabled, now, saveFirstPage, setCurrentNotes]
    )

    return {
        createNote,
        error,
        folders,
        hasMore,
        loadMore,
        loading,
        loadingMore,
        moreError,
        mutating,
        notes,
        refresh,
        refreshing,
        removeNote,
        retry: moreError ? loadMore : () => fetchFirstPage(true),
        updateNote,
    }
}
