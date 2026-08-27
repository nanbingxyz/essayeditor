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
    EditorPage,
    NEW_DRAFT_KEY,
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
import {ToastAction, useToast} from '@/shared/ui'
import {tauriDesktopAdapter} from '@/shared/platform/desktop'

import {essayApiBaseUrl} from './essay-api-config'

type ActiveDocument =
    | {kind: 'new'}
    | {kind: 'published'; content: string; id: string}

export default function App() {
    const {toast} = useToast()
    const [page, setPage] = useState<AppPage>('editor')
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [activeDocument, setActiveDocument] = useState<ActiveDocument>({
        kind: 'new',
    })
    const [newDraftContent, setNewDraftContent] = useState('')
    const [updating, setUpdating] = useState(false)
    const editorRef = useRef<MarkdownEditorHandle>(null)

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
    const draft = useDraftController({
        baselineContent:
            activeDocument.kind === 'published'
                ? activeDocument.content
                : '',
        documentKey:
            activeDocument.kind === 'published'
                ? `essay:${activeDocument.id}`
                : NEW_DRAFT_KEY,
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
            await draft.clear()
            editorRef.current?.setValue('')
            setNewDraftContent('')
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
        [activity, draft, library, toast]
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
        if (activeDocument.kind === 'new' && draft.ready) {
            setNewDraftContent(draft.content)
        }
    }, [activeDocument.kind, draft.content, draft.ready])

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
        if (activeDocument.kind === 'new') {
            await publishing.publish(content, settings.accessToken)
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

    const selectNewDocument = async () => {
        if (activeDocument.kind === 'new') {
            showEditor()
            return
        }
        if (!(await draft.flush())) {
            return
        }
        setActiveDocument({kind: 'new'})
        showEditor()
    }

    const selectEssay = async (essay: EssayListEntry) => {
        if (
            activeDocument.kind === 'published' &&
            activeDocument.id === essay.id
        ) {
            showEditor()
            return
        }
        if (!(await draft.flush())) {
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
        if (!(await draft.flush())) {
            return
        }
        setSelectedDate(date)
    }

    const handleContentChange = (content: string) => {
        draft.onContentChange(content)
        if (activeDocument.kind === 'new') {
            setNewDraftContent(content)
            return
        }
        library.setLocalContent(
            activeDocument.id,
            content === activeDocument.content ? null : content
        )
    }

    const documentStatus =
        activeDocument.kind === 'new'
            ? 'draft'
            : draft.content === activeDocument.content
              ? 'published'
              : 'modified'
    const editorStatusLabel =
        documentStatus === 'draft'
            ? '未发布（草稿）'
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
            hasAccessToken={Boolean(settings.accessToken)}
            layout={layout}
            onOpenSettings={openSettings}
            onSelectedDateChange={(date) => void changeSelectedDate(date)}
            page={page}
            selectedDate={selectedDate}
            sidebarContent={
                <SidebarEssayList
                    activeEssayId={
                        activeDocument.kind === 'published'
                            ? activeDocument.id
                            : null
                    }
                    activeIsNew={activeDocument.kind === 'new'}
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
                    newDraftContent={newDraftContent}
                    onLoadMore={() => void library.loadMore()}
                    onRetry={
                        activity.error ? activity.refresh : library.retry
                    }
                    onSelectEssay={(essay) => void selectEssay(essay)}
                    onSelectNew={() => void selectNewDocument()}
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
                editorKey={
                    activeDocument.kind === 'published'
                        ? `essay:${activeDocument.id}`
                        : NEW_DRAFT_KEY
                }
                initialContent={draft.initialContent}
                loading={publishing.loading || updating}
                onContentChange={handleContentChange}
                onPublish={() => void saveDocument()}
                publishReady={
                    draft.ready &&
                    settings.ready &&
                    documentStatus !== 'published'
                }
                ready={draft.ready}
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
