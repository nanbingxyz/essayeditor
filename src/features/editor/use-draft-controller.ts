import {useCallback, useEffect, useRef, useState} from 'react'

import type {DraftRepository, DraftSnapshot} from './draft-repository'

const DRAFT_SAVE_DELAY = 1000

export interface DraftDocumentSeed {
    content: string
    isPrivate: boolean
    themeId: number | null
    updatedAt: number
}

interface DraftControllerOptions {
    baselineContent: string
    baselineIsPrivate?: boolean
    baselineThemeId?: number | null
    documentKey: string
    enabled?: boolean
    onError: () => void
    persistBaseline?: boolean
    repository: DraftRepository
    seed?: DraftDocumentSeed
}

interface DraftSession extends DraftDocumentSeed {
    baselineContent: string
    baselineIsPrivate: boolean
    baselineThemeId: number | null
    dirty: boolean
    documentKey: string
    enqueuedRevision: number
    identity: string
    initialContent: string
    loading: boolean
    pendingSave?: Promise<boolean>
    persistBaseline: boolean
    ready: boolean
    revision: number
    saveTimer?: ReturnType<typeof setTimeout>
}

function createSession({
    baselineContent,
    baselineIsPrivate,
    baselineThemeId,
    documentKey,
    identity,
    persistBaseline,
    seed,
}: {
    baselineContent: string
    baselineIsPrivate: boolean
    baselineThemeId: number | null
    documentKey: string
    identity: string
    persistBaseline: boolean
    seed?: DraftDocumentSeed
}): DraftSession {
    const initial = seed ?? {
        content: baselineContent,
        isPrivate: baselineIsPrivate,
        themeId: baselineThemeId,
        updatedAt: 0,
    }

    return {
        ...initial,
        baselineContent,
        baselineIsPrivate,
        baselineThemeId,
        dirty: false,
        documentKey,
        enqueuedRevision: -1,
        identity,
        initialContent: initial.content,
        loading: false,
        persistBaseline,
        ready: seed !== undefined,
        revision: 0,
    }
}

