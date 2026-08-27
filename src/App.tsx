import './App.css'
import '@fontsource/barlow/latin-400.css'
import '@fontsource/barlow/latin-500.css'
import '@fontsource/barlow/latin-600.css'
import '@fontsource/barlow/latin-700.css'
import '@fontsource-variable/noto-serif-sc'
import {fetch} from '@tauri-apps/plugin-http'
import {open} from '@tauri-apps/plugin-shell'
import {getCurrentWindow} from '@tauri-apps/api/window'
import {GearIcon, PaperPlaneIcon, ShadowInnerIcon} from '@radix-ui/react-icons'
import {
    CircleUserRound,
    FileText,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
} from 'lucide-react'
import {
    type CSSProperties,
    type KeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react'

import MarkdownEditor, {
    MarkdownEditorHandle,
} from '@/components/markdown-editor'
import SettingsPage, {ApiKeySaveStatus} from '@/components/settings-page'
import SidebarCalendar, {
    type ArticleCountByDate,
} from '@/components/sidebar-calendar'
import {Button} from '@/components/ui/button'
import {ToastAction} from '@/components/ui/toast'
import useStore, {type Appearance, EssayStore} from '@/hooks/use-store'
import {useToast} from '@/hooks/use-toast'

import {debounce, getRelativeTime} from './utils'

type AppPage = 'editor' | 'settings'

const LEFT_SIDEBAR_WIDTH = 240
const MIN_EDITOR_WIDTH = 480
const SIDEBAR_BREAKPOINT = LEFT_SIDEBAR_WIDTH + MIN_EDITOR_WIDTH
const DEFAULT_RIGHT_SIDEBAR_WIDTH = 300
const MIN_RIGHT_SIDEBAR_WIDTH = 240
const MAX_RIGHT_SIDEBAR_WIDTH = 600
const RIGHT_SIDEBAR_RESIZE_STEP = 16
const API_KEY_SAVE_DELAY = 400
const EMPTY_ARTICLE_COUNTS: ArticleCountByDate = {}

interface LocalBackup {
    content: string
    timestamp: number
}

interface RightSidebarResizeStart {
    pointerId: number
    pointerX: number
    width: number
}

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(Math.max(value, minimum), maximum)
}

function readBackup(): LocalBackup {
    const emptyBackup = {content: '', timestamp: 0}
    const serializedBackup = localStorage.getItem('backup')
    if (!serializedBackup) {
        return emptyBackup
    }

    try {
        const backup = JSON.parse(serializedBackup) as Partial<LocalBackup>
        if (
            typeof backup.content !== 'string' ||
            typeof backup.timestamp !== 'number' ||
            !Number.isFinite(backup.timestamp)
        ) {
            return emptyBackup
        }
        return {content: backup.content, timestamp: backup.timestamp}
    } catch {
        return emptyBackup
    }
}

function applyAppearance(appearance: Appearance) {
    if (appearance === 'system') {
        delete document.documentElement.dataset.theme
    } else {
        document.documentElement.dataset.theme = appearance
    }

    void getCurrentWindow()
        .setTheme(appearance === 'system' ? null : appearance)
        .catch(() => undefined)
}

