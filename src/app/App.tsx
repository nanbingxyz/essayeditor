import '@fontsource/barlow/latin-400.css'
import '@fontsource/barlow/latin-500.css'
import '@fontsource/barlow/latin-600.css'
import '@fontsource/barlow/latin-700.css'
import '@fontsource-variable/noto-serif-sc'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {
    createEssayActivityClient,
    useEssayActivityController,
} from '@/features/activity'
import {
    createDraftRepository,
    DeleteDocumentButton,
    EditorPage,
    getLocalDraftDocumentKey,
    type LocalDraft,
    type MarkdownEditorHandle,
    useDraftController,
} from '@/features/editor'
import {
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
    createEssayClient,
    usePublishingController,
} from '@/features/publishing'
import {
    createSettingsRepository,
    SettingsPage,
    useSettingsController,
} from '@/features/settings'
import {tauriDesktopAdapter} from '@/shared/platform/desktop'
import {ToastAction, useToast} from '@/shared/ui'

import {essayApiBaseUrl} from './essay-api-config'
import {getPublishedDocumentStatus} from './document-status'

type ActiveDocument =
    | ({kind: 'draft'} & LocalDraft)
    | {kind: 'published'; content: string; id: string}

interface PendingPublish {
    content: string
    localId: string
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
    return {kind: 'draft', ...draft}
}

function createRecoveryDraft(): LocalDraft {
    const timestamp = Date.now()
    return {
        localId: `recovery-${timestamp}`,
        content: '',
        createdAt: timestamp,
        updatedAt: timestamp,
    }
}

