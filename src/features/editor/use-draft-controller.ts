import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {debounce} from '@/shared/lib/timing'

import type {DraftRepository, DraftSnapshot} from './draft-repository'

const DRAFT_SAVE_DELAY = 1000

interface DraftControllerOptions {
    baselineContent: string
    baselineThemeId?: number | null
    documentKey: string
    onError: () => void
    persistBaseline?: boolean
    repository: DraftRepository
}

interface PendingSave {
    baselineContent: string
    baselineThemeId: number | null
    content: string
    documentKey: string
    themeId: number | null
}

export function useDraftController({
    baselineContent,
    baselineThemeId = null,
    documentKey,
    onError,
    persistBaseline = false,
    repository,
}: DraftControllerOptions) {
    const [content, setContent] = useState('')
    const [initialContent, setInitialContent] = useState('')
    const [themeId, setThemeId] = useState<number | null>(null)
    const [loadedIdentity, setLoadedIdentity] = useState('')
    const [updatedAt, setUpdatedAt] = useState(0)
    const [ready, setReady] = useState(false)

    const onErrorRef = useRef(onError)
    const baselineContentRef = useRef(baselineContent)
    const baselineThemeIdRef = useRef(baselineThemeId)
    const documentKeyRef = useRef(documentKey)
    const latestContentRef = useRef('')
    const latestThemeIdRef = useRef<number | null>(null)
    const persistedContentRef = useRef('')
    const persistedThemeIdRef = useRef<number | null>(null)
    const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
    const needsSaveRef = useRef(false)
    const pendingSaveRef = useRef<PendingSave | null>(null)

    onErrorRef.current = onError
    const documentIdentity = `${documentKey}\u0000${baselineContent}\u0000${baselineThemeId ?? ''}`

    const enqueueSave = useCallback(
        ({
            baselineContent,
            baselineThemeId,
            content,
            documentKey,
            themeId,
        }: PendingSave) => {
            const pending = {
                baselineContent,
                baselineThemeId,
                content,
                documentKey,
                themeId,
            }
            pendingSaveRef.current = pending
            const timestamp = Date.now()
            const snapshot: DraftSnapshot = {
                version: 2,
                content,
                themeId,
                updatedAt: timestamp,
            }

            const task = saveQueueRef.current.then(async () => {
                try {
                    if (
                        content === baselineContent &&
                        themeId === baselineThemeId &&
                        !persistBaseline
                    ) {
                        await repository.clear(documentKey)
                    } else {
                        await repository.save(documentKey, snapshot)
                    }

                    if (
                        documentKey === documentKeyRef.current &&
                        content === latestContentRef.current &&
                        themeId === latestThemeIdRef.current
                    ) {
                        persistedContentRef.current = content
                        persistedThemeIdRef.current = themeId
                        needsSaveRef.current = false
                        setUpdatedAt(
                            content === baselineContent &&
                                themeId === baselineThemeId &&
                                !persistBaseline
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
                baselineThemeId: baselineThemeIdRef.current,
                content,
                documentKey: documentKeyRef.current,
                themeId: latestThemeIdRef.current,
            })
        },
        [scheduleSave]
    )

    const onThemeChange = useCallback(
        (nextThemeId: number | null) => {
            latestThemeIdRef.current = nextThemeId
            needsSaveRef.current = true
            setThemeId(nextThemeId)
            scheduleSave({
                baselineContent: baselineContentRef.current,
                baselineThemeId: baselineThemeIdRef.current,
                content: latestContentRef.current,
                documentKey: documentKeyRef.current,
                themeId: nextThemeId,
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
                pending.baselineContent === baselineContentRef.current &&
                pending.themeId === latestThemeIdRef.current &&
                pending.baselineThemeId === baselineThemeIdRef.current
            ) {
                return saveQueueRef.current
            }
            return enqueueSave({
                baselineContent: baselineContentRef.current,
                baselineThemeId: baselineThemeIdRef.current,
                content: latestContentRef.current,
                documentKey: documentKeyRef.current,
                themeId: latestThemeIdRef.current,
            })
        }
        return saveQueueRef.current
    }, [enqueueSave, scheduleSave])

    const clear = useCallback(async (notifyError = true) => {
        scheduleSave.cancel()
        try {
            await repository.clear(documentKeyRef.current)
            persistedContentRef.current = baselineContentRef.current
            persistedThemeIdRef.current = baselineThemeIdRef.current
            needsSaveRef.current = false
            setUpdatedAt(0)
            return true
        } catch {
            if (notifyError) {
                onErrorRef.current()
            }
            return false
        }
    }, [repository, scheduleSave])

    useEffect(() => {
        let cancelled = false
        documentKeyRef.current = documentKey
        baselineContentRef.current = baselineContent
        baselineThemeIdRef.current = baselineThemeId
        latestContentRef.current = baselineContent
        latestThemeIdRef.current = baselineThemeId
        persistedContentRef.current = baselineContent
        persistedThemeIdRef.current = baselineThemeId
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
                const effectiveThemeId = draft
                    ? draft.themeId
                    : baselineThemeId
                latestContentRef.current = effectiveContent
                latestThemeIdRef.current = effectiveThemeId
                persistedContentRef.current = effectiveContent
                persistedThemeIdRef.current = effectiveThemeId
                setContent(effectiveContent)
                setInitialContent(effectiveContent)
                setThemeId(effectiveThemeId)
                setUpdatedAt(
                    draft &&
                        (persistBaseline ||
                            draft.content !== baselineContent ||
                            effectiveThemeId !== baselineThemeId)
                        ? draft.updatedAt
                        : 0
                )
                if (
                    draft?.content === baselineContent &&
                    effectiveThemeId === baselineThemeId &&
                    !persistBaseline
                ) {
                    void repository.clear(documentKey).catch(() => undefined)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    latestContentRef.current = baselineContent
                    persistedContentRef.current = baselineContent
                    latestThemeIdRef.current = baselineThemeId
                    persistedThemeIdRef.current = baselineThemeId
                    setContent(baselineContent)
                    setInitialContent(baselineContent)
                    setThemeId(baselineThemeId)
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
        baselineThemeId,
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
        onThemeChange,
        ready: ready && loadedIdentity === documentIdentity,
        themeId,
        updatedAt,
    }
}