function App() {
    const {toast} = useToast()
    const [initialBackup] = useState(readBackup)
    const [page, setPage] = useState<AppPage>('editor')
    const [backTimestamp, setBackTimestamp] = useState(
        initialBackup.timestamp
    )
    const [accessToken, setAccessToken] = useState('')
    const [apiKeyDraft, setApiKeyDraft] = useState('')
    const [appearance, setAppearance] = useState<Appearance>('system')
    const [apiKeySaveStatus, setApiKeySaveStatus] =
        useState<ApiKeySaveStatus>('idle')
    const [storeReady, setStoreReady] = useState(false)
    const [loading, setLoading] = useState(false)
    const [isNarrow, setIsNarrow] = useState(
        () => window.innerWidth < SIDEBAR_BREAKPOINT
    )
    const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
    const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const [desktopRightSidebarVisible, setDesktopRightSidebarVisible] =
        useState(true)
    const [rightSidebarWidth, setRightSidebarWidth] = useState(
        DEFAULT_RIGHT_SIDEBAR_WIDTH
    )
    const [isResizingRightSidebar, setIsResizingRightSidebar] =
        useState(false)
    const [selectedDate, setSelectedDate] = useState<string | null>(null)

    const storeRef = useRef<EssayStore>()
    const editorRef = useRef<MarkdownEditorHandle>(null)
    const apiKeyDraftRef = useRef('')
    const accessTokenRef = useRef('')
    const apiKeySaveTimerRef = useRef<ReturnType<typeof setTimeout>>()
    const apiKeySaveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
    const apiKeySaveGenerationRef = useRef(0)
    const rightSidebarResizeStartRef = useRef<RightSidebarResizeStart>()

    const sidebarVisible = isNarrow
        ? mobileSidebarOpen
        : desktopSidebarVisible
    const leftSidebarOccupiedWidth =
        !isNarrow && desktopSidebarVisible ? LEFT_SIDEBAR_WIDTH : 0
    const availableRightSidebarWidth = Math.min(
        MAX_RIGHT_SIDEBAR_WIDTH,
        windowWidth - leftSidebarOccupiedWidth - MIN_EDITOR_WIDTH
    )
    const rightSidebarAvailable =
        page === 'editor' &&
        !isNarrow &&
        availableRightSidebarWidth >= MIN_RIGHT_SIDEBAR_WIDTH
    const rightSidebarVisible =
        rightSidebarAvailable && desktopRightSidebarVisible
    const effectiveRightSidebarWidth = rightSidebarAvailable
        ? clamp(
              rightSidebarWidth,
              MIN_RIGHT_SIDEBAR_WIDTH,
              availableRightSidebarWidth
          )
        : 0
    const rightSidebarStyle = {
        '--right-sidebar-width': `${effectiveRightSidebarWidth}px`,
    } as CSSProperties

    const backup = useCallback(
        debounce(() => {
            const content = editorRef.current?.getValue() ?? ''
            if (content !== '') {
                const timestamp = Date.now()
                localStorage.setItem(
                    'backup',
                    JSON.stringify({
                        content,
                        timestamp,
                    })
                )
                setBackTimestamp(timestamp)
            }
        }, 1000),
        []
    )

    const enqueueApiKeySave = useCallback((value: string) => {
        const store = storeRef.current
        if (!store) {
            setApiKeySaveStatus('error')
            return Promise.resolve(false)
        }

        const normalizedValue = value.trim()
        const generation = ++apiKeySaveGenerationRef.current
        setApiKeySaveStatus('saving')

        const saveTask = apiKeySaveQueueRef.current.then(async () => {
            try {
                await store.saveAccessToken(normalizedValue)
                if (generation === apiKeySaveGenerationRef.current) {
                    accessTokenRef.current = normalizedValue
                    setAccessToken(normalizedValue)
                    setApiKeySaveStatus('saved')
                }
                return true
            } catch {
                if (generation === apiKeySaveGenerationRef.current) {
                    setApiKeySaveStatus('error')
                }
                return false
            }
        })

        apiKeySaveQueueRef.current = saveTask
        return saveTask
    }, [])

    const changeAppearance = useCallback(
        (nextAppearance: Appearance) => {
            setAppearance(nextAppearance)
            applyAppearance(nextAppearance)

            const store = storeRef.current
            if (!store) {
                return
            }

            void store.saveAppearance(nextAppearance).catch(() => {
                toast({
                    title: '无法保存外观设置',
                    description: '本次选择会在当前运行期间保持生效',
                    variant: 'destructive',
                })
            })
        },
        [toast]
    )

    const flushApiKeySave = useCallback(async () => {
        if (apiKeySaveTimerRef.current) {
            clearTimeout(apiKeySaveTimerRef.current)
            apiKeySaveTimerRef.current = undefined
            return enqueueApiKeySave(apiKeyDraftRef.current)
        }

        if (apiKeyDraftRef.current.trim() !== accessTokenRef.current) {
            return enqueueApiKeySave(apiKeyDraftRef.current)
        }

        return apiKeySaveQueueRef.current
    }, [enqueueApiKeySave])

    const scheduleApiKeySave = (value: string) => {
        apiKeyDraftRef.current = value
        setApiKeyDraft(value)
        setApiKeySaveStatus('saving')

        if (apiKeySaveTimerRef.current) {
            clearTimeout(apiKeySaveTimerRef.current)
        }

        apiKeySaveTimerRef.current = setTimeout(() => {
            apiKeySaveTimerRef.current = undefined
            void enqueueApiKeySave(apiKeyDraftRef.current)
        }, API_KEY_SAVE_DELAY)
    }

    useEffect(() => {
        void getCurrentWindow().show().catch((error) => {
            console.error('Failed to show the main window', error)
        })
    }, [])

    useEffect(() => {
        let cancelled = false

        const initializeStore = async () => {
            try {
                const store = await useStore()
                if (cancelled) {
                    return
                }
                storeRef.current = store
                const [storedAccessToken, storedAppearance] = await Promise.all([
                    store.getAccessToken(),
                    store.getAppearance(),
                ])
                if (cancelled) {
                    return
                }
                const normalizedAccessToken = storedAccessToken.trim()
                accessTokenRef.current = normalizedAccessToken
                apiKeyDraftRef.current = normalizedAccessToken
                setAccessToken(normalizedAccessToken)
                setApiKeyDraft(normalizedAccessToken)
                setAppearance(storedAppearance)
                applyAppearance(storedAppearance)
            } catch {
                if (!cancelled) {
                    setApiKeySaveStatus('error')
                    toast({
                        title: '无法读取本地设置',
                        description: '请稍后重试',
                        variant: 'destructive',
                    })
                }
            } finally {
                if (!cancelled) {
                    setStoreReady(true)
                }
            }
        }

        void initializeStore()

        return () => {
            cancelled = true
        }
    }, [toast])

    useEffect(() => {
        const handleResize = () => {
            const nextWindowWidth = window.innerWidth
            const nextIsNarrow = nextWindowWidth < SIDEBAR_BREAKPOINT
            setWindowWidth(nextWindowWidth)
            setIsNarrow((currentIsNarrow) => {
                if (currentIsNarrow !== nextIsNarrow) {
                    setMobileSidebarOpen(false)
                }
                return nextIsNarrow
            })
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        const animationFrame = requestAnimationFrame(() => {
            editorRef.current?.requestMeasure()
        })

        return () => cancelAnimationFrame(animationFrame)
    }, [sidebarVisible, rightSidebarVisible, effectiveRightSidebarWidth])

    useEffect(() => {
        return () => {
            if (apiKeySaveTimerRef.current) {
                clearTimeout(apiKeySaveTimerRef.current)
            }
        }
    }, [])

    const toggleSidebar = () => {
        if (isNarrow) {
            setMobileSidebarOpen((open) => !open)
        } else {
            setDesktopSidebarVisible((visible) => !visible)
        }
    }

    const toggleRightSidebar = () => {
        setDesktopRightSidebarVisible((visible) => !visible)
    }

    const stopRightSidebarResize = (pointerId?: number) => {
        if (
            pointerId !== undefined &&
            rightSidebarResizeStartRef.current?.pointerId !== pointerId
        ) {
            return
        }

        rightSidebarResizeStartRef.current = undefined
        setIsResizingRightSidebar(false)
        editorRef.current?.requestMeasure()
    }

    const startRightSidebarResize = (
        event: ReactPointerEvent<HTMLDivElement>
    ) => {
        if (event.button !== 0) {
            return
        }

        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        rightSidebarResizeStartRef.current = {
            pointerId: event.pointerId,
            pointerX: event.clientX,
            width: effectiveRightSidebarWidth,
        }
        setIsResizingRightSidebar(true)
    }

    const resizeRightSidebar = (event: ReactPointerEvent<HTMLDivElement>) => {
        const resizeStart = rightSidebarResizeStartRef.current
        if (!resizeStart || resizeStart.pointerId !== event.pointerId) {
            return
        }

        const nextWidth =
            resizeStart.width + resizeStart.pointerX - event.clientX
        setRightSidebarWidth(
            clamp(
                nextWidth,
                MIN_RIGHT_SIDEBAR_WIDTH,
                availableRightSidebarWidth
            )
        )
    }

    const resizeRightSidebarWithKeyboard = (
        event: KeyboardEvent<HTMLDivElement>
    ) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
            return
        }

        event.preventDefault()
        const direction = event.key === 'ArrowLeft' ? 1 : -1
        setRightSidebarWidth(
            clamp(
                effectiveRightSidebarWidth +
                    direction * RIGHT_SIDEBAR_RESIZE_STEP,
                MIN_RIGHT_SIDEBAR_WIDTH,
                availableRightSidebarWidth
            )
        )
    }

    const openSettings = () => {
        setPage('settings')
        if (isNarrow) {
            setMobileSidebarOpen(false)
        }
    }

    const returnToEditor = async () => {
        const saved = await flushApiKeySave()
        if (saved) {
            setPage('editor')
            requestAnimationFrame(() => {
                editorRef.current?.requestMeasure()
                editorRef.current?.focus()
            })
        }
    }

    const onSubmit = async () => {
        if (!accessToken) {
            openSettings()
            toast({
                title: '请先设置 API Key',
                description: '填写后会自动保存在当前设备',
                variant: 'destructive',
            })
            return
        }

        setLoading(true)
        try {
            const content = editorRef.current?.getValue() ?? ''
            const resp = await fetch('https://api.essay.ink/essays', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    content,
                }),
            })
            if (resp.ok) {
                localStorage.removeItem('backup')
                const {id} = await resp.json()
                editorRef.current?.setValue('')
                setBackTimestamp(0)
                toast({
                    title: '文章已发布',
                    description: '你可以点击右侧按钮查看新发布的文章',
                    action: (
                        <ToastAction
                            altText="查看新发布文章"
                            onClick={() =>
                                open(`https://www.essay.ink/essays/${id}`)
                            }
                        >
                            查看
                        </ToastAction>
                    ),
                })
            } else {
                const {error} = await resp.json()
                toast({
                    title: '发布失败',
                    description: error || '请检查网络或 API Key 是否正确',
                    variant: 'destructive',
                })
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div
            className={`app-shell ${isNarrow ? 'is-narrow' : 'is-wide'} ${
                sidebarVisible ? 'sidebar-is-visible' : 'sidebar-is-hidden'
            } ${
                rightSidebarVisible
                    ? 'right-sidebar-is-visible'
                    : 'right-sidebar-is-hidden'
            } ${
                isResizingRightSidebar ? 'is-resizing-right-sidebar' : ''
            }`}
        >
            {isNarrow && mobileSidebarOpen && (
                <button
                    type="button"
                    className="sidebar-backdrop"
                    style={{ strokeWidth: 1 }}
                    aria-label="关闭侧边栏"
                    onClick={() => setMobileSidebarOpen(false)}
                />
            )}

            <aside className="app-sidebar" aria-hidden={!sidebarVisible}>
                <div data-tauri-drag-region className="titlebar-surface sidebar-titlebar">
                    <button
                        type="button"
                        className="sidebar-toggle ml-2 -mt-0.5"
                        aria-label="收起侧边栏"
                        title="收起侧边栏"
                        tabIndex={sidebarVisible ? 0 : -1}
                        onClick={toggleSidebar}
                    >
                        <PanelLeftClose aria-hidden="true" style={{ strokeWidth: 1 }} />
                    </button>
                </div>

                <SidebarCalendar
                    articleCounts={EMPTY_ARTICLE_COUNTS}
                    selectedDate={selectedDate}
                    onDateSelect={setSelectedDate}
                />

                <div className="sidebar-list-region" />

                <footer className="sidebar-footer">
                    <div className="sidebar-account-slot">
                        {!storeReady ? (
                            <div className="sidebar-account-skeleton" aria-label="正在读取本地设置" />
                        ) : accessToken ? (
                            <div className="sidebar-user" aria-label="当前用户：Essay 用户">
                                <CircleUserRound aria-hidden="true" />
                                <span>Essay 用户</span>
                            </div>
                        ) : (
                            <Button
                                type="button"
                                variant="ghost"
                                className="set-api-key-button"
                                onClick={openSettings}
                            >
                                设置 API Key
                            </Button>
                        )}
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="settings-button"
                        aria-label="打开设置"
                        title="设置"
                        onClick={openSettings}
                    >
                        <GearIcon />
                    </Button>
                </footer>
            </aside>

            <main className="app-main">
                <div
                    data-tauri-drag-region
                    className={`titlebar-surface main-titlebar ${
                        page === 'editor' ? 'editor-toolbar' : ''
                    }`}
                    aria-label={page === 'editor' ? '编辑器工具栏' : undefined}
                >
                    {!sidebarVisible && (
                        <button
                            type="button"
                            className="sidebar-toggle ml-2"
                            aria-label="显示侧边栏"
                            title="显示侧边栏"
                            onClick={toggleSidebar}
                        >
                            <PanelLeftOpen aria-hidden="true" style={{ strokeWidth: 1 }} />
                        </button>
                    )}
                    {page === 'editor' && (
                        <div
                            data-tauri-drag-region
                            className="editor-toolbar-title"
                        >
                            <FileText aria-hidden="true" />
                            <span>新文章</span>
                        </div>
                    )}
                    {rightSidebarAvailable && (
                        <button
                            type="button"
                            className="sidebar-toggle right-sidebar-toggle"
                            aria-label={
                                rightSidebarVisible
                                    ? '收起私人笔记侧边栏'
                                    : '显示私人笔记侧边栏'
                            }
                            aria-expanded={rightSidebarVisible}
                            title={
                                rightSidebarVisible
                                    ? '收起私人笔记侧边栏'
                                    : '显示私人笔记侧边栏'
                            }
                            onClick={toggleRightSidebar}
                        >
                            {rightSidebarVisible ? (
                                <PanelRightClose
                                    aria-hidden="true"
                                    style={{ strokeWidth: 1 }}
                                />
                            ) : (
                                <PanelRightOpen
                                    aria-hidden="true"
                                    style={{ strokeWidth: 1 }}
                                />
                            )}
                        </button>
                    )}
                </div>

                <div className="main-page-container">
                    <div
                        className={`editor-page ${
                            page === 'editor' ? '' : 'is-page-hidden'
                        }`}
                        aria-hidden={page !== 'editor'}
                    >
                        <MarkdownEditor
                            ref={editorRef}
                            initialValue={initialBackup.content}
                            disabled={loading}
                            onDirty={backup}
                        />
                        <footer className="editor-footer">
                            <div>
                                {backTimestamp !== 0 && (
                                    <span className="backup-status">
                                        last saved{' '}
                                        {getRelativeTime(new Date(backTimestamp))}
                                    </span>
                                )}
                            </div>
                            <Button
                                type="button"
                                size="icon"
                                className="publish-button"
                                aria-label="发布文章"
                                title="发布"
                                disabled={loading || !storeReady}
                                onClick={onSubmit}
                            >
                                {loading ? (
                                    <ShadowInnerIcon className="animate-spin" />
                                ) : (
                                    <PaperPlaneIcon />
                                )}
                            </Button>
                        </footer>
                    </div>
                    <div
                        className={`settings-page-container ${
                            page === 'settings' ? '' : 'is-page-hidden'
                        }`}
                        aria-hidden={page !== 'settings'}
                    >
                        <SettingsPage
                            value={apiKeyDraft}
                            saveStatus={apiKeySaveStatus}
                            disabled={!storeReady}
                            onChange={scheduleApiKeySave}
                            onBlur={() => void flushApiKeySave()}
                            appearance={appearance}
                            onAppearanceChange={changeAppearance}
                            onBack={returnToEditor}
                        />
                    </div>
                </div>
            </main>

            {rightSidebarVisible && (
                <aside
                    className="app-right-sidebar"
                    style={rightSidebarStyle}
                    aria-label="私人笔记侧边栏"
                >
                    <div
                        className="right-sidebar-resizer"
                        role="separator"
                        aria-label="调整私人笔记侧边栏宽度"
                        aria-orientation="vertical"
                        aria-valuemin={MIN_RIGHT_SIDEBAR_WIDTH}
                        aria-valuemax={Math.floor(availableRightSidebarWidth)}
                        aria-valuenow={Math.round(effectiveRightSidebarWidth)}
                        tabIndex={0}
                        onKeyDown={resizeRightSidebarWithKeyboard}
                        onPointerDown={startRightSidebarResize}
                        onPointerMove={resizeRightSidebar}
                        onPointerUp={(event) =>
                            stopRightSidebarResize(event.pointerId)
                        }
                        onPointerCancel={(event) =>
                            stopRightSidebarResize(event.pointerId)
                        }
                        onLostPointerCapture={() => stopRightSidebarResize()}
                    />
                    <div
                        data-tauri-drag-region
                        className="titlebar-surface right-sidebar-titlebar"
                    />
                    <div className="right-sidebar-content" />
                </aside>
            )}
        </div>
    )
}

export default App
