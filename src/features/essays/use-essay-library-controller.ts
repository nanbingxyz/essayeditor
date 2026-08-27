import {useCallback, useEffect, useRef, useState} from 'react'

import type {DraftRepository} from '@/features/editor'

import {
    PAGE_SIZE,
    type EssayLibraryClient,
    type EssayListItem,
} from './essay-library-client'

export interface EssayListEntry extends EssayListItem {
    localContent?: string
}

interface EssayLibraryControllerOptions {
    accessToken: string
    client: EssayLibraryClient
    date: string | null
    draftRepository: DraftRepository
    enabled: boolean
    onError: (message: string) => void
    userId: string
}

export function useEssayLibraryController({
    accessToken,
    client,
    date,
    draftRepository,
    enabled,
    onError,
    userId,
}: EssayLibraryControllerOptions) {
    const [entries, setEntries] = useState<EssayListEntry[]>([])
    const [error, setError] = useState<string | null>(null)
    const [hasMore, setHasMore] = useState(false)
    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [moreError, setMoreError] = useState<string | null>(null)
    const [page, setPage] = useState(0)
    const [refreshing, setRefreshing] = useState(false)
    const [refreshVersion, setRefreshVersion] = useState(0)
    const abortRef = useRef<AbortController>()
    const entriesRef = useRef<EssayListEntry[]>([])
    const generationRef = useRef(0)
    const onErrorRef = useRef(onError)
    const hasMoreRef = useRef(false)
    const loadingMoreRef = useRef(false)
    const pageRef = useRef(0)
    const queryKeyRef = useRef<string | null>(null)
    const refreshRequestedRef = useRef(false)
    const refreshingRef = useRef(false)

    onErrorRef.current = onError
    entriesRef.current = entries
    hasMoreRef.current = hasMore
    loadingMoreRef.current = loadingMore
    pageRef.current = page
    refreshingRef.current = refreshing

    const hydrateEntries = useCallback(
        async (essays: EssayListItem[]) =>
            Promise.all(
                essays.map(async (essay): Promise<EssayListEntry> => {
                    const key = `essay:${essay.id}`
                    const draft = await draftRepository.load(key)
                    if (!draft || draft.content === essay.content) {
                        if (draft?.content === essay.content) {
                            void draftRepository.clear(key).catch(() => undefined)
                        }
                        return essay
                    }
                    return {...essay, localContent: draft.content}
                })
            ),
        [draftRepository]
    )

    useEffect(() => {
        abortRef.current?.abort()
        const generation = ++generationRef.current
        const queryKey = enabled
            ? JSON.stringify([accessToken, date, userId])
            : null
        const isRefresh =
            refreshRequestedRef.current && queryKeyRef.current === queryKey
        const hadEntries = entriesRef.current.length > 0
        refreshRequestedRef.current = false
        queryKeyRef.current = queryKey

        if (!enabled || !accessToken || !userId) {
            setEntries([])
            setError(null)
            setHasMore(false)
            setLoading(false)
            setLoadingMore(false)
            setMoreError(null)
            setPage(0)
            setRefreshing(false)
            return
        }

        const abortController = new AbortController()
        abortRef.current = abortController
        setError(null)
        setHasMore(false)
        setLoadingMore(false)
        setMoreError(null)
        setPage(0)
        if (isRefresh) {
            setLoading(false)
            setRefreshing(true)
        } else {
            setEntries([])
            setLoading(true)
            setRefreshing(false)
        }

        void client
            .list({
                accessToken,
                date,
                page: 1,
                signal: abortController.signal,
                userId,
            })
            .then(async (nextEntries) => ({
                entries: await hydrateEntries(
                    nextEntries.slice(0, PAGE_SIZE)
                ),
                hasMore: nextEntries.length > PAGE_SIZE,
            }))
            .then(({entries: nextEntries, hasMore: nextHasMore}) => {
                if (
                    abortController.signal.aborted ||
                    generation !== generationRef.current
                ) {
                    return
                }
                setEntries(nextEntries)
                setHasMore(nextHasMore)
                setPage(1)
                setLoading(false)
                setRefreshing(false)
            })
            .catch((requestError: unknown) => {
                if (
                    abortController.signal.aborted ||
                    generation !== generationRef.current
                ) {
                    return
                }
                const message =
                    requestError instanceof Error
                        ? requestError.message
                        : '无法加载文章，请稍后重试'
                setError(isRefresh && hadEntries ? null : message)
                setLoading(false)
                setRefreshing(false)
                onErrorRef.current(message)
            })

        return () => abortController.abort()
    }, [
        accessToken,
        client,
        date,
        enabled,
        hydrateEntries,
        refreshVersion,
        userId,
    ])

    const loadMore = useCallback(async () => {
        if (
            !enabled ||
            !hasMoreRef.current ||
            loadingMoreRef.current ||
            refreshingRef.current ||
            !accessToken ||
            !userId
        ) {
            return
        }

        loadingMoreRef.current = true
        setLoadingMore(true)
        setMoreError(null)
        const generation = generationRef.current
        const nextPage = pageRef.current + 1
        const abortController = new AbortController()
        abortRef.current = abortController

        try {
            const responseEntries = await client.list({
                accessToken,
                date,
                page: nextPage,
                signal: abortController.signal,
                userId,
            })
            const nextEntries = await hydrateEntries(
                responseEntries.slice(0, PAGE_SIZE)
            )
            if (
                abortController.signal.aborted ||
                generation !== generationRef.current
            ) {
                return
            }
            const existingIds = new Set(
                entriesRef.current.map(({id}) => id)
            )
            const uniqueNextEntries = nextEntries.filter(
                ({id}) => !existingIds.has(id)
            )
            setEntries((current) => [...current, ...uniqueNextEntries])
            setHasMore(responseEntries.length > PAGE_SIZE)
            setPage(nextPage)
        } catch (requestError) {
            if (
                abortController.signal.aborted ||
                generation !== generationRef.current
            ) {
                return
            }
            const message =
                requestError instanceof Error
                    ? requestError.message
                    : '无法加载更多文章'
            setMoreError(message)
        } finally {
            if (generation === generationRef.current) {
                loadingMoreRef.current = false
                setLoadingMore(false)
            }
        }
    }, [accessToken, client, date, enabled, hydrateEntries, userId])

    const refresh = useCallback(() => {
        if (
            !enabled ||
            !accessToken ||
            !userId ||
            refreshingRef.current
        ) {
            return
        }
        refreshRequestedRef.current = true
        refreshingRef.current = true
        setRefreshing(true)
        setRefreshVersion((version) => version + 1)
    }, [accessToken, enabled, userId])

    const retry = useCallback(() => {
        if (entries.length === 0) {
            refresh()
        } else {
            void loadMore()
        }
    }, [entries.length, loadMore, refresh])

    const setLocalContent = useCallback(
        (essayId: string, localContent: string | null) => {
            setEntries((current) =>
                current.map((entry) =>
                    entry.id === essayId
                        ? {
                              ...entry,
                              localContent: localContent ?? undefined,
                          }
                        : entry
                )
            )
        },
        []
    )

    const commitUpdate = useCallback((essayId: string, content: string) => {
        setEntries((current) =>
            current.map((entry) =>
                entry.id === essayId
                    ? {id: entry.id, content}
                    : entry
            )
        )
    }, [])

    const commitPublish = useCallback((essayId: string, content: string) => {
        setEntries((current) => [
            {id: essayId, content},
            ...current.filter((entry) => entry.id !== essayId),
        ])
    }, [])

    const commitRemove = useCallback((essayId: string) => {
        setEntries((current) =>
            current.filter((entry) => entry.id !== essayId)
        )
    }, [])

    return {
        commitPublish,
        commitRemove,
        commitUpdate,
        entries,
        error,
        hasMore,
        loadMore,
        loading,
        loadingMore,
        moreError,
        refresh,
        refreshing,
        retry,
        setLocalContent,
    }
}
