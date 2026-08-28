import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {debounce} from '@/shared/lib/timing'

import type {DraftRepository, DraftSnapshot} from './draft-repository'

const DRAFT_SAVE_DELAY = 1000

interface DraftControllerOptions {
    baselineContent: string
    baselineIsPrivate?: boolean
    baselineThemeId?: number | null
    documentKey: string
    onError: () => void
    persistBaseline?: boolean
    repository: DraftRepository
}

interface PendingSave {
    baselineContent: string
    baselineIsPrivate: boolean
    baselineThemeId: number | null
    content: string
    documentKey: string
    isPrivate: boolean
    themeId: number | null
}

export function useDraftController({
    baselineContent,
    baselineIsPrivate = false,
    baselineThemeId = null,
    documentKey,
    onError,
    persistBaseline = false,
    repository,
}: DraftControllerOptions) {
    const [content, setContent] = useState('')
    const [initialContent, setInitialContent] = useState('')
    const [isPrivate, setIsPrivate] = useState(false)
    const [themeId, setThemeId] = useState<number | null>(null)
    const [loadedIdentity, setLoadedIdentity] = useState('')
    const [updatedAt, setUpdatedAt] = useState(0)
    const [ready, setReady] = useState(false)

    const onErrorRef = useRef(onError)
    const baselineContentRef = useRef(baselineContent)
    const baselineIsPrivateRef = useRef(baselineIsPrivate)
    const baselineThemeIdRef = useRef(baselineThemeId)
    const documentKeyRef = useRef(documentKey)
    const latestContentRef = useRef('')
    const latestIsPrivateRef = useRef(false)
    const latestThemeIdRef = useRef<number | null>(null)
    const persistedContentRef = useRef('')
    const persistedIsPrivateRef = useRef(false)
    const persistedThemeIdRef = useRef<number | null>(null)
    const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
    const needsSaveRef = useRef(false)
    const pendingSaveRef = useRef<PendingSave | null>(null)

    onErrorRef.current = onError
    const documentIdentity = `${documentKey}\u0000${baselineContent}\u0000${baselineThemeId ?? ''}\u0000${baselineIsPrivate}`

    const enqueueSave = useCallback(
        ({
            baselineContent,
            baselineIsPrivate,
            baselineThemeId,
            content,
            documentKey,
            isPrivate,
            themeId,
        }: PendingSave) => {
            const pending = {
                baselineContent,
                baselineIsPrivate,
                baselineThemeId,
                content,
                documentKey,
                isPrivate,
                themeId,
            }
            pendingSaveRef.current = pending
            const timestamp = Date.now()
            const snapshot: DraftSnapshot = {
                version: 2,
                content,
                isPrivate,
                themeId,
                updatedAt: timestamp,
            }

            const task = saveQueueRef.current.then(async () => {
                try {
                    if (
                        content === baselineContent &&
                        isPrivate === baselineIsPrivate &&
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
                        isPrivate === latestIsPrivateRef.current &&
                        themeId === latestThemeIdRef.current
                    ) {
                        persistedContentRef.current = content
                        persistedIsPrivateRef.current = isPrivate
                        persistedThemeIdRef.current = themeId
                        needsSaveRef.current = false
                        setUpdatedAt(
                            content === baselineContent &&
                                isPrivate === baselineIsPrivate &&
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
                baselineIsPrivate: baselineIsPrivateRef.current,
                baselineThemeId: baselineThemeIdRef.current,
                content,
                documentKey: documentKeyRef.current,
                isPrivate: latestIsPrivateRef.current,
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
                baselineIsPrivate: baselineIsPrivateRef.current,
                baselineThemeId: baselineThemeIdRef.current,
                content: latestContentRef.current,
                documentKey: documentKeyRef.current,
                isPrivate: latestIsPrivateRef.current,
                themeId: nextThemeId,
            })
        },
        [scheduleSave]
    )

    const onPrivateChange = useCallback(
        (nextIsPrivate: boolean) => {
            latestIsPrivateRef.current = nextIsPrivate
            needsSaveRef.current = true
            setIsPrivate(nextIsPrivate)
            scheduleSave({
                baselineContent: baselineContentRef.current,
                baselineIsPrivate: baselineIsPrivateRef.current,
                baselineThemeId: baselineThemeIdRef.current,
                content: latestContentRef.current,
                documentKey: documentKeyRef.current,
                isPrivate: nextIsPrivate,
                themeId: latestThemeIdRef.current,
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
                pending.isPrivate === latestIsPrivateRef.current &&
                pending.baselineIsPrivate === baselineIsPrivateRef.current &&
                pending.themeId === latestThemeIdRef.current &&
                pending.baselineThemeId === baselineThemeIdRef.current
            ) {
                return saveQueueRef.current
            }
            return enqueueSave({
                baselineContent: baselineContentRef.current,
                baselineIsPrivate: baselineIsPrivateRef.current,
                baselineThemeId: baselineThemeIdRef.current,
                content: latestContentRef.current,
                documentKey: documentKeyRef.current,
                isPrivate: latestIsPrivateRef.current,
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
            persistedIsPrivateRef.current = baselineIsPrivateRef.current
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
        baselineIsPrivateRef.current = baselineIsPrivate
        baselineThemeIdRef.current = baselineThemeId
        latestContentRef.current = baselineContent
        latestIsPrivateRef.current = baselineIsPrivate
        latestThemeIdRef.current = baselineThemeId
        persistedContentRef.current = baselineContent
        persistedIsPrivateRef.current = baselineIsPrivate
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
                const effectiveIsPrivate = draft
                    ? draft.isPrivate === true
                    : baselineIsPrivate
                const effectiveThemeId = draft
                    ? draft.themeId
                    : baselineThemeId
                latestContentRef.current = effectiveContent
                latestIsPrivateRef.current = effectiveIsPrivate
                latestThemeIdRef.current = effectiveThemeId
                persistedContentRef.current = effectiveContent
                persistedIsPrivateRef.current = effectiveIsPrivate
                persistedThemeIdRef.current = effectiveThemeId
                setContent(effectiveContent)
                setInitialContent(effectiveContent)
                setIsPrivate(effectiveIsPrivate)
                setThemeId(effectiveThemeId)
                setUpdatedAt(
                    draft &&
                        (persistBaseline ||
                            draft.content !== baselineContent ||
                            effectiveIsPrivate !== baselineIsPrivate ||
                            effectiveThemeId !== baselineThemeId)
                        ? draft.updatedAt
                        : 0
                )
                if (
                    draft?.content === baselineContent &&
                    effectiveIsPrivate === baselineIsPrivate &&
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
                    latestIsPrivateRef.current = baselineIsPrivate
                    persistedIsPrivateRef.current = baselineIsPrivate
                    latestThemeIdRef.current = baselineThemeId
                    persistedThemeIdRef.current = baselineThemeId
                    setContent(baselineContent)
                    setInitialContent(baselineContent)
                    setIsPrivate(baselineIsPrivate)
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
        baselineIsPrivate,
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
        isPrivate,
        onContentChange,
        onPrivateChange,
        onThemeChange,
        ready: ready && loadedIdentity === documentIdentity,
        themeId,
        updatedAt,
    }
}
