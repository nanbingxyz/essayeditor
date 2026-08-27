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
    type MarkdownEditorHandle,
    useDraftController,
} from '@/features/editor'
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

export default function App() {
    const {toast} = useToast()
    const [page, setPage] = useState<AppPage>('editor')
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
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
            editorRef.current?.setValue('')
            await draft.clear()
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
        [draft, toast]
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

    const publish = async () => {
        if (!settings.accessToken) {
            openSettings()
            toast({
                title: '请先设置 API Key',
                description: '填写后会自动保存在当前设备',
                variant: 'destructive',
            })
            return
        }

        await draft.flush()
        const content = editorRef.current?.getValue() ?? ''
        await publishing.publish(content, settings.accessToken)
    }

    return (
        <AppShell
            accountError={activity.error !== null}
            accountLoading={activity.loading}
            articleCounts={activity.heatmap}
            hasAccessToken={Boolean(settings.accessToken)}
            layout={layout}
            onOpenSettings={openSettings}
            onSelectedDateChange={setSelectedDate}
            page={page}
            selectedDate={selectedDate}
            storeReady={settings.ready}
            user={activity.user}
        >
            <EditorPage
                ref={editorRef}
                active={page === 'editor'}
                backupTimestamp={draft.updatedAt}
                initialContent={draft.initialContent}
                loading={publishing.loading}
                onContentChange={draft.onContentChange}
                onPublish={() => void publish()}
                publishReady={draft.ready && settings.ready}
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
