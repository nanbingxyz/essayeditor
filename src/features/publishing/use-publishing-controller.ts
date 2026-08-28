import {useCallback, useState} from 'react'

import type {EssayClient} from './essay-client'

interface PublishingControllerOptions {
    client: EssayClient
    onError: (message: string) => void
    onSuccess: (id: string) => void | Promise<void>
}

export function usePublishingController({
    client,
    onError,
    onSuccess,
}: PublishingControllerOptions) {
    const [loading, setLoading] = useState(false)

    const publish = useCallback(
        async (
            content: string,
            themeId: number | null,
            isPrivate: boolean,
            accessToken: string
        ) => {
            setLoading(true)
            try {
                const {id} = await client.publish(
                    content,
                    themeId,
                    isPrivate,
                    accessToken
                )
                await onSuccess(id)
                return true
            } catch (error) {
                onError(
                    error instanceof Error
                        ? error.message
                        : '发布失败，请稍后重试'
                )
                return false
            } finally {
                setLoading(false)
            }
        },
        [client, onError, onSuccess]
    )

    return {loading, publish}
}
