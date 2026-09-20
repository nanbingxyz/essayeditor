import {useCallback, useEffect, useRef, useState} from 'react'

import type {LlmSettings} from '@/features/settings'

import {WRITING_CHECKLIST_VERSION} from './checklist'
import {hasAnalyzableWriting} from './extract-analysis-text'
import type {
    OpenAiCompatibleClient,
    OpenAiConfig,
} from './openai-client'
import type {AnalysisRepository} from './analysis-repository'
import type {AnalysisIssue, AnalysisSnapshot} from './model'
import {
    analyzeWriting,
    createContentFingerprint,
} from './writing-analyzer'

type AnalysisStatus =
    | 'idle'
    | 'loading'
    | 'running'
    | 'completed'
    | 'error'

interface AnalysisControllerOptions {
    client: OpenAiCompatibleClient
    content: string
    documentKey: string
    enabled: boolean
    llmSettings: LlmSettings
    onError: (message: string) => void
    onComplete?: (issueCount: number) => void
    onSaveError: () => void
    repository: AnalysisRepository
}

export type StartAnalysisResult =
    | 'started'
    | 'not-configured'
    | 'empty'
    | 'busy'

function toOpenAiConfig(settings: LlmSettings): OpenAiConfig {
    return {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
    }
}

export function useAnalysisController({
    client,
    content,
    documentKey,
    enabled,
    llmSettings,
    onComplete,
    onError,
    onSaveError,
    repository,
}: AnalysisControllerOptions) {
    const [issues, setIssues] = useState<AnalysisIssue[]>([])
    const [status, setStatus] = useState<AnalysisStatus>('loading')
    const [progress, setProgress] = useState({completed: 0, total: 0})
    const requestRef = useRef<AbortController>()
    const documentKeyRef = useRef(documentKey)
    const contentRef = useRef(content)
    const issuesRef = useRef<AnalysisIssue[]>([])
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
    const pendingSaveRef = useRef<{
        content: string
        documentKey: string
        issues: AnalysisIssue[]
    }>()
    const loadGenerationRef = useRef(0)
    const onCompleteRef = useRef(onComplete)
    const onErrorRef = useRef(onError)
    const onSaveErrorRef = useRef(onSaveError)

    documentKeyRef.current = documentKey
    contentRef.current = content
    issuesRef.current = issues
    onCompleteRef.current = onComplete
    onErrorRef.current = onError
    onSaveErrorRef.current = onSaveError

    const createSnapshot = useCallback(
        (
            targetDocumentKey: string,
            targetContent: string,
            targetIssues: AnalysisIssue[]
        ): AnalysisSnapshot => ({
            checklistVersion: WRITING_CHECKLIST_VERSION,
            contentFingerprint: createContentFingerprint(targetContent),
            documentKey: targetDocumentKey,
            issues: targetIssues,
            updatedAt: Date.now(),
            version: 1,
        }),
        []
    )

    const persist = useCallback(
        async (
            targetDocumentKey: string,
            targetContent: string,
            targetIssues: AnalysisIssue[]
        ) => {
            try {
                await repository.save(
                    createSnapshot(
                        targetDocumentKey,
                        targetContent,
                        targetIssues
                    )
                )
                return true
            } catch {
                onSaveErrorRef.current()
                return false
            }
        },
        [createSnapshot, repository]
    )

    const replaceIssues = useCallback(
        (nextIssues: AnalysisIssue[], nextContent?: string) => {
            issuesRef.current = nextIssues
            setIssues(nextIssues)
            if (saveTimerRef.current !== undefined) {
                clearTimeout(saveTimerRef.current)
            }
            const targetDocumentKey = documentKeyRef.current
            const targetContent = nextContent ?? contentRef.current
            pendingSaveRef.current = {
                content: targetContent,
                documentKey: targetDocumentKey,
                issues: nextIssues,
            }
            saveTimerRef.current = setTimeout(() => {
                saveTimerRef.current = undefined
                const pending = pendingSaveRef.current
                pendingSaveRef.current = undefined
                if (pending) {
                    void persist(
                        pending.documentKey,
                        pending.content,
                        pending.issues
                    )
                }
            }, 500)
        },
        [persist]
    )

    const cancel = useCallback(() => {
        requestRef.current?.abort()
        requestRef.current = undefined
        setStatus((current) =>
            current === 'running' ? 'idle' : current
        )
        setProgress({completed: 0, total: 0})
    }, [])

    const flush = useCallback(async () => {
        if (saveTimerRef.current !== undefined) {
            clearTimeout(saveTimerRef.current)
            saveTimerRef.current = undefined
        }
        const pending = pendingSaveRef.current
        pendingSaveRef.current = undefined
        return pending
            ? persist(
                  pending.documentKey,
                  pending.content,
                  pending.issues
              )
            : true
    }, [persist])

    const start = useCallback(async (): Promise<StartAnalysisResult> => {
        if (requestRef.current) {
            return 'busy'
        }
        if (
            !llmSettings.verified ||
            !llmSettings.apiKey.trim() ||
            !llmSettings.baseUrl.trim() ||
            !llmSettings.model.trim()
        ) {
            return 'not-configured'
        }
        const targetContent = contentRef.current
        const targetDocumentKey = documentKeyRef.current
        if (!hasAnalyzableWriting(targetContent)) {
            return 'empty'
        }

        const request = new AbortController()
        loadGenerationRef.current += 1
        requestRef.current = request
        setStatus('running')
        setProgress({completed: 0, total: 0})
        void analyzeWriting({
            client,
            config: toOpenAiConfig(llmSettings),
            content: targetContent,
            signal: request.signal,
            onProgress: (completed, total) =>
                setProgress({completed, total}),
        })
            .then(async (nextIssues) => {
                if (
                    request.signal.aborted ||
                    documentKeyRef.current !== targetDocumentKey
                ) {
                    return
                }
                await persist(
                    targetDocumentKey,
                    targetContent,
                    nextIssues
                )
                issuesRef.current = nextIssues
                setIssues(nextIssues)
                setStatus('completed')
                onCompleteRef.current?.(nextIssues.length)
            })
            .catch((error) => {
                if (request.signal.aborted) {
                    return
                }
                setStatus('error')
                onErrorRef.current(
                    error instanceof Error
                        ? error.message
                        : '写作分析失败，请稍后重试'
                )
            })
            .finally(() => {
                if (requestRef.current === request) {
                    requestRef.current = undefined
                }
            })
        return 'started'
    }, [client, llmSettings, persist])

    useEffect(() => {
        requestRef.current?.abort()
        requestRef.current = undefined
        const generation = ++loadGenerationRef.current
        if (!enabled) {
            issuesRef.current = []
            setIssues([])
            setStatus('idle')
            return
        }

        setStatus('loading')
        void repository
            .load(documentKey)
            .then((snapshot) => {
                if (
                    generation !== loadGenerationRef.current ||
                    documentKeyRef.current !== documentKey
                ) {
                    return
                }
                const loaded =
                    snapshot?.checklistVersion ===
                    WRITING_CHECKLIST_VERSION
                        ? snapshot.issues.filter(
                              (issue) =>
                                  issue.from <= contentRef.current.length &&
                                  issue.to <= contentRef.current.length
                          )
                        : []
                issuesRef.current = loaded
                setIssues(loaded)
                setStatus(loaded.length ? 'completed' : 'idle')
            })
            .catch(() => {
                if (generation === loadGenerationRef.current) {
                    issuesRef.current = []
                    setIssues([])
                    setStatus('error')
                    onErrorRef.current('无法读取本地分析结果')
                }
            })

        return () => {
            if (saveTimerRef.current !== undefined) {
                clearTimeout(saveTimerRef.current)
                saveTimerRef.current = undefined
                const pending = pendingSaveRef.current
                pendingSaveRef.current = undefined
                if (pending) {
                    void persist(
                        pending.documentKey,
                        pending.content,
                        pending.issues
                    )
                }
            }
        }
    }, [documentKey, enabled, persist, repository])

    return {
        cancel,
        flush,
        issues,
        progress,
        replaceIssues,
        running: status === 'running',
        start,
        status,
    }
}
