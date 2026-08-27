import {
    PanelLeftContract28Filled,
    PanelLeftContract28Regular,
    PanelLeftExpand28Filled,
    PanelLeftExpand28Regular,
    PanelRightContract28Filled,
    PanelRightContract28Regular,
    PanelRightExpand28Filled,
    PanelRightExpand28Regular,
    bundleIcon,
} from '@fluentui/react-icons'
import {GearIcon} from '@radix-ui/react-icons'
import {type CSSProperties, type ReactNode} from 'react'

import {Button} from '@/shared/ui'

import SidebarCalendar, {type ArticleCountByDate} from './sidebar-calendar'
import {
    MAX_RIGHT_SIDEBAR_WIDTH,
    MIN_RIGHT_SIDEBAR_WIDTH,
    type AppPage,
    type SidebarLayout,
} from './use-sidebar-layout'

const PanelLeftContractIcon = bundleIcon(
    PanelLeftContract28Filled,
    PanelLeftContract28Regular
)
const PanelLeftExpandIcon = bundleIcon(
    PanelLeftExpand28Filled,
    PanelLeftExpand28Regular
)
const PanelRightContractIcon = bundleIcon(
    PanelRightContract28Filled,
    PanelRightContract28Regular
)
const PanelRightExpandIcon = bundleIcon(
    PanelRightExpand28Filled,
    PanelRightExpand28Regular
)

interface AppShellProps {
    accessToken: string
    articleCounts: ArticleCountByDate
    children: ReactNode
    layout: SidebarLayout
    onOpenSettings: () => void
    onSelectedDateChange: (date: string | null) => void
    page: AppPage
    selectedDate: string | null
    storeReady: boolean
}

export default function AppShell({
    accessToken,
    articleCounts,
    children,
    layout,
    onOpenSettings,
    onSelectedDateChange,
    page,
    selectedDate,
    storeReady,
}: AppShellProps) {
    const rightSidebarStyle = {
        '--right-sidebar-width': `${layout.effectiveRightSidebarWidth}px`,
    } as CSSProperties

    return (
        <div
            className={`app-shell ${
                layout.isNarrow ? 'is-narrow' : 'is-wide'
            } ${
                layout.sidebarVisible
                    ? 'sidebar-is-visible'
                    : 'sidebar-is-hidden'
            } ${
                layout.rightSidebarVisible
                    ? 'right-sidebar-is-visible'
                    : 'right-sidebar-is-hidden'
            } ${
                layout.isResizingRightSidebar
                    ? 'is-resizing-right-sidebar'
                    : ''
            }`}
        >
            {layout.isNarrow && layout.sidebarVisible && (
                <button
                    type="button"
                    className="sidebar-backdrop"
                    aria-label="关闭侧边栏"
                    onClick={layout.closeMobileSidebar}
                />
            )}

            <aside
                className="app-sidebar"
                aria-hidden={!layout.sidebarVisible}
            >
                <div
                    data-tauri-drag-region
                    className="titlebar-surface sidebar-titlebar"
                >
                    <button
                        type="button"
                        className="sidebar-toggle ml-1 -mt-1"
                        aria-label="收起侧边栏"
                        title="收起侧边栏"
                        tabIndex={layout.sidebarVisible ? 0 : -1}
                        onClick={layout.toggleSidebar}
                    >
                        <PanelLeftContractIcon aria-hidden="true" />
                    </button>
                </div>

                <SidebarCalendar
                    articleCounts={articleCounts}
                    selectedDate={selectedDate}
                    onDateSelect={onSelectedDateChange}
                />

                <div className="sidebar-list-region" />

                <footer className="sidebar-footer">
                    <div className="sidebar-account-slot">
                        {!storeReady ? (
                            <div
                                className="sidebar-account-skeleton"
                                aria-label="正在读取本地设置"
                            />
                        ) : accessToken ? (
                            <div
                                className="sidebar-user"
                                aria-label="当前用户：Essay 用户"
                            >
                                <span>Essay 用户</span>
                            </div>
                        ) : (
                            <Button
                                type="button"
                                variant="ghost"
                                className="set-api-key-button"
                                onClick={onOpenSettings}
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
                        onClick={onOpenSettings}
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
                    aria-label={
                        page === 'editor' ? '编辑器工具栏' : undefined
                    }
                >
                    {!layout.sidebarVisible && (
                        <button
                            type="button"
                            className="sidebar-toggle ml-2 -mt-1"
                            aria-label="显示侧边栏"
                            title="显示侧边栏"
                            onClick={layout.toggleSidebar}
                        >
                            <PanelLeftExpandIcon aria-hidden="true" />
                        </button>
                    )}
                    {page === 'editor' && (
                        <div
                            data-tauri-drag-region
                            className="editor-toolbar-title"
                        >
                            <span>新文章</span>
                        </div>
                    )}
                    {layout.rightSidebarAvailable && (
                        <button
                            type="button"
                            className="sidebar-toggle right-sidebar-toggle"
                            aria-label={
                                layout.rightSidebarVisible
                                    ? '收起私人笔记侧边栏'
                                    : '显示私人笔记侧边栏'
                            }
                            aria-expanded={layout.rightSidebarVisible}
                            title={
                                layout.rightSidebarVisible
                                    ? '收起私人笔记侧边栏'
                                    : '显示私人笔记侧边栏'
                            }
                            onClick={layout.toggleRightSidebar}
                        >
                            {layout.rightSidebarVisible ? (
                                <PanelRightContractIcon aria-hidden="true" />
                            ) : (
                                <PanelRightExpandIcon aria-hidden="true" />
                            )}
                        </button>
                    )}
                </div>

                <div className="main-page-container">{children}</div>
            </main>

            {layout.rightSidebarVisible && (
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
                        aria-valuemax={Math.min(
                            MAX_RIGHT_SIDEBAR_WIDTH,
                            Math.floor(layout.availableRightSidebarWidth)
                        )}
                        aria-valuenow={Math.round(
                            layout.effectiveRightSidebarWidth
                        )}
                        tabIndex={0}
                        onKeyDown={layout.resizeRightSidebarWithKeyboard}
                        onPointerDown={layout.startRightSidebarResize}
                        onPointerMove={layout.resizeRightSidebar}
                        onPointerUp={(event) =>
                            layout.stopRightSidebarResize(event.pointerId)
                        }
                        onPointerCancel={(event) =>
                            layout.stopRightSidebarResize(event.pointerId)
                        }
                        onLostPointerCapture={() =>
                            layout.stopRightSidebarResize()
                        }
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