export default function App() {
    const {toast} = useToast()
    const [page, setPage] = useState<AppPage>('editor')
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [activeDocument, setActiveDocument] =
        useState<ActiveDocument | null>(null)
    const [localDrafts, setLocalDrafts] = useState<LocalDraft[]>([])
    const [localDraftsReady, setLocalDraftsReady] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [updating, setUpdating] = useState(false)
    const editorRef = useRef<MarkdownEditorHandle>(null)
    const localDraftsRef = useRef<LocalDraft[]>([])
    const pendingPublishRef = useRef<PendingPublish | null>(null)

    const settingsRepository = useMemo(createSettingsRepository, [])
    const draftRepository = useMemo(createDraftRepository, [])
    const essayClient = useMemo(
        () => createEssayClient({baseUrl: essayApiBaseUrl}),
        []
    )
    const essayActivityClient = useMemo(
        () => createEssayActivityClient({baseUrl: essayApiBaseUrl}),
        []
    )
    const essayLibraryClient = useMemo(
        () => createEssayLibraryClient({baseUrl: essayApiBaseUrl}),
        []
    )

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
        activeDocument?.kind === 'published'
            ? `essay:${activeDocument.id}`
            : activeDocument?.kind === 'draft'
              ? getLocalDraftDocumentKey(activeDocument.localId)
              : 'loading'
    const draft = useDraftController({
        baselineContent:
            activeDocument?.kind === 'published'
                ? activeDocument.content
                : '',
        documentKey: activeDocumentKey,
        persistBaseline: activeDocument?.kind === 'draft',
        repository: draftRepository,
        onError: notifyDraftError,
    })

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
        client: essayLibraryClient,
        date: selectedDate,
        draftRepository,
        enabled: Boolean(
            settings.ready && settings.accessToken && activity.user?.id
        ),
        onError: notifyEssayListError,
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
                      }
                    : current
            )
            if (!selectedDate) {
                library.commitPublish(id, publishedDraft.content)
            }

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
                description: '你可以点击右侧按钮查看新发布的文章',
                action: (
                    <ToastAction
                        altText="查看新发布文章"
                        onClick={() =>
                            void tauriDesktopAdapter.openExternal(
                                `https://www.essay.ink/essays/${id}`
                            )
                        }
                    >
                        查看
                    </ToastAction>
                ),
            })
        },
        [activity, draftRepository, library, selectedDate, toast]
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

    useEffect(() => {
        let cancelled = false

        void (async () => {
            let drafts = await draftRepository.listLocalDrafts()
            if (drafts.length === 0) {
                drafts = [await draftRepository.createLocalDraft()]
            }
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
        draft.ready,
        draft.updatedAt,
        localDraftsReady,
    ])

    useEffect(() => {
        void tauriDesktopAdapter.showMainWindow().catch((error) => {
            console.error('Failed to show the main window', error)
        })
    }, [])

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
        if (activeDocument.kind === 'draft') {
            pendingPublishRef.current = {
                localId: activeDocument.localId,
                content,
            }
            const published = await publishing.publish(
                content,
                settings.accessToken
            )
            if (!published) {
                pendingPublishRef.current = null
            }
            return
        }
        if (content === activeDocument.content) {
            return
        }

        setUpdating(true)
        try {
            await essayLibraryClient.update(
                activeDocument.id,
                content,
                settings.accessToken
            )
            await draft.clear()
            library.commitUpdate(activeDocument.id, content)
            setActiveDocument({
                kind: 'published',
                id: activeDocument.id,
                content,
            })
            toast({title: '文章已更新'})
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
            setActiveDocument({
                kind: 'published',
                id: firstEssay.id,
                content: firstEssay.content,
            })
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
                toast({title: '草稿已删除'})
                return true
            }

            if (!settings.accessToken) {
                throw new Error('请先设置 API Key')
            }

            await essayLibraryClient.remove(
                target.id,
                settings.accessToken
            )
            const localBackupCleared = await draft.clear(false)
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

            if (localBackupCleared) {
                toast({title: '文章已删除'})
            } else {
                toast({
                    title: '文章已删除，但无法清理本地备份',
                    description: '网站上的文章已删除，本地备份可能仍占用少量空间',
                    variant: 'destructive',
                })
            }
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
            (entry) => !entry.content.trim()
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

    const selectDraft = async (nextDraft: LocalDraft) => {
        if (
            activeDocument?.kind === 'draft' &&
            activeDocument.localId === nextDraft.localId
        ) {
            showEditor()
            return
        }
        if (activeDocument && !(await draft.flush())) {
            return
        }
        setActiveDocument(activateDraft(nextDraft))
        showEditor()
    }

    const selectEssay = async (essay: EssayListEntry) => {
        if (
            activeDocument?.kind === 'published' &&
            activeDocument.id === essay.id
        ) {
            showEditor()
            return
        }
        if (activeDocument && !(await draft.flush())) {
            return
        }
        setActiveDocument({
            kind: 'published',
            id: essay.id,
            content: essay.content,
        })
        showEditor()
    }

    const changeSelectedDate = async (date: string | null) => {
        if (activeDocument && !(await draft.flush())) {
            return
        }
        setSelectedDate(date)
    }

    const handleContentChange = (content: string) => {
        if (!activeDocument) {
            return
        }
        draft.onContentChange(content)
        if (activeDocument.kind === 'draft') {
            const updatedAt = Date.now()
            setActiveDocument({...activeDocument, content, updatedAt})
            setLocalDrafts((current) =>
                sortDrafts(
                    current.map((entry) =>
                        entry.localId === activeDocument.localId
                            ? {...entry, content, updatedAt}
                            : entry
                    )
                )
            )
            return
        }
        library.setLocalContent(
            activeDocument.id,
            content === activeDocument.content ? null : content
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
                  currentContent: draft.content,
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
        settings.accessToken && activity.error ? activity.error : library.error

    return (
        <AppShell
            accountError={activity.error !== null}
            accountLoading={activity.loading}
            articleCounts={activity.heatmap}
            editorStatusLabel={editorStatusLabel}
            editorToolbarActions={
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
            }
            hasAccessToken={Boolean(settings.accessToken)}
            layout={layout}
            onOpenSettings={openSettings}
            onSelectedDateChange={(date) => void changeSelectedDate(date)}
            page={page}
            selectedDate={selectedDate}
            sidebarContent={
                <SidebarEssayList
                    activeDocumentId={activeDocumentKey}
                    drafts={localDrafts}
                    entries={library.entries}
                    error={listError}
                    hasMore={library.hasMore}
                    loading={
                        !settings.ready ||
                        listWaitingForUser ||
                        library.loading
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
                        !settings.accessToken || activity.error
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
                disabled={publishing.loading || updating || deleting}
                editorKey={activeDocumentKey}
                initialContent={draft.initialContent}
                loading={publishing.loading || updating}
                onContentChange={handleContentChange}
                onPublish={() => void saveDocument()}
                publishReady={Boolean(
                    activeDocument &&
                        draft.ready &&
                        localDraftsReady &&
                        settings.ready &&
                        documentStatus !== 'published'
                )}
                ready={Boolean(
                    activeDocument && draft.ready && localDraftsReady
                )}
            />
            <div
                className={`settings-page-container ${
                    page === 'settings' ? '' : 'is-page-hidden'
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
