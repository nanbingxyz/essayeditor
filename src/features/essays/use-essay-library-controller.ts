import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import type {DraftRepository} from '@/features/editor'

import {
    ALL_ESSAYS_QUERY_KEY,
    type EssayLibraryCacheRepository,
} from './essay-library-cache-repository'
import {
    PAGE_SIZE,
    type EssayLibraryClient,
    type EssayListItem,
} from './essay-library-client'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const ALL_ESSAYS_CACHE_TTL = 5 * DAY
export const FILTERED_ESSAYS_CACHE_TTL = 8 * HOUR
export const ALL_ESSAYS_REFRESH_INTERVAL = 10 * MINUTE

export interface EssayListEntry extends EssayListItem {
    localContent?: string
    localIsPrivate?: boolean
    localThemeId?: number | null
    themeId: number | null
}

interface EssayLibraryControllerOptions {
    accessToken: string
    cacheRepository: EssayLibraryCacheRepository
    client: EssayLibraryClient
    date: string | null
    draftRepository: DraftRepository
    enabled: boolean
    now?: () => number
    onError: (message: string) => void
    resolveThemeId: (themeSlug: string | null) => number | null
    userId: string
}

interface HydrationState {
    queryIdentity: string | null
    ready: boolean
    shouldRefresh: boolean
}

function getQueryKey(date: string | null) {
    return date ? `date:${date}` : ALL_ESSAYS_QUERY_KEY
}

function isCacheValid(
    cachedAt: number,
    date: string | null,
    timestamp: number
) {
    const age = timestamp - cachedAt
    const ttl = date ? FILTERED_ESSAYS_CACHE_TTL : ALL_ESSAYS_CACHE_TTL
    return age >= 0 && age <= ttl
}

function remoteEntries(entries: EssayListEntry[]): EssayListItem[] {
    return entries.map(({id, content, isPrivate, themeSlug}) => ({
        id,
        content,
        isPrivate,
        themeSlug,
    }))
}

