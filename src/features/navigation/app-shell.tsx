import {
    PanelLeftContract20Regular,
    PanelLeftExpand20Regular,
    PanelRightContract20Regular,
    PanelRightExpand20Regular,
} from '@fluentui/react-icons'
import {GearIcon} from '@radix-ui/react-icons'
import {type CSSProperties, type ReactNode} from 'react'

import {Avatar, AvatarFallback, AvatarImage, Button} from '@/shared/ui'

import SidebarCalendar, {type ArticleCountByDate} from './sidebar-calendar'
import {
    MAX_RIGHT_SIDEBAR_WIDTH,
    MIN_RIGHT_SIDEBAR_WIDTH,
    type AppPage,
    type SidebarLayout,
} from './use-sidebar-layout'


interface AppShellProps {
    accountError: boolean
    accountLoading: boolean
    articleCounts: ArticleCountByDate
    children: ReactNode
    editorStatusLabel: string
    editorToolbarActions?: ReactNode
    hasAccessToken: boolean
    layout: SidebarLayout
    onOpenSettings: () => void
    onSelectedDateChange: (date: string | null) => void
    page: AppPage
    rightSidebarContent: ReactNode
    selectedDate: string | null
    sidebarContent: ReactNode
    sidebarTitlebarContent?: ReactNode
    storeReady: boolean
    user: SidebarAccountUser | null
}

export interface SidebarAccountUser {
    avatar: string | null
    displayName: string
}

function SidebarUser({user}: {user: SidebarAccountUser}) {
    const fallbackLabel = user.displayName.trim().charAt(0).toUpperCase() || 'E'

    return (
        <div
            className="sidebar-user"
            aria-label={`当前用户：${user.displayName}`}
        >
            <Avatar
                className="sidebar-user-avatar size-[30px]"
                aria-hidden="true"
            >
                {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
                <AvatarFallback>{fallbackLabel}</AvatarFallback>
            </Avatar>
            <span className="sidebar-user-name font-medium opacity-80">{user.displayName}</span>
        </div>
    )
}

export default function AppShell({
    accountError,
    accountLoading,
    articleCounts,
    children,
    editorStatusLabel,
    editorToolbarActions,
    hasAccessToken,
    layout,
    onOpenSettings,
    onSelectedDateChange,
    page,
    rightSidebarContent,
    selectedDate,
    sidebarContent,
    sidebarTitlebarContent,
    storeReady,
    user,
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
                        <PanelLeftContract20Regular aria-hidden="true" />
                    </button>
                    {sidebarTitlebarContent}
                </div>

                <SidebarCalendar
                    articleCounts={articleCounts}
                    selectedDate={selectedDate}
                    onDateSelect={onSelectedDateChange}
                />

                {sidebarContent}

                <footer className="sidebar-footer">
                    <div className="sidebar-account-slot">
                        {!storeReady ||
                        (hasAccessToken &&
                            (accountLoading || (!user && !accountError))) ? (
                            <div
                                className="sidebar-account-skeleton"
                                aria-label={
                                    storeReady
                                        ? '正在读取用户信息'
                                        : '正在读取本地设置'
                                }
                            />
                        ) : !hasAccessToken ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="set-api-key-button rounded-full"
                                onClick={onOpenSettings}
                            >
                                设置 API Key
                            </Button>
                        ) : user ? (
                            <SidebarUser
                                key={user.avatar ?? user.displayName}
                                user={user}
                            />
                        ) : (
                            <span className="sidebar-account-error">
                                无法加载用户信息
                            </span>
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
                            <PanelLeftExpand20Regular aria-hidden="true" />
                        </button>
                    )}
                    {page === 'editor' && (
                        <div
                            data-tauri-drag-region
                            className="editor-toolbar-title"
                        >
                            <span>{editorStatusLabel}</span>
                        </div>
                    )}
                    {page === 'editor' && editorToolbarActions && (
                        <div className="editor-toolbar-actions">
                            {editorToolbarActions}
                        </div>
                    )}
                    {layout.rightSidebarAvailable && (
                        <button
                            type="button"
                            className="sidebar-toggle right-sidebar-toggle"
                            aria-label={
                                layout.rightSidebarVisible
                                    ? '收起笔记侧边栏'
                                    : '显示笔记侧边栏'
                            }
                            aria-expanded={layout.rightSidebarVisible}
                            title={
                                layout.rightSidebarVisible
                                    ? '收起笔记侧边栏'
                                    : '显示笔记侧边栏'
                            }
                            onClick={layout.toggleRightSidebar}
                        >
                            {layout.rightSidebarVisible ? (
                                <PanelRightContract20Regular aria-hidden="true" />
                            ) : (
                                <PanelRightExpand20Regular aria-hidden="true" />
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
                    aria-label="笔记侧边栏"
                >
                    <div
                        className="right-sidebar-resizer"
                        role="separator"
                        aria-label="调整笔记侧边栏宽度"
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
                    <div className="right-sidebar-content">
                        {rightSidebarContent}
                    </div>
                </aside>
            )}
        </div>
    )
}
