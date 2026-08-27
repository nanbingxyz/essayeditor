import {useEffect, useRef, useState} from 'react'

import type {EssayActivityClient} from './essay-activity-client'
import type {EssayUser, Heatmap} from './model'

interface EssayActivityControllerOptions {
    accessToken: string
    client: EssayActivityClient
    enabled: boolean
    onError: (message: string) => void
}

export function useEssayActivityController({
    accessToken,
    client,
    enabled,
    onError,
}: EssayActivityControllerOptions) {
    const [user, setUser] = useState<EssayUser | null>(null)
    const [heatmap, setHeatmap] = useState<Heatmap>({})
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const onErrorRef = useRef(onError)

    onErrorRef.current = onError

    useEffect(() => {
        if (!enabled) {
            return
        }

        if (!accessToken) {
            setUser(null)
            setHeatmap({})
            setLoading(false)
            setError(null)
            return
        }

        const abortController = new AbortController()
        setUser(null)
        setHeatmap({})
        setLoading(true)
        setError(null)

        void client
            .getHeatmap(accessToken, abortController.signal)
            .then((snapshot) => {
                if (abortController.signal.aborted) {
                    return
                }
                setUser(snapshot.user)
                setHeatmap(snapshot.heatmap)
                setLoading(false)
            })
            .catch((requestError: unknown) => {
                if (abortController.signal.aborted) {
                    return
                }
                const message =
                    requestError instanceof Error
                        ? requestError.message
                        : '无法同步 Essay 数据'
                setUser(null)
                setHeatmap({})
                setLoading(false)
                setError(message)
                onErrorRef.current(message)
            })

        return () => abortController.abort()
    }, [accessToken, client, enabled])

    return {
        error,
        heatmap,
        loading,
        user,
    }
}