export function useEssayLibraryController({
    accessToken,
    cacheRepository,
    client,
    date,
    draftRepository,
    enabled,
    now = Date.now,
    onError,
    resolveThemeId,
    userId,
}: EssayLibraryControllerOptions) {
    const [entries, setEntries] = useState<EssayListEntry[]>([])
    const [error, setError] = useState<string | null>(null)
    const [hasMore, setHasMore] = useState(false)
    const [hydration, setHydration] = useState<HydrationState>({
        queryIdentity: null,
        ready: false,
        shouldRefresh: false,
    })
    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [moreError, setMoreError] = useState<string | null>(null)
    const [page, setPage] = useState(0)
    const [refreshing, setRefreshing] = useState(false)
    const abortRef = useRef<AbortController>()
    const autoRefreshStartedRef = useRef(false)
    const entriesRef = useRef<EssayListEntry[]>([])
    const firstPageBusyRef = useRef(false)
    const firstPageFetchedAtRef = useRef(0)
    const generationRef = useRef(0)
    const hasMoreRef = useRef(false)
    const loadingMoreRef = useRef(false)
    const loadingRef = useRef(false)
    const onErrorRef = useRef(onError)
    const pageRef = useRef(0)
    const queryIdentity = useMemo(
        () =>
            enabled && accessToken
                ? JSON.stringify([accessToken, getQueryKey(date)])
                : null,
        [accessToken, date, enabled]
    )
    const queryKey = getQueryKey(date)

    onErrorRef.current = onError
    entriesRef.current = entries
    hasMoreRef.current = hasMore
    loadingMoreRef.current = loadingMore
    loadingRef.current = loading
    pageRef.current = page

    const setCurrentEntries = useCallback((nextEntries: EssayListEntry[]) => {
        entriesRef.current = nextEntries
        setEntries(nextEntries)
    }, [])

    const setCurrentHasMore = useCallback((nextHasMore: boolean) => {
        hasMoreRef.current = nextHasMore
        setHasMore(nextHasMore)
    }, [])

    const setCurrentLoading = useCallback((nextLoading: boolean) => {
        loadingRef.current = nextLoading
        setLoading(nextLoading)
    }, [])

    const setCurrentPage = useCallback((nextPage: number) => {
        pageRef.current = nextPage
        setPage(nextPage)
    }, [])

    const hydrateEntries = useCallback(
        async (essays: EssayListItem[]) =>
            Promise.all(
                essays.map(async (essay): Promise<EssayListEntry> => {
                    const key = `essay:${essay.id}`
                    const draft = await draftRepository.load(key)
                    const isPrivate = essay.isPrivate === true
                    const themeId = resolveThemeId(essay.themeSlug)
                    const localIsPrivate = draft
                        ? draft.isPrivate === true
                        : isPrivate
                    const localThemeId = draft ? draft.themeId : themeId
                    if (
                        !draft ||
                        (draft.content === essay.content &&
                            localIsPrivate === isPrivate &&
                            localThemeId === themeId)
                    ) {
                        if (
                            draft?.content === essay.content &&
                            localIsPrivate === isPrivate &&
                            localThemeId === themeId
                        ) {
                            void draftRepository.clear(key).catch(() => undefined)
                        }
                        return {...essay, isPrivate, themeId}
                    }
                    return {
                        ...essay,
                        themeId,
                        localContent: draft.content,
                        localIsPrivate,
                        localThemeId,
                    }
                })
            ),
        [draftRepository, resolveThemeId]
    )

    useEffect(() => {
        abortRef.current?.abort()
        const generation = ++generationRef.current
        autoRefreshStartedRef.current = false
        firstPageBusyRef.current = false
        loadingMoreRef.current = false
        setCurrentEntries([])
        setError(null)
        setCurrentHasMore(false)
        setCurrentLoading(Boolean(queryIdentity))
        setLoadingMore(false)
        setMoreError(null)
        setCurrentPage(0)
        setRefreshing(false)
        firstPageFetchedAtRef.current = 0
        setHydration({
            queryIdentity,
            ready: false,
            shouldRefresh: false,
        })

        if (!queryIdentity || !accessToken) {
            return
        }

        void cacheRepository
            .load({accessToken, queryKey})
            .catch(() => null)
            .then(async (snapshot) => {
                if (generation !== generationRef.current) {
                    return
                }
                const timestamp = now()
                if (!snapshot || !isCacheValid(snapshot.cachedAt, date, timestamp)) {
                    setHydration({
                        queryIdentity,
                        ready: true,
                        shouldRefresh: true,
                    })
                    return
                }

                firstPageFetchedAtRef.current = snapshot.firstPageFetchedAt
                const allRecentlyRefreshed =
                    !date &&
                    timestamp - snapshot.firstPageFetchedAt >= 0 &&
                    timestamp - snapshot.firstPageFetchedAt <
                        ALL_ESSAYS_REFRESH_INTERVAL
                const restoreFullSnapshot = Boolean(date) || allRecentlyRefreshed
                const cachedEntries = restoreFullSnapshot
                    ? snapshot.entries
                    : snapshot.entries.slice(0, PAGE_SIZE)
                const hydratedEntries = await hydrateEntries(cachedEntries)
                if (generation !== generationRef.current) {
                    return
                }

                setCurrentEntries(hydratedEntries)
                setCurrentHasMore(
                    restoreFullSnapshot
                        ? snapshot.hasMore
                        : snapshot.page > 1 || snapshot.hasMore
                )
                setCurrentPage(restoreFullSnapshot ? snapshot.page : 1)
                setCurrentLoading(false)
                setHydration({
                    queryIdentity,
                    ready: true,
                    shouldRefresh: Boolean(date) || !allRecentlyRefreshed,
                })
            })

        return () => abortRef.current?.abort()
    }, [
        accessToken,
        cacheRepository,
        date,
        hydrateEntries,
        now,
        queryIdentity,
        queryKey,
        setCurrentEntries,
        setCurrentHasMore,
        setCurrentLoading,
        setCurrentPage,
    ])

    const fetchFirstPage = useCallback(async () => {
        if (
            !enabled ||
            !accessToken ||
            !userId ||
            firstPageBusyRef.current ||
            loadingMoreRef.current ||
            !hydration.ready ||
            hydration.queryIdentity !== queryIdentity
        ) {
            return
        }

        firstPageBusyRef.current = true
        const generation = generationRef.current
        const hadEntries = entriesRef.current.length > 0
        const abortController = new AbortController()
        abortRef.current = abortController
        setError(null)
        setMoreError(null)
        setRefreshing(true)
        setCurrentLoading(!hadEntries)

        try {
            const responseEntries = await client.list({
                accessToken,
                date,
                page: 1,
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

            const timestamp = now()
            const nextHasMore = responseEntries.length > PAGE_SIZE
            firstPageFetchedAtRef.current = timestamp
            setCurrentEntries(nextEntries)
            setCurrentHasMore(nextHasMore)
            setCurrentPage(1)
            setCurrentLoading(false)
            await cacheRepository
                .save(
                    {accessToken, queryKey},
                    {
                        cachedAt: timestamp,
                        entries: remoteEntries(nextEntries),
                        firstPageFetchedAt: timestamp,
                        hasMore: nextHasMore,
                        page: 1,
                    }
                )
                .catch(() => undefined)
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
                    : '无法加载文章，请稍后重试'
            setError(hadEntries ? null : message)
            setCurrentLoading(false)
            onErrorRef.current(message)
        } finally {
            if (generation === generationRef.current) {
                firstPageBusyRef.current = false
                setRefreshing(false)
            }
        }
    }, [
        accessToken,
        cacheRepository,
        client,
        date,
        enabled,
        hydrateEntries,
        hydration.queryIdentity,
        hydration.ready,
        now,
        queryIdentity,
        queryKey,
        setCurrentEntries,
        setCurrentHasMore,
        setCurrentLoading,
        setCurrentPage,
        userId,
    ])

    useEffect(() => {
        if (
            !hydration.ready ||
            !hydration.shouldRefresh ||
            hydration.queryIdentity !== queryIdentity ||
            !userId ||
            autoRefreshStartedRef.current
        ) {
            return
        }
        autoRefreshStartedRef.current = true
        void fetchFirstPage()
    }, [fetchFirstPage, hydration, queryIdentity, userId])

    const loadMore = useCallback(async () => {
        if (
            !enabled ||
            !hasMoreRef.current ||
            loadingMoreRef.current ||
            firstPageBusyRef.current ||
            loadingRef.current ||
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
            const hydratedEntries = await hydrateEntries(
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
            const uniqueNextEntries = hydratedEntries.filter(
                ({id}) => !existingIds.has(id)
            )
            const nextEntries = [...entriesRef.current, ...uniqueNextEntries]
            const nextHasMore = responseEntries.length > PAGE_SIZE
            const timestamp = now()
            setCurrentEntries(nextEntries)
            setCurrentHasMore(nextHasMore)
            setCurrentPage(nextPage)
            await cacheRepository
                .save(
                    {accessToken, queryKey},
                    {
                        cachedAt: timestamp,
                        entries: remoteEntries(nextEntries),
                        firstPageFetchedAt: firstPageFetchedAtRef.current,
                        hasMore: nextHasMore,
                        page: nextPage,
                    }
                )
                .catch(() => undefined)
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
    }, [
        accessToken,
        cacheRepository,
        client,
        date,
        enabled,
        hydrateEntries,
        now,
        queryKey,
        setCurrentEntries,
        setCurrentHasMore,
        setCurrentPage,
        userId,
    ])

    const refresh = useCallback(() => {
        if (
            !enabled ||
            !accessToken ||
            !userId ||
            firstPageBusyRef.current ||
            loadingMoreRef.current ||
            !hydration.ready
        ) {
            return
        }
        void fetchFirstPage()
    }, [accessToken, enabled, fetchFirstPage, hydration.ready, userId])

    const retry = useCallback(() => {
        if (moreError && entriesRef.current.length > 0) {
            void loadMore()
        } else {
            refresh()
        }
    }, [loadMore, moreError, refresh])

    const setLocalDraft = useCallback(
        (
            essayId: string,
            localContent: string,
            localIsPrivate: boolean,
            localThemeId: number | null,
            modified: boolean
        ) => {
            const nextEntries = entriesRef.current.map((entry) =>
                entry.id === essayId
                    ? {
                          ...entry,
                          localContent: modified ? localContent : undefined,
                          localIsPrivate: modified
                              ? localIsPrivate
                              : undefined,
                          localThemeId: modified
                              ? localThemeId
                              : undefined,
                      }
                    : entry
            )
            setCurrentEntries(nextEntries)
        },
        [setCurrentEntries]
    )

    const commitUpdate = useCallback(
        (
            essayId: string,
            content: string,
            isPrivate: boolean,
            themeId: number | null,
            themeSlug: string | null
        ) => {
            setCurrentEntries(
                entriesRef.current.map((entry) =>
                    entry.id === essayId
                        ? {
                              id: entry.id,
                              content,
                              isPrivate,
                              themeId,
                              themeSlug,
                          }
                        : entry
                )
            )
            if (accessToken) {
                void cacheRepository
                    .updateEssay(
                        accessToken,
                        essayId,
                        content,
                        isPrivate,
                        themeSlug
                    )
                    .catch(() => undefined)
            }
        },
        [accessToken, cacheRepository, setCurrentEntries]
    )

    const commitPublish = useCallback(
        (
            essayId: string,
            content: string,
            isPrivate: boolean,
            themeId: number | null,
            themeSlug: string | null
        ) => {
            if (!date) {
                setCurrentEntries([
                    {id: essayId, content, isPrivate, themeId, themeSlug},
                    ...entriesRef.current.filter(
                        (entry) => entry.id !== essayId
                    ),
                ])
            }
            if (accessToken) {
                void cacheRepository
                    .prependToAll(accessToken, {
                        id: essayId,
                        content,
                        isPrivate,
                        themeSlug,
                    })
                    .catch(() => undefined)
            }
        },
        [accessToken, cacheRepository, date, setCurrentEntries]
    )

    const commitRemove = useCallback(
        (essayId: string) => {
            setCurrentEntries(
                entriesRef.current.filter((entry) => entry.id !== essayId)
            )
            if (accessToken) {
                void cacheRepository
                    .removeEssay(accessToken, essayId)
                    .catch(() => undefined)
            }
        },
        [accessToken, cacheRepository, setCurrentEntries]
    )

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
        setLocalDraft,
    }
}
