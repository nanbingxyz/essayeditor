import {useCallback, useEffect, useRef, useState} from 'react'

import type {ThemeCacheRepository} from './theme-cache-repository'
import type {Theme, ThemeClient} from './theme-client'

export const THEME_CACHE_TTL = 24 * 60 * 60 * 1000

interface ThemeControllerOptions {
    accessToken: string
    cacheRepository: ThemeCacheRepository
    client: ThemeClient
    enabled: boolean
    now?: () => number
}

export function useThemeController({
    accessToken,
    cacheRepository,
    client,
    enabled,
    now = Date.now,
}: ThemeControllerOptions) {
    const [themes, setThemes] = useState<Theme[]>([])
    const [loading, setLoading] = useState(false)
    const [ready, setReady] = useState(false)
    const abortRef = useRef<AbortController>()
    const failedFetchedAtRef = useRef<number | null>(null)
    const fetchedAtRef = useRef(0)
    const generationRef = useRef(0)
    const refreshPromiseRef = useRef<Promise<boolean> | null>(null)
    const themesRef = useRef<Theme[]>([])

    themesRef.current = themes

    const refreshIfExpired = useCallback(() => {
        if (!enabled || !accessToken) {
            return Promise.resolve(false)
        }
        const fetchedAt = fetchedAtRef.current
        const age = now() - fetchedAt
        if (fetchedAt > 0 && age >= 0 && age < THEME_CACHE_TTL) {
            return Promise.resolve(true)
        }
        if (failedFetchedAtRef.current === fetchedAt) {
            return Promise.resolve(false)
        }
        if (refreshPromiseRef.current) {
            return refreshPromiseRef.current
        }

        const generation = generationRef.current
        const abortController = new AbortController()
        abortRef.current = abortController
        if (themesRef.current.length === 0) {
            setLoading(true)
        }

        const refresh = client
            .list(accessToken, abortController.signal)
            .then(async (nextThemes) => {
                if (
                    abortController.signal.aborted ||
                    generation !== generationRef.current
                ) {
                    return false
                }
                const timestamp = now()
                fetchedAtRef.current = timestamp
                failedFetchedAtRef.current = null
                themesRef.current = nextThemes
                setThemes(nextThemes)
                await cacheRepository
                    .save({
                        fetchedAt: timestamp,
                        themes: nextThemes,
                    })
                    .catch(() => undefined)
                return true
            })
            .catch(() => {
                if (
                    !abortController.signal.aborted &&
                    generation === generationRef.current
                ) {
                    failedFetchedAtRef.current = fetchedAt
                }
                return false
            })
            .finally(() => {
                if (generation === generationRef.current) {
                    setLoading(false)
                    setReady(true)
                    refreshPromiseRef.current = null
                }
            })
        refreshPromiseRef.current = refresh
        return refresh
    }, [accessToken, cacheRepository, client, enabled, now])

    useEffect(() => {
        const generation = ++generationRef.current
        abortRef.current?.abort()
        refreshPromiseRef.current = null
        failedFetchedAtRef.current = null
        fetchedAtRef.current = 0
        themesRef.current = []
        setThemes([])
        setReady(!enabled || !accessToken)
        setLoading(Boolean(enabled && accessToken))

        if (!enabled || !accessToken) {
            return
        }

        void cacheRepository
            .load()
            .catch(() => null)
            .then((snapshot) => {
                if (generation !== generationRef.current) {
                    return
                }
                if (snapshot) {
                    fetchedAtRef.current = snapshot.fetchedAt
                    themesRef.current = snapshot.themes
                    setThemes(snapshot.themes)
                }
                setLoading(false)
                setReady(true)
                void refreshIfExpired()
            })

        return () => abortRef.current?.abort()
    }, [accessToken, cacheRepository, enabled, refreshIfExpired])

    return {loading, ready, refreshIfExpired, themes}
}
