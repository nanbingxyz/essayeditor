import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {debounce} from '@/shared/lib/timing'

import type {DraftRepository, DraftSnapshot} from './draft-repository'

const DRAFT_SAVE_DELAY = 1000

interface DraftControllerOptions {
    onError: () => void
    repository: DraftRepository
}

export function useDraftController({
    onError,
    repository,
}: DraftControllerOptions) {
    const [initialContent, setInitialContent] = useState('')
    const [updatedAt, setUpdatedAt] = useState(0)
    const [ready, setReady] = useState(false)

    const onErrorRef = useRef(onError)
    const latestContentRef = useRef('')
    const persistedContentRef = useRef('')
    const queuedContentRef = useRef('')
    const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
    const saveGenerationRef = useRef(0)

    onErrorRef.current = onError

    const enqueueSave = useCallback(
        (content: string) => {
            const generation = ++saveGenerationRef.current
            queuedContentRef.current = content
            const timestamp = Date.now()
            const snapshot: DraftSnapshot = {
                version: 1,
                content,
                updatedAt: timestamp,
            }

            const task = saveQueueRef.current.then(async () => {
                try {
                    if (content === '') {
                        await repository.clear()
                    } else {
                        await repository.save(snapshot)
                    }

                    if (generation === saveGenerationRef.current) {
                        persistedContentRef.current = content
                        setUpdatedAt(content === '' ? 0 : timestamp)
                    }
                    return true
                } catch {
                    if (generation === saveGenerationRef.current) {
                        queuedContentRef.current = persistedContentRef.current
                        onErrorRef.current()
                    }
                    return false
                }
            })

            saveQueueRef.current = task
            return task
        },
        [repository]
    )

    const scheduleSave = useMemo(
        () => debounce((content: string) => void enqueueSave(content), DRAFT_SAVE_DELAY),
        [enqueueSave]
    )

    const onContentChange = useCallback(
        (content: string) => {
            latestContentRef.current = content
            scheduleSave(content)
        },
        [scheduleSave]
    )

    const flush = useCallback(async () => {
        scheduleSave.cancel()
        if (latestContentRef.current !== queuedContentRef.current) {
            return enqueueSave(latestContentRef.current)
        }
        return saveQueueRef.current
    }, [enqueueSave, scheduleSave])

    const clear = useCallback(async () => {
        scheduleSave.cancel()
        latestContentRef.current = ''
        return enqueueSave('')
    }, [enqueueSave, scheduleSave])

    useEffect(() => {
        let cancelled = false

        void repository
            .load()
            .then((draft) => {
                if (cancelled) {
                    return
                }
                const content = draft?.content ?? ''
                latestContentRef.current = content
                persistedContentRef.current = content
                queuedContentRef.current = content
                setInitialContent(content)
                setUpdatedAt(draft?.updatedAt ?? 0)
            })
            .catch(() => {
                if (!cancelled) {
                    onErrorRef.current()
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setReady(true)
                }
            })

        return () => {
            cancelled = true
            scheduleSave.flush()
        }
    }, [repository, scheduleSave])

    return {
        clear,
        flush,
        initialContent,
        onContentChange,
        ready,
        updatedAt,
    }
}
