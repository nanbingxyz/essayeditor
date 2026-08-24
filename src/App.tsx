import './App.css'
import '@fontsource-variable/noto-serif-sc'
import {fetch} from '@tauri-apps/plugin-http'
import {open} from '@tauri-apps/plugin-shell'
import {GearIcon, PaperPlaneIcon, ShadowInnerIcon} from '@radix-ui/react-icons'
import {CircleUserRound, PanelLeftClose, PanelLeftOpen} from 'lucide-react'
import {ChangeEvent, useCallback, useEffect, useRef, useState} from 'react'

import SettingsPage, {ApiKeySaveStatus} from '@/components/settings-page'
import {Button} from '@/components/ui/button'
import {ToastAction} from '@/components/ui/toast'
import useStore, {EssayStore} from '@/hooks/use-store'
import {useToast} from '@/hooks/use-toast'

import {debounce, getRelativeTime} from './utils'

type AppPage = 'editor' | 'settings'

const SIDEBAR_BREAKPOINT = 500
const API_KEY_SAVE_DELAY = 400

function App() {
    const {toast} = useToast()
    const [page, setPage] = useState<AppPage>('editor')
    const [backTimestamp, setBackTimestamp] = useState(0)
    const [accessToken, setAccessToken] = useState('')
    const [apiKeyDraft, setApiKeyDraft] = useState('')
    const [apiKeySaveStatus, setApiKeySaveStatus] =
        useState<ApiKeySaveStatus>('idle')
    const [storeReady, setStoreReady] = useState(false)
    const [loading, setLoading] = useState(false)
    const [content, setContent] = useState('')
    const [isNarrow, setIsNarrow] = useState(
        () => window.innerWidth < SIDEBAR_BREAKPOINT
    )
    const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

    const storeRef = useRef<EssayStore>()
    const apiKeyDraftRef = useRef('')
    const accessTokenRef = useRef('')
    const apiKeySaveTimerRef = useRef<ReturnType<typeof setTimeout>>()
    const apiKeySaveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
    const apiKeySaveGenerationRef = useRef(0)

    const sidebarVisible = isNarrow
        ? mobileSidebarOpen
        : desktopSidebarVisible

    const restoreBackup = () => {
        const backup = localStorage.getItem('backup')
        if (backup) {
            const {content, timestamp} = JSON.parse(backup)
            setContent(content)
            setBackTimestamp(timestamp)
        }
    }

    const backup = useCallback(
        debounce((content: string) => {
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
        let cancelled = false

        const initializeStore = async () => {
            try {
                const store = await useStore()
                if (cancelled) {
                    return
                }
                storeRef.current = store
                const storedAccessToken = (await store.getAccessToken()).trim()
                if (cancelled) {
                    return
                }
                accessTokenRef.current = storedAccessToken
                apiKeyDraftRef.current = storedAccessToken
                setAccessToken(storedAccessToken)
                setApiKeyDraft(storedAccessToken)
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
        restoreBackup()

        return () => {
            cancelled = true
        }
    }, [toast])

    useEffect(() => {
        const handleResize = () => {
            const nextIsNarrow = window.innerWidth < SIDEBAR_BREAKPOINT
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
        }
    }

    const onInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
        setContent(event.target.value)
        backup(event.target.value)
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
                setContent('')
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
            }`}
        >
            {isNarrow && mobileSidebarOpen && (
                <button
                    type="button"
                    className="sidebar-backdrop"
                    aria-label="关闭侧边栏"
                    onClick={() => setMobileSidebarOpen(false)}
                />
            )}

            <aside className="app-sidebar" aria-hidden={!sidebarVisible}>
                <div data-tauri-drag-region className="titlebar-surface sidebar-titlebar">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="sidebar-toggle"
                        aria-label="收起侧边栏"
                        title="收起侧边栏"
                        tabIndex={sidebarVisible ? 0 : -1}
                        onClick={toggleSidebar}
                    >
                        <PanelLeftClose aria-hidden="true" />
                    </Button>
                </div>

                <div className="sidebar-spacer" />

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
                <div data-tauri-drag-region className="titlebar-surface main-titlebar">
                    {!sidebarVisible && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="sidebar-toggle"
                            aria-label="显示侧边栏"
                            title="显示侧边栏"
                            onClick={toggleSidebar}
                        >
                            <PanelLeftOpen aria-hidden="true" />
                        </Button>
                    )}
                </div>

                <div className="main-page-container">
                    {page === 'editor' ? (
                        <div className="editor-page">
                            <textarea
                                placeholder="从这里开始..."
                                disabled={loading}
                                className="editor-textarea"
                                value={content}
                                onChange={onInput}
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
                    ) : (
                        <SettingsPage
                            value={apiKeyDraft}
                            saveStatus={apiKeySaveStatus}
                            disabled={!storeReady}
                            onChange={scheduleApiKeySave}
                            onBlur={() => void flushApiKeySave()}
                            onBack={returnToEditor}
                        />
                    )}
                </div>
            </main>
        </div>
    )
}

export default App