export function useDraftController({
    baselineContent,
    baselineIsPrivate = false,
    baselineThemeId = null,
    documentKey,
    enabled = true,
    onError,
    persistBaseline = false,
    repository,
    seed,
}: DraftControllerOptions) {
    const [, setRenderVersion] = useState(0)
    const sessionsRef = useRef(new Map<string, DraftSession>())
    const activeSessionRef = useRef<DraftSession>()
    const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
    const mountedRef = useRef(true)
    const onErrorRef = useRef(onError)

    onErrorRef.current = onError
    const documentIdentity = `${documentKey}\u0000${baselineContent}\u0000${baselineThemeId ?? ''}\u0000${baselineIsPrivate}\u0000${persistBaseline}`
    let session = sessionsRef.current.get(documentIdentity)
    if (!session) {
        session = createSession({
            baselineContent,
            baselineIsPrivate,
            baselineThemeId,
            documentKey,
            identity: documentIdentity,
            persistBaseline,
            seed,
        })
        sessionsRef.current.set(documentIdentity, session)
    }
    const activeSession = session as DraftSession
    activeSessionRef.current = activeSession

    const renderIfActive = useCallback((target: DraftSession) => {
        if (mountedRef.current && activeSessionRef.current === target) {
            setRenderVersion((current) => current + 1)
        }
    }, [])

    const enqueueSave = useCallback(
        (target: DraftSession) => {
            if (target.saveTimer !== undefined) {
                clearTimeout(target.saveTimer)
                target.saveTimer = undefined
            }

            if (!target.dirty) {
                return target.pendingSave ?? Promise.resolve(true)
            }
            if (
                target.pendingSave &&
                target.enqueuedRevision === target.revision
            ) {
                return target.pendingSave
            }

            const revision = target.revision
            const timestamp = Date.now()
            const snapshot: DraftSnapshot = {
                version: 2,
                content: target.content,
                isPrivate: target.isPrivate,
                themeId: target.themeId,
                updatedAt: timestamp,
            }
            target.enqueuedRevision = revision

            const task = saveQueueRef.current.then(async () => {
                try {
                    if (
                        snapshot.content === target.baselineContent &&
                        snapshot.isPrivate === target.baselineIsPrivate &&
                        snapshot.themeId === target.baselineThemeId &&
                        !target.persistBaseline
                    ) {
                        await repository.clear(target.documentKey)
                    } else {
                        await repository.save(target.documentKey, snapshot)
                    }

                    if (target.revision === revision) {
                        target.dirty = false
                    }
                    target.updatedAt =
                        snapshot.content === target.baselineContent &&
                        snapshot.isPrivate === target.baselineIsPrivate &&
                        snapshot.themeId === target.baselineThemeId &&
                        !target.persistBaseline
                            ? 0
                            : timestamp
                    renderIfActive(target)
                    return true
                } catch {
                    target.dirty = true
                    onErrorRef.current()
                    renderIfActive(target)
                    return false
                } finally {
                    if (target.enqueuedRevision === revision) {
                        target.enqueuedRevision = -1
                    }
                    if (target.pendingSave === task) {
                        target.pendingSave = undefined
                    }
                }
            })

            target.pendingSave = task
            saveQueueRef.current = task
            return task
        },
        [renderIfActive, repository]
    )

    const scheduleSave = useCallback(
        (target: DraftSession) => {
            if (target.saveTimer !== undefined) {
                clearTimeout(target.saveTimer)
            }
            target.saveTimer = setTimeout(() => {
                target.saveTimer = undefined
                void enqueueSave(target)
            }, DRAFT_SAVE_DELAY)
        },
        [enqueueSave]
    )

    const updateSession = useCallback(
        (
            target: DraftSession,
            update: Partial<
                Pick<DraftSession, 'content' | 'isPrivate' | 'themeId'>
            >
        ) => {
            Object.assign(target, update)
            target.dirty = true
            target.revision += 1
            scheduleSave(target)
            renderIfActive(target)
        },
        [renderIfActive, scheduleSave]
    )

    const onContentChange = useCallback(
        (content: string) => {
            const target = activeSessionRef.current
            if (target) {
                updateSession(target, {content})
            }
        },
        [updateSession]
    )

    const onThemeChange = useCallback(
        (themeId: number | null) => {
            const target = activeSessionRef.current
            if (target) {
                updateSession(target, {themeId})
            }
        },
        [updateSession]
    )

    const onPrivateChange = useCallback(
        (isPrivate: boolean) => {
            const target = activeSessionRef.current
            if (target) {
                updateSession(target, {isPrivate})
            }
        },
        [updateSession]
    )

    const flush = useCallback(() => {
        const target = activeSessionRef.current
        return target ? enqueueSave(target) : Promise.resolve(true)
    }, [enqueueSave])

    const flushAll = useCallback(async () => {
        const saves = [...sessionsRef.current.values()]
            .filter((target) => target.dirty || target.pendingSave)
            .map((target) => enqueueSave(target))
        if (saves.length === 0) {
            return true
        }
        const results = await Promise.all(saves)
        return results.every(Boolean)
    }, [enqueueSave])

    const clear = useCallback(
        async (notifyError = true) => {
            const target = activeSessionRef.current
            if (!target) {
                return true
            }
            if (target.saveTimer !== undefined) {
                clearTimeout(target.saveTimer)
                target.saveTimer = undefined
            }
            if (target.pendingSave) {
                await target.pendingSave
            }
            try {
                await repository.clear(target.documentKey)
                target.content = target.baselineContent
                target.initialContent = target.baselineContent
                target.isPrivate = target.baselineIsPrivate
                target.themeId = target.baselineThemeId
                target.updatedAt = 0
                target.dirty = false
                target.revision += 1
                renderIfActive(target)
                return true
            } catch {
                if (notifyError) {
                    onErrorRef.current()
                }
                return false
            }
        },
        [renderIfActive, repository]
    )

    useEffect(() => {
        const target = activeSession
        if (!enabled || target.ready || target.loading) {
            return
        }
        target.loading = true

        void repository
            .load(target.documentKey)
            .then((draft) => {
                if (target.revision !== 0) {
                    return
                }
                target.content = draft?.content ?? target.baselineContent
                target.initialContent = target.content
                target.isPrivate = draft
                    ? draft.isPrivate === true
                    : target.baselineIsPrivate
                target.themeId = draft
                    ? draft.themeId
                    : target.baselineThemeId
                target.updatedAt =
                    draft &&
                    (target.persistBaseline ||
                        draft.content !== target.baselineContent ||
                        target.isPrivate !== target.baselineIsPrivate ||
                        target.themeId !== target.baselineThemeId)
                        ? draft.updatedAt
                        : 0
                if (
                    draft?.content === target.baselineContent &&
                    target.isPrivate === target.baselineIsPrivate &&
                    target.themeId === target.baselineThemeId &&
                    !target.persistBaseline
                ) {
                    void repository
                        .clear(target.documentKey)
                        .catch(() => undefined)
                }
            })
            .catch(() => {
                if (target.revision === 0) {
                    target.content = target.baselineContent
                    target.initialContent = target.baselineContent
                    target.isPrivate = target.baselineIsPrivate
                    target.themeId = target.baselineThemeId
                    target.updatedAt = 0
                    onErrorRef.current()
                }
            })
            .finally(() => {
                target.loading = false
                target.ready = true
                renderIfActive(target)
            })
    }, [activeSession, documentIdentity, enabled, renderIfActive, repository])

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            sessionsRef.current.forEach((target) => {
                if (target.saveTimer !== undefined) {
                    clearTimeout(target.saveTimer)
                }
            })
        }
    }, [])

    return {
        clear,
        content: activeSession.content,
        flush,
        flushAll,
        initialContent: activeSession.initialContent,
        isPrivate: activeSession.isPrivate,
        onContentChange,
        onPrivateChange,
        onThemeChange,
        ready: activeSession.ready,
        themeId: activeSession.themeId,
        updatedAt: activeSession.updatedAt,
    }
}
