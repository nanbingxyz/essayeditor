import {Open20Regular} from '@fluentui/react-icons'
import '@fontsource/barlow/latin-500.css'
import '@fontsource/barlow/latin-600.css'
import '@fontsource/barlow/latin-700.css'
import '@fontsource-variable/noto-serif-sc'
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react'

import {
    createEssayActivityClient,
    useEssayActivityController,
} from '@/features/activity'
import {
    createDraftRepository,
    createMarkdownPdf,
    DeleteDocumentButton,
    type DraftDocumentSeed,
    EditorPage,
    ExportMenu,
    getLocalDraftDocumentKey,
    type LocalDraft,
    type MarkdownEditorHandle,
    type MarkdownEditorReadyMetrics,
    useDraftController,
} from '@/features/editor'
import {
    createEssayLibraryCacheRepository,
    createEssayLibraryClient,
    type EssayListEntry,
    SidebarEssayList,
    useEssayLibraryController,
} from '@/features/essays'
import {
    AppShell,
    type AppPage,
    useSidebarLayout,
} from '@/features/navigation'
import {
    createNoteCacheRepository,
    createNoteClient,
    NoteSidebar,
    useNoteController,
} from '@/features/notes'
import {
    createEssayClient,
    usePublishingController,
} from '@/features/publishing'
import {
    createSettingsRepository,
    SettingsPage,
    useSettingsController,
} from '@/features/settings'
import {
    createThemeCacheRepository,
    createThemeClient,
    ThemeSelector,
    useThemeController,
} from '@/features/themes'
import {SidebarUpdateStatus, UpdaterProvider} from '@/features/updater'
import { tauriDesktopAdapter } from '@/shared/platform/desktop'
import {ToastAction, useToast} from '@/shared/ui'

import { essayApiBaseUrl } from './essay-api-config'
import { getPublishedDocumentStatus } from './document-status'

type ActiveDocument =
    | ({ kind: 'draft' } & LocalDraft)
    | {
        kind: 'published'
        content: string
        draftSeed: DraftDocumentSeed
        id: string
        isPrivate: boolean
        themeId: number | null
        themeSlug: string | null
    }

interface PendingPublish {
    content: string
    isPrivate: boolean
    localId: string
    themeId: number | null
    themeSlug: string | null
}

function sortDrafts(drafts: LocalDraft[]) {
    return [...drafts].sort(
        (left, right) =>
            right.updatedAt - left.updatedAt ||
            right.createdAt - left.createdAt ||
            left.localId.localeCompare(right.localId)
    )
}

function activateDraft(draft: LocalDraft): ActiveDocument {
    return { kind: 'draft', ...draft }
}

function activateEssay(essay: EssayListEntry): ActiveDocument {
    const modified = essay.localContent !== undefined
    return {
        kind: 'published',
        id: essay.id,
        content: essay.content,
        draftSeed: modified
            ? {
                content: essay.localContent ?? essay.content,
                isPrivate:
                    essay.localIsPrivate ?? essay.isPrivate === true,
                themeId:
                    essay.localThemeId === undefined
                        ? essay.themeId
                        : essay.localThemeId,
                updatedAt: essay.localUpdatedAt ?? 0,
            }
            : {
                content: essay.content,
                isPrivate: essay.isPrivate === true,
                themeId: essay.themeId,
                updatedAt: 0,
            },
        isPrivate: essay.isPrivate === true,
        themeId: essay.themeId,
        themeSlug: essay.themeSlug,
    }
}

function getDocumentSeed(
    document: ActiveDocument | null
): DraftDocumentSeed | undefined {
    if (!document) {
        return undefined
    }
    if (document.kind === 'published') {
        return document.draftSeed
    }
    return {
        content: document.content,
        isPrivate: document.isPrivate === true,
        themeId: document.themeId,
        updatedAt: document.updatedAt,
    }
}

function getDocumentKey(document: ActiveDocument) {
    return document.kind === 'published'
        ? `essay:${document.id}`
        : getLocalDraftDocumentKey(document.localId)
}

function getPercentile(samples: number[], percentile: number) {
    if (samples.length === 0) {
        return 0
    }
    const sorted = [...samples].sort((left, right) => left - right)
    const index = Math.max(
        0,
        Math.ceil((percentile / 100) * sorted.length) - 1
    )
    return sorted[index]
}

function createRecoveryDraft(): LocalDraft {
    const timestamp = Date.now()
    return {
        localId: `recovery-${timestamp}`,
        content: '',
        createdAt: timestamp,
        isPrivate: false,
        themeId: null,
        updatedAt: timestamp,
    }
}

function getMarkdownExportFileName(document: ActiveDocument) {
    const id = document.kind === 'published' ? document.id : document.localId
    const safeId = id.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    return `essay_${safeId}.md`
}

