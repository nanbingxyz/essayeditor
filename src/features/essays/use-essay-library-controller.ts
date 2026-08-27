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
    const [refreshVersion, setRefreshVersion] = useState(0)
    const abortRef = useRef<AbortController>()
    const generationRef = useRef(0)
    const onErrorRef = useRef(onError)
    const hasMoreRef = useRef(false)
    const loadingMoreRef = useRef(false)
    const pageRef = useRef(0)

    onErrorRef.current = onError
    hasMoreRef.current = hasMore
    loadingMoreRef.current = loadingMore
    pageRef.current = page

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

        if (!enabled || !accessToken || !userId) {
            setEntries([])
            setError(null)
            setHasMore(false)
            setLoading(false)
            setLoadingMore(false)
            setMoreError(null)
            setPage(0)
            return
        }

        const abortController = new AbortController()
        abortRef.current = abortController
        setEntries([])
        setError(null)
        setHasMore(false)
        setLoading(true)
        setLoadingMore(false)
        setMoreError(null)
        setPage(0)

        void client
            .list({
                accessToken,
                date,
                page: 1,
                signal: abortController.signal,
                userId,
            })
            .then(hydrateEntries)
            .then((nextEntries) => {
                if (
                    abortController.signal.aborted ||
                    generation !== generationRef.current
                ) {
                    return
                }
                setEntries(nextEntries)
                setHasMore(nextEntries.length === PAGE_SIZE)
                setPage(1)
                setLoading(false)
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
                setError(message)
                setLoading(false)
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
            const nextEntries = await hydrateEntries(
                await client.list({
                    accessToken,
                    date,
                    page: nextPage,
                    signal: abortController.signal,
                    userId,
                })
            )
            if (
                abortController.signal.aborted ||
                generation !== generationRef.current
            ) {
                return
            }
            setEntries((current) => {
                const existingIds = new Set(current.map(({id}) => id))
                return [
                    ...current,
                    ...nextEntries.filter(({id}) => !existingIds.has(id)),
                ]
            })
            setHasMore(nextEntries.length === PAGE_SIZE)
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
        setRefreshVersion((version) => version + 1)
    }, [])

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

    return {
        commitUpdate,
        entries,
        error,
        hasMore,
        loadMore,
        loading,
        loadingMore,
        moreError,
        refresh,
        retry,
        setLocalContent,
    }
}
