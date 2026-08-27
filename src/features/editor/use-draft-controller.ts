import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {debounce} from '@/shared/lib/timing'

import type {DraftRepository, DraftSnapshot} from './draft-repository'

const DRAFT_SAVE_DELAY = 1000

interface DraftControllerOptions {
    baselineContent: string
    documentKey: string
    onError: () => void
    persistBaseline?: boolean
    repository: DraftRepository
}

interface PendingSave {
    baselineContent: string
    content: string
    documentKey: string
}

export function useDraftController({
    baselineContent,
    documentKey,
    onError,
    persistBaseline = false,
    repository,
}: DraftControllerOptions) {
    const [content, setContent] = useState('')
    const [initialContent, setInitialContent] = useState('')
    const [loadedIdentity, setLoadedIdentity] = useState('')
    const [updatedAt, setUpdatedAt] = useState(0)
    const [ready, setReady] = useState(false)

    const onErrorRef = useRef(onError)
    const baselineContentRef = useRef(baselineContent)
    const documentKeyRef = useRef(documentKey)
    const latestContentRef = useRef('')
    const persistedContentRef = useRef('')
    const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
    const needsSaveRef = useRef(false)
    const pendingSaveRef = useRef<PendingSave | null>(null)

    onErrorRef.current = onError
    const documentIdentity = `${documentKey}\u0000${baselineContent}`

    const enqueueSave = useCallback(
        ({baselineContent, content, documentKey}: PendingSave) => {
            const pending = {baselineContent, content, documentKey}
            pendingSaveRef.current = pending
            const timestamp = Date.now()
            const snapshot: DraftSnapshot = {
                version: 1,
                content,
                updatedAt: timestamp,
            }

            const task = saveQueueRef.current.then(async () => {
                try {
                    if (content === baselineContent && !persistBaseline) {
                        await repository.clear(documentKey)
                    } else {
                        await repository.save(documentKey, snapshot)
                    }

                    if (
                        documentKey === documentKeyRef.current &&
                        content === latestContentRef.current
                    ) {
                        persistedContentRef.current = content
                        needsSaveRef.current = false
                        setUpdatedAt(
                            content === baselineContent && !persistBaseline
                                ? 0
                                : timestamp
                        )
                    }
                    if (pendingSaveRef.current === pending) {
                        pendingSaveRef.current = null
                    }
                    return true
                } catch {
                    if (documentKey === documentKeyRef.current) {
                        needsSaveRef.current = true
                        onErrorRef.current()
                    }
                    if (pendingSaveRef.current === pending) {
                        pendingSaveRef.current = null
                    }
                    return false
                }
            })

            saveQueueRef.current = task
            return task
        },
        [persistBaseline, repository]
    )

    const scheduleSave = useMemo(
        () =>
            debounce(
                (pending: PendingSave) => void enqueueSave(pending),
                DRAFT_SAVE_DELAY
            ),
        [enqueueSave]
    )

    const onContentChange = useCallback(
        (content: string) => {
            latestContentRef.current = content
            needsSaveRef.current = true
            setContent(content)
            scheduleSave({
                baselineContent: baselineContentRef.current,
                content,
                documentKey: documentKeyRef.current,
            })
        },
        [scheduleSave]
    )

    const flush = useCallback(async () => {
        scheduleSave.cancel()
        if (needsSaveRef.current) {
            const pending = pendingSaveRef.current
            if (
                pending?.documentKey === documentKeyRef.current &&
                pending.content === latestContentRef.current &&
                pending.baselineContent === baselineContentRef.current
            ) {
                return saveQueueRef.current
            }
            return enqueueSave({
                baselineContent: baselineContentRef.current,
                content: latestContentRef.current,
                documentKey: documentKeyRef.current,
            })
        }
        return saveQueueRef.current
    }, [enqueueSave, scheduleSave])

    const clear = useCallback(async () => {
        scheduleSave.cancel()
        try {
            await repository.clear(documentKeyRef.current)
            persistedContentRef.current = baselineContentRef.current
            needsSaveRef.current = false
            setUpdatedAt(0)
            return true
        } catch {
            onErrorRef.current()
            return false
        }
    }, [repository, scheduleSave])

    useEffect(() => {
        let cancelled = false
        documentKeyRef.current = documentKey
        baselineContentRef.current = baselineContent
        latestContentRef.current = baselineContent
        persistedContentRef.current = baselineContent
        needsSaveRef.current = false
        pendingSaveRef.current = null
        scheduleSave.cancel()
        setReady(false)

        void repository
            .load(documentKey)
            .then((draft) => {
                if (cancelled) {
                    return
                }
                const effectiveContent = draft?.content ?? baselineContent
                latestContentRef.current = effectiveContent
                persistedContentRef.current = effectiveContent
                setContent(effectiveContent)
                setInitialContent(effectiveContent)
                setUpdatedAt(
                    draft &&
                        (persistBaseline || draft.content !== baselineContent)
                        ? draft.updatedAt
                        : 0
                )
                if (draft?.content === baselineContent && !persistBaseline) {
                    void repository.clear(documentKey).catch(() => undefined)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    latestContentRef.current = baselineContent
                    persistedContentRef.current = baselineContent
                    setContent(baselineContent)
                    setInitialContent(baselineContent)
                    setUpdatedAt(0)
                    onErrorRef.current()
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadedIdentity(documentIdentity)
                    setReady(true)
                }
            })

        return () => {
            cancelled = true
            scheduleSave.cancel()
        }
    }, [
        baselineContent,
        documentIdentity,
        documentKey,
        persistBaseline,
        repository,
        scheduleSave,
    ])

    return {
        clear,
        content,
        flush,
        initialContent,
        onContentChange,
        ready: ready && loadedIdentity === documentIdentity,
        updatedAt,
    }
}