function getPdfExportFileName(document: ActiveDocument) {
    return getMarkdownExportFileName(document).replace(/\.md$/, '.pdf')
}

function getDocxExportFileName(document: ActiveDocument) {
    return getMarkdownExportFileName(document).replace(/\.md$/, '.docx')
}

function AppContent() {
    const { toast } = useToast()
    const [page, setPage] = useState<AppPage>('editor')
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [activeDocument, setActiveDocument] =
        useState<ActiveDocument | null>(null)
    const [localDrafts, setLocalDrafts] = useState<LocalDraft[]>([])
    const [localDraftsReady, setLocalDraftsReady] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [exportingDocx, setExportingDocx] = useState(false)
    const [exportingPdf, setExportingPdf] = useState(false)
    const [updating, setUpdating] = useState(false)
    const editorRef = useRef<MarkdownEditorHandle>(null)
    const localDraftsRef = useRef<LocalDraft[]>([])
    const pendingPublishRef = useRef<PendingPublish | null>(null)
    const pendingSwitchMeasureRef = useRef<{
        activeDuration?: number
        key: string
        startMark: string
    }>()
    const switchReadySamplesRef = useRef<number[]>([])
    const switchMeasureSequenceRef = useRef(0)

    const settingsRepository = useMemo(createSettingsRepository, [])
    const draftRepository = useMemo(createDraftRepository, [])
    const essayClient = useMemo(
        () => createEssayClient({ baseUrl: essayApiBaseUrl }),
        []
    )
    const essayActivityClient = useMemo(
        () => createEssayActivityClient({ baseUrl: essayApiBaseUrl }),
        []
    )
    const essayLibraryClient = useMemo(
        () => createEssayLibraryClient({ baseUrl: essayApiBaseUrl }),
        []
    )
    const essayLibraryCacheRepository = useMemo(
        createEssayLibraryCacheRepository,
        []
    )
    const themeClient = useMemo(
        () => createThemeClient({ baseUrl: essayApiBaseUrl }),
        []
    )
    const themeCacheRepository = useMemo(createThemeCacheRepository, [])
    const noteClient = useMemo(
        () => createNoteClient({baseUrl: essayApiBaseUrl}),
        []
    )
    const noteCacheRepository = useMemo(createNoteCacheRepository, [])

    localDraftsRef.current = localDrafts

    const notifySettingsLoadError = useCallback(() => {
        toast({
            title: '无法读取本地设置',
            description: '请稍后重试',
            variant: 'destructive',
        })
    }, [toast])

    const notifyAppearanceSaveError = useCallback(() => {
        toast({
            title: '无法保存外观设置',
            description: '本次选择会在当前运行期间保持生效',
            variant: 'destructive',
        })
    }, [toast])

    const notifyDraftError = useCallback(() => {
        toast({
            title: '无法保存本地草稿',
            description: '请复制文章内容并稍后重试',
            variant: 'destructive',
        })
    }, [toast])

    const settings = useSettingsController({
        repository: settingsRepository,
        onAppearanceSaveError: notifyAppearanceSaveError,
        onLoadError: notifySettingsLoadError,
    })
    const activeDocumentKey =
        activeDocument ? getDocumentKey(activeDocument) : 'loading'
    const draft = useDraftController({
        baselineContent:
            activeDocument?.kind === 'published'
                ? activeDocument.content
                : '',
        baselineIsPrivate:
            activeDocument?.kind === 'published'
                ? activeDocument.isPrivate
                : false,
        baselineThemeId:
            activeDocument?.kind === 'published'
                ? activeDocument.themeId
                : null,
        documentKey: activeDocumentKey,
        enabled: activeDocument !== null,
        persistBaseline: activeDocument?.kind === 'draft',
        repository: draftRepository,
        seed: getDocumentSeed(activeDocument),
        onError: notifyDraftError,
    })

    useLayoutEffect(() => {
        const pending = pendingSwitchMeasureRef.current
        if (
            !import.meta.env.DEV ||
            import.meta.env.MODE === 'test' ||
            !pending ||
            pending.key !== activeDocumentKey ||
            typeof performance.mark !== 'function'
        ) {
            return
        }
        const activeMark = `${pending.startMark}:active`
        performance.mark(activeMark)
        const measurement = performance.measure(
            'essay-switch-to-active',
            pending.startMark,
            activeMark
        )
        console.debug(
            `[performance] essay selection committed in ${measurement.duration.toFixed(1)}ms`
        )
        pending.activeDuration = measurement.duration
        performance.clearMarks(activeMark)
        performance.clearMeasures('essay-switch-to-active')
    }, [activeDocumentKey])

    const handleEditorReady = useCallback(
        (
            documentKey: string,
            editorMetrics?: MarkdownEditorReadyMetrics
        ) => {
            const pending = pendingSwitchMeasureRef.current
            if (
                !import.meta.env.DEV ||
                import.meta.env.MODE === 'test' ||
                !pending ||
                pending.key !== documentKey ||
                typeof performance.mark !== 'function' ||
                typeof performance.measure !== 'function'
            ) {
                return
            }
            const readyMark = `${pending.startMark}:editor-ready`
            performance.mark(readyMark)
            const measurement = performance.measure(
                'essay-switch-to-editor-ready',
                pending.startMark,
                readyMark
            )
            const samples = switchReadySamplesRef.current
            samples.push(measurement.duration)
            if (samples.length > 100) {
                samples.shift()
            }
            const message =
                `[performance] essay switch ready in ${measurement.duration.toFixed(1)}ms ` +
                `(n=${samples.length}, p50=${getPercentile(samples, 50).toFixed(1)}ms, ` +
                `p95=${getPercentile(samples, 95).toFixed(1)}ms, ` +
                `p99=${getPercentile(samples, 99).toFixed(1)}ms, ` +
                `active=${pending.activeDuration?.toFixed(1) ?? 'unknown'}ms, ` +
                `editor-prepare=${editorMetrics?.prepareTransactionDuration.toFixed(1) ?? 'unknown'}ms, ` +
                `editor-update=${editorMetrics?.updateViewDuration.toFixed(1) ?? 'unknown'}ms, ` +
                `editor-scroll=${editorMetrics?.resetScrollDuration.toFixed(1) ?? 'unknown'}ms, ` +
                `editor-measure=${editorMetrics?.requestMeasureDuration.toFixed(1) ?? 'unknown'}ms, ` +
                `editor-total=${editorMetrics?.totalDuration.toFixed(1) ?? 'unknown'}ms)`
            console.debug(message)
            performance.clearMarks(readyMark)
            performance.clearMeasures('essay-switch-to-editor-ready')
            pendingSwitchMeasureRef.current = undefined
        },
        []
    )

    const notifyActivityError = useCallback(
        (message: string) => {
            toast({
                title: '无法同步 Essay 数据',
                description: message,
                variant: 'destructive',
            })
        },
        [toast]
    )
    const activity = useEssayActivityController({
        accessToken: settings.accessToken,
        client: essayActivityClient,
        enabled: settings.ready,
        onError: notifyActivityError,
    })
    const themes = useThemeController({
        accessToken: settings.accessToken,
        cacheRepository: themeCacheRepository,
        client: themeClient,
        enabled: settings.ready,
    })
    const resolveThemeId = useCallback(
        (themeSlug: string | null) =>
            themeSlug === null
                ? null
                : (themes.themes.find(
                    (theme) => theme.slug === themeSlug
                )?.id ?? null),
        [themes.themes]
    )

    const notifyEssayListError = useCallback(
        (message: string) => {
            toast({
                title: '无法加载个人文章',
                description: message,
                variant: 'destructive',
            })
        },
        [toast]
    )
    const library = useEssayLibraryController({
        accessToken: settings.accessToken,
        cacheRepository: essayLibraryCacheRepository,
        client: essayLibraryClient,
        date: selectedDate,
        draftRepository,
        enabled: Boolean(settings.ready && settings.accessToken),
        onError: notifyEssayListError,
        resolveThemeId,
        userId: activity.user?.id ?? '',
    })

    const notifyPublishError = useCallback(
        (message: string) => {
            toast({
                title: '发布失败',
                description: message,
                variant: 'destructive',
            })
        },
        [toast]
    )

    const handlePublishSuccess = useCallback(
        async (id: string) => {
            const publishedDraft = pendingPublishRef.current
            if (!publishedDraft) {
                return
            }
            pendingPublishRef.current = null

            setLocalDrafts((current) =>
                current.filter(
                    (draft) => draft.localId !== publishedDraft.localId
                )
            )
            setActiveDocument((current) =>
                current?.kind === 'draft' &&
                    current.localId === publishedDraft.localId
                    ? {
                        kind: 'published',
                        id,
                        content: publishedDraft.content,
                        draftSeed: {
                            content: publishedDraft.content,
                            isPrivate: publishedDraft.isPrivate,
                            themeId: publishedDraft.themeId,
                            updatedAt: 0,
                        },
                        isPrivate: publishedDraft.isPrivate,
                        themeId: publishedDraft.themeId,
                        themeSlug: publishedDraft.themeSlug,
                    }
                    : current
            )
            library.commitPublish(
                id,
                publishedDraft.content,
                publishedDraft.isPrivate,
                publishedDraft.themeId,
                publishedDraft.themeSlug
            )

            try {
                await draftRepository.removeLocalDraft(
                    publishedDraft.localId
                )
            } catch {
                toast({
                    title: '文章已发布，但无法清理本地草稿',
                    description: '远端文章已保存，请勿再次发布该草稿',
                    variant: 'destructive',
                })
            }

            library.refresh()
            activity.refresh()
            toast({
                title: '文章已发布',
                description: '',
                variant: 'success',
                action: (
                    <ToastAction
                        altText="查看新发布文章"
                        onClick={() =>
                            void tauriDesktopAdapter.openExternal(
                                `https://www.essay.ink/essays/${id}`
                            )
                        }
                    >
                        <Open20Regular aria-hidden="true" />
                    </ToastAction>
                ),
            })
        },
        [activity, draftRepository, library, toast]
    )

    const publishing = usePublishingController({
        client: essayClient,
        onError: notifyPublishError,
        onSuccess: handlePublishSuccess,
    })

    const requestEditorMeasure = useCallback(() => {
        editorRef.current?.requestMeasure()
    }, [])
    const layout = useSidebarLayout({
        page,
        onLayoutChange: requestEditorMeasure,
    })

    const notifyNoteError = useCallback(
        (message: string) => {
            toast({
                title: '无法同步笔记',
                description: message,
                variant: 'destructive',
            })
        },
        [toast]
    )
    const notes = useNoteController({
        accessToken: settings.accessToken,
        active: layout.rightSidebarVisible,
        cacheRepository: noteCacheRepository,
        client: noteClient,
        enabled: Boolean(settings.ready && settings.accessToken),
        onError: notifyNoteError,
    })

    useEffect(() => {
        let cancelled = false

        void (async () => {
            const drafts = await draftRepository.listOrCreateLocalDrafts()
            if (cancelled) {
                return
            }

            const sortedDrafts = sortDrafts(drafts)
            setLocalDrafts(sortedDrafts)
            setActiveDocument(activateDraft(sortedDrafts[0]))
            setLocalDraftsReady(true)
        })().catch(() => {
            if (cancelled) {
                return
            }
            const fallbackDraft = createRecoveryDraft()
            setLocalDrafts([fallbackDraft])
            setActiveDocument(activateDraft(fallbackDraft))
            setLocalDraftsReady(true)
            notifyDraftError()
        })

        return () => {
            cancelled = true
        }
    }, [draftRepository, notifyDraftError])

    useEffect(() => {
        if (activeDocument?.kind !== 'published') {
            return
        }
        const resolvedThemeId = resolveThemeId(activeDocument.themeSlug)
        if (resolvedThemeId !== activeDocument.themeId) {
            setActiveDocument({
                ...activeDocument,
                draftSeed:
                    activeDocument.draftSeed.updatedAt === 0
                        ? {
                            ...activeDocument.draftSeed,
                            themeId: resolvedThemeId,
                        }
                        : activeDocument.draftSeed,
                themeId: resolvedThemeId,
            })
        }
    }, [activeDocument, resolveThemeId])

    useEffect(() => {
        if (
            activeDocument?.kind !== 'draft' ||
            !draft.ready ||
            !localDraftsReady
        ) {
            return
        }

        setLocalDrafts((current) =>
            sortDrafts(
                current.map((entry) =>
                    entry.localId === activeDocument.localId
                        ? {
                            ...entry,
                            content: draft.content,
                            isPrivate: draft.isPrivate,
                            themeId: draft.themeId,
                            updatedAt: draft.updatedAt || entry.updatedAt,
                        }
                        : entry
                )
            )
        )
    }, [
        activeDocument?.kind,
        activeDocument?.kind === 'draft'
            ? activeDocument.localId
            : null,
        draft.content,
        draft.isPrivate,
        draft.ready,
        draft.themeId,
        draft.updatedAt,
        localDraftsReady,
    ])

    useEffect(() => {
        void tauriDesktopAdapter.showMainWindow().catch((error) => {
            console.error('Failed to show the main window', error)
        })
    }, [])

    useEffect(() => {
        let unlisten: (() => void) | undefined
        let cancelled = false
        void tauriDesktopAdapter
            .interceptClose(draft.flushAll)
            .then((nextUnlisten) => {
                if (cancelled) {
                    nextUnlisten()
                } else {
                    unlisten = nextUnlisten
                }
            })
            .catch((error) => {
                console.error('Failed to register the close handler', error)
            })
        return () => {
            cancelled = true
            unlisten?.()
        }
    }, [draft.flushAll])

    const openSettings = () => {
        setPage('settings')
        if (layout.isNarrow) {
            layout.closeMobileSidebar()
        }
    }

    const returnToEditor = async () => {
        const saved = await settings.flushApiKeySave()
        if (!saved) {
            return
        }

        setPage('editor')
        requestAnimationFrame(() => {
            editorRef.current?.requestMeasure()
            editorRef.current?.focus()
        })
    }

    const saveDocument = async () => {
        if (!activeDocument) {
            return
        }
        if (!settings.accessToken) {
            openSettings()
            toast({
                title: '请先设置 API Key',
                description: '填写后会自动保存在当前设备',
                variant: 'destructive',
            })
            return
        }

        const saved = await draft.flush()
        if (!saved) {
            return
        }

        const content = editorRef.current?.getValue() ?? draft.content
        if (!content.trim()) {
            return
        }
        const selectedTheme = themes.themes.find(
            (theme) => theme.id === draft.themeId
        )
        const themeSlug = selectedTheme?.slug ?? null
        if (activeDocument.kind === 'draft') {
            pendingPublishRef.current = {
                localId: activeDocument.localId,
                content,
                isPrivate: draft.isPrivate,
                themeId: draft.themeId,
                themeSlug,
            }
            const published = await publishing.publish(
                content,
                draft.themeId,
                draft.isPrivate,
                settings.accessToken
            )
            if (!published) {
                pendingPublishRef.current = null
            }
            return
        }
        if (
            content === activeDocument.content &&
            draft.isPrivate === activeDocument.isPrivate &&
            draft.themeId === activeDocument.themeId
        ) {
            return
        }

        setUpdating(true)
        try {
            await essayLibraryClient.update(
                activeDocument.id,
                content,
                draft.themeId,
                draft.isPrivate,
                settings.accessToken
            )
            await draft.clear()
            library.commitUpdate(
                activeDocument.id,
                content,
                draft.isPrivate,
                draft.themeId,
                themeSlug
            )
            setActiveDocument({
                kind: 'published',
                id: activeDocument.id,
                content,
                draftSeed: {
                    content,
                    isPrivate: draft.isPrivate,
                    themeId: draft.themeId,
                    updatedAt: 0,
                },
                isPrivate: draft.isPrivate,
                themeId: draft.themeId,
                themeSlug,
            })
            toast({ title: '文章已更新', variant: 'success' })
        } catch (error) {
            toast({
                title: '更新失败',
                description:
                    error instanceof Error
                        ? error.message
                        : '请稍后重试',
                variant: 'destructive',
            })
        } finally {
            setUpdating(false)
        }
    }

    const showEditor = () => {
        setPage('editor')
        if (layout.isNarrow) {
            layout.closeMobileSidebar()
        }
        requestAnimationFrame(() => editorRef.current?.focus())
    }

    const activateFirstAvailableDocument = async (
        remainingDrafts: LocalDraft[],
        remainingEssays: EssayListEntry[]
    ) => {
        const firstDraft = sortDrafts(remainingDrafts)[0]
        if (firstDraft) {
            setActiveDocument(activateDraft(firstDraft))
            return
        }

        const firstEssay = remainingEssays[0]
        if (firstEssay) {
            setActiveDocument(activateEssay(firstEssay))
            return
        }

        try {
            const nextDraft = await draftRepository.createLocalDraft()
            setLocalDrafts([nextDraft])
            setActiveDocument(activateDraft(nextDraft))
        } catch {
            const fallbackDraft = createRecoveryDraft()
            setLocalDrafts([fallbackDraft])
            setActiveDocument(activateDraft(fallbackDraft))
            notifyDraftError()
        }
    }

    const deleteDocument = async () => {
        if (!activeDocument || deleting) {
            return false
        }

        const target = activeDocument
        setDeleting(true)
        try {
            if (target.kind === 'draft') {
                const cleared = await draft.clear(false)
                if (!cleared) {
                    throw new Error('无法删除本地草稿，请稍后重试')
                }

                const remainingDrafts = localDraftsRef.current.filter(
                    (entry) => entry.localId !== target.localId
                )
                setLocalDrafts(remainingDrafts)
                await activateFirstAvailableDocument(
                    remainingDrafts,
                    library.entries
                )
                return true
            }

            if (!settings.accessToken) {
                throw new Error('请先设置 API Key')
            }

            await essayLibraryClient.remove(
                target.id,
                settings.accessToken
            )
            await draft.clear(false)
            const remainingEssays = library.entries.filter(
                (entry) => entry.id !== target.id
            )
            library.commitRemove(target.id)
            await activateFirstAvailableDocument(
                localDraftsRef.current,
                remainingEssays
            )
            library.refresh()
            activity.refresh()
            return true
        } catch (error) {
            toast({
                title: '删除失败',
                description:
                    error instanceof Error
                        ? error.message
                        : '请稍后重试',
                variant: 'destructive',
            })
            return false
        } finally {
            setDeleting(false)
        }
    }

    const createDraft = async () => {
        if (activeDocument && !(await draft.flush())) {
            return
        }

        const emptyDraft = localDraftsRef.current.find(
            (entry) =>
                !entry.content.trim() &&
                !entry.isPrivate &&
                entry.themeId === null
        )
        if (emptyDraft) {
            setActiveDocument(activateDraft(emptyDraft))
            showEditor()
            return
        }

        try {
            const nextDraft = await draftRepository.createLocalDraft()
            setLocalDrafts((current) =>
                sortDrafts([nextDraft, ...current])
            )
            setActiveDocument(activateDraft(nextDraft))
            showEditor()
        } catch {
            notifyDraftError()
        }
    }

    const activateDocument = (nextDocument: ActiveDocument) => {
        const nextDocumentKey = getDocumentKey(nextDocument)
        let startMark: string | undefined
        if (
            import.meta.env.DEV &&
            import.meta.env.MODE !== 'test' &&
            typeof performance.mark === 'function'
        ) {
            const sequence = switchMeasureSequenceRef.current + 1
            switchMeasureSequenceRef.current = sequence
            startMark = `essay-switch:${sequence}:click`
            performance.mark(startMark)
            pendingSwitchMeasureRef.current = {
                key: nextDocumentKey,
                startMark,
            }
        }
        const saveTask = activeDocument
            ? draft.flush()
            : Promise.resolve(true)
        setActiveDocument(nextDocument)
        showEditor()
        void saveTask.finally(() => {
            if (
                !startMark ||
                typeof performance.mark !== 'function' ||
                typeof performance.measure !== 'function'
            ) {
                return
            }
            const saveMark = `${startMark}:save-settled`
            performance.mark(saveMark)
            const measurement = performance.measure(
                'essay-switch-background-save',
                startMark,
                saveMark
            )
            console.debug(
                `[performance] previous essay saved in ${measurement.duration.toFixed(1)}ms`
            )
            performance.clearMarks(saveMark)
            performance.clearMeasures('essay-switch-background-save')
        })
    }

    const selectDraft = (nextDraft: LocalDraft) => {
        if (
            activeDocument?.kind === 'draft' &&
            activeDocument.localId === nextDraft.localId
        ) {
            showEditor()
            return
        }
        activateDocument(activateDraft(nextDraft))
    }

    const selectEssay = (essay: EssayListEntry) => {
        if (
            activeDocument?.kind === 'published' &&
            activeDocument.id === essay.id
        ) {
            showEditor()
            return
        }
        activateDocument(activateEssay(essay))
    }

    const changeSelectedDate = (date: string | null) => {
        if (activeDocument) {
            void draft.flush()
        }
        setSelectedDate(date)
    }

    const exportMarkdown = async () => {
        if (!activeDocument || !draft.ready) {
            return
        }

        const content = editorRef.current?.getValue() ?? draft.content
        try {
            const exported = await tauriDesktopAdapter.exportMarkdown(
                content,
                getMarkdownExportFileName(activeDocument)
            )
            if (exported) {
                toast({title: 'Markdown 文件已导出', variant: 'success'})
            }
        } catch (error) {
            toast({
                title: '导出失败',
                description:
                    error instanceof Error
                        ? error.message
                        : '请稍后重试',
                variant: 'destructive',
            })
        }
    }

    const exportPdf = async () => {
        if (!activeDocument || !draft.ready || exportingPdf) {
            return
        }

        const content = editorRef.current?.getValue() ?? draft.content
        setExportingPdf(true)
        try {
            const pdf = await createMarkdownPdf(content)
            const exported = await tauriDesktopAdapter.exportPdf(
                pdf,
                getPdfExportFileName(activeDocument)
            )
            if (exported) {
                toast({title: 'PDF 文件已导出', variant: 'success'})
            }
        } catch (error) {
            toast({
                title: '导出失败',
                description:
                    error instanceof Error
                        ? error.message
                        : '请稍后重试',
                variant: 'destructive',
            })
        } finally {
            setExportingPdf(false)
        }
    }

    const exportDocx = async () => {
        if (!activeDocument || !draft.ready || exportingDocx) {
            return
        }

        const content = editorRef.current?.getValue() ?? draft.content
        setExportingDocx(true)
        try {
            const {createMarkdownDocx} = await import(
                '@/features/editor/markdown-docx'
            )
            const docx = await createMarkdownDocx(content)
            const exported = await tauriDesktopAdapter.exportDocx(
                docx,
                getDocxExportFileName(activeDocument)
            )
            if (exported) {
                toast({title: 'DOCX 文件已导出', variant: 'success'})
            }
        } catch (error) {
            toast({
                title: '导出失败',
                description:
                    error instanceof Error
                        ? error.message
                        : '请稍后重试',
                variant: 'destructive',
            })
        } finally {
            setExportingDocx(false)
        }
    }

    const handleContentChange = (content: string) => {
        if (!activeDocument) {
            return
        }
        draft.onContentChange(content)
        const updatedAt = Date.now()
        if (activeDocument.kind === 'draft') {
            setActiveDocument({ ...activeDocument, content, updatedAt })
            setLocalDrafts((current) =>
                sortDrafts(
                    current.map((entry) =>
                        entry.localId === activeDocument.localId
                            ? { ...entry, content, updatedAt }
                            : entry
                    )
                )
            )
            return
        }
        library.setLocalDraft(
            activeDocument.id,
            content,
            draft.isPrivate,
            draft.themeId,
            updatedAt,
            content !== activeDocument.content ||
                draft.isPrivate !== activeDocument.isPrivate ||
                draft.themeId !== activeDocument.themeId
        )
    }

    const handleThemeChange = (themeId: number | null) => {
        if (!activeDocument) {
            return
        }
        draft.onThemeChange(themeId)
        const updatedAt = Date.now()
        if (activeDocument.kind === 'draft') {
            setActiveDocument({ ...activeDocument, themeId, updatedAt })
            setLocalDrafts((current) =>
                sortDrafts(
                    current.map((entry) =>
                        entry.localId === activeDocument.localId
                            ? { ...entry, themeId, updatedAt }
                            : entry
                    )
                )
            )
            return
        }
        const content = editorRef.current?.getValue() ?? draft.content
        library.setLocalDraft(
            activeDocument.id,
            content,
            draft.isPrivate,
            themeId,
            updatedAt,
            content !== activeDocument.content ||
            draft.isPrivate !== activeDocument.isPrivate ||
            themeId !== activeDocument.themeId
        )
    }

    const handlePrivateChange = (isPrivate: boolean) => {
        if (!activeDocument) {
            return
        }
        draft.onPrivateChange(isPrivate)
        const updatedAt = Date.now()
        if (activeDocument.kind === 'draft') {
            setActiveDocument({...activeDocument, isPrivate, updatedAt})
            setLocalDrafts((current) =>
                sortDrafts(
                    current.map((entry) =>
                        entry.localId === activeDocument.localId
                            ? {...entry, isPrivate, updatedAt}
                            : entry
                    )
                )
            )
            return
        }
        const content = editorRef.current?.getValue() ?? draft.content
        library.setLocalDraft(
            activeDocument.id,
            content,
            isPrivate,
            draft.themeId,
            updatedAt,
            content !== activeDocument.content ||
                isPrivate !== activeDocument.isPrivate ||
                draft.themeId !== activeDocument.themeId
        )
    }

    const activeEssayEntry =
        activeDocument?.kind === 'published'
            ? library.entries.find(
                (entry) => entry.id === activeDocument.id
            )
            : undefined
    const documentStatus =
        activeDocument?.kind === 'published'
            ? getPublishedDocumentStatus({
                baselineContent: activeDocument.content,
                baselineIsPrivate: activeDocument.isPrivate,
                currentContent: draft.content,
                currentIsPrivate: draft.isPrivate,
                baselineThemeId: activeDocument.themeId,
                currentThemeId: draft.themeId,
                draftReady: draft.ready,
                hasKnownLocalChanges:
                    activeEssayEntry?.localContent !== undefined,
            })
            : 'draft'
    const editorStatusLabel =
        documentStatus === 'draft'
            ? '草稿'
            : documentStatus === 'published'
                ? '已发布'
                : '已发布（在本地有更改）'
    const actionLabel =
        documentStatus === 'modified' ? '更新文章' : '发布文章'
    const listWaitingForUser = Boolean(
        settings.ready &&
        settings.accessToken &&
        !activity.user?.id &&
        activity.loading
    )
    const listError =
        settings.accessToken && activity.error && library.entries.length === 0
            ? activity.error
            : library.error
    const displayedThemeId = draft.ready
        ? draft.themeId
        : (activeDocument?.themeId ?? null)
    const displayedThemeIsUnknown = Boolean(
        activeDocument?.kind === 'published' &&
        activeDocument.themeSlug &&
        displayedThemeId === null &&
        (!draft.ready || draft.updatedAt === 0)
    )

    return (
        <AppShell
            accountError={activity.error !== null}
            accountLoading={activity.loading}
            articleCounts={activity.heatmap}
            editorStatusLabel={editorStatusLabel}
            editorToolbarActions={
                <>
                    <ThemeSelector
                        disabled={Boolean(
                            !activeDocument ||
                            !draft.ready ||
                            !localDraftsReady ||
                            !settings.accessToken ||
                            publishing.loading ||
                            updating ||
                            deleting
                        )}
                        loading={themes.loading}
                        onChange={handleThemeChange}
                        onOpen={() => void themes.refreshIfExpired()}
                        ready={themes.ready}
                        themes={themes.themes}
                        unknownSelection={displayedThemeIsUnknown}
                        value={displayedThemeId}
                    />
                    <ExportMenu
                        disabled={Boolean(
                            !activeDocument ||
                            !draft.ready ||
                            !localDraftsReady ||
                            publishing.loading ||
                            updating ||
                            deleting ||
                            exportingDocx ||
                            exportingPdf
                        )}
                        onExportDocx={exportDocx}
                        onExportMarkdown={exportMarkdown}
                        onExportPdf={exportPdf}
                    />
                    {activeDocument?.kind === 'published' && (
                        <button
                            type="button"
                            className="editor-open-button"
                            aria-label="打开已发布文章"
                            title="打开"
                            onClick={() =>
                                void tauriDesktopAdapter.openExternal(
                                    `https://www.essay.ink/essays/${activeDocument.id}`
                                )
                            }
                        >
                            <Open20Regular aria-hidden="true" />
                        </button>
                    )}
                    <DeleteDocumentButton
                        deleting={deleting}
                        disabled={Boolean(
                            !activeDocument ||
                            !draft.ready ||
                            !localDraftsReady ||
                            publishing.loading ||
                            updating ||
                            (activeDocument.kind === 'published' &&
                                !settings.accessToken)
                        )}
                        onDelete={deleteDocument}
                        published={activeDocument?.kind === 'published'}
                    />
                </>
            }
            hasAccessToken={Boolean(settings.accessToken)}
            layout={layout}
            onOpenSettings={openSettings}
            onSelectedDateChange={(date) => void changeSelectedDate(date)}
            page={page}
            rightSidebarContent={
                <NoteSidebar
                    enabled={Boolean(settings.ready && settings.accessToken)}
                    error={notes.error}
                    folders={notes.folders}
                    hasMore={notes.hasMore}
                    loading={notes.loading}
                    loadingMore={notes.loadingMore}
                    moreError={notes.moreError}
                    mutating={notes.mutating}
                    notes={notes.notes}
                    onCreate={notes.createNote}
                    onLoadMore={() => void notes.loadMore()}
                    onOpenSettings={openSettings}
                    onRefresh={() => void notes.refresh()}
                    onRemove={notes.removeNote}
                    onRetry={() => void notes.retry()}
                    onSearch={(query) => void notes.search(query)}
                    onUpdate={notes.updateNote}
                    query={notes.query}
                    refreshing={notes.refreshing}
                />
            }
            selectedDate={selectedDate}
            sidebarTitlebarContent={<SidebarUpdateStatus />}
            sidebarContent={
                <SidebarEssayList
                    activeDocumentId={activeDocumentKey}
                    drafts={localDrafts}
                    entries={library.entries}
                    error={listError}
                    hasMore={library.hasMore}
                    loading={
                        !settings.ready ||
                        (listWaitingForUser && library.entries.length === 0) ||
                        (library.loading && !activity.error)
                    }
                    loadingMore={library.loadingMore}
                    moreError={library.moreError}
                    onCreateDraft={() => void createDraft()}
                    onLoadMore={() => void library.loadMore()}
                    onRefresh={library.refresh}
                    onRetry={
                        activity.error ? activity.refresh : library.retry
                    }
                    onSelectDraft={(entry) => void selectDraft(entry)}
                    onSelectEssay={(essay) => void selectEssay(essay)}
                    refreshDisabled={Boolean(
                        !settings.accessToken ||
                        !activity.user?.id ||
                        activity.error ||
                        library.loadingMore
                    )}
                    refreshing={library.refreshing}
                    selectedDate={selectedDate}
                />
            }
            storeReady={settings.ready}
            user={activity.user}
        >
            <EditorPage
                ref={editorRef}
                active={page === 'editor'}
                actionLabel={actionLabel}
                backupTimestamp={draft.updatedAt}
                content={draft.content}
                disabled={publishing.loading || updating || deleting}
                documentKey={activeDocumentKey}
                isPrivate={draft.isPrivate}
                loading={publishing.loading || updating}
                onContentChange={handleContentChange}
                onEditorReady={handleEditorReady}
                onPrivateChange={handlePrivateChange}
                onPublish={() => void saveDocument()}
                publishReady={Boolean(
                    activeDocument &&
                    draft.ready &&
                    localDraftsReady &&
                    settings.ready &&
                    draft.content.trim() &&
                    documentStatus !== 'published'
                )}
                ready={Boolean(
                    activeDocument && draft.ready && localDraftsReady
                )}
            />
            <div
                className={`settings-page-container ${page === 'settings' ? '' : 'is-page-hidden'
                    }`}
                aria-hidden={page !== 'settings'}
            >
                <SettingsPage
                    value={settings.apiKeyDraft}
                    saveStatus={settings.saveStatus}
                    disabled={!settings.ready}
                    onChange={settings.scheduleApiKeySave}
                    onBlur={() => void settings.flushApiKeySave()}
                    appearance={settings.appearance}
                    onAppearanceChange={settings.changeAppearance}
                    onBack={returnToEditor}
                />
            </div>
        </AppShell>
    )
}

export default function App() {
    return (
        <UpdaterProvider>
            <AppContent />
        </UpdaterProvider>
    )
}
