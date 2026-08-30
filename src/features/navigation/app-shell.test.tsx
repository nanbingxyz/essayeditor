import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {type ReactNode} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import AppShell, {type SidebarAccountUser} from './app-shell'
import type {SidebarLayout} from './use-sidebar-layout'

const roots: Root[] = []

const layout = {
    availableRightSidebarWidth: 300,
    closeMobileSidebar: vi.fn(),
    effectiveRightSidebarWidth: 300,
    isNarrow: false,
    isResizingRightSidebar: false,
    resizeRightSidebar: vi.fn(),
    resizeRightSidebarWithKeyboard: vi.fn(),
    rightSidebarAvailable: false,
    rightSidebarVisible: false,
    sidebarVisible: true,
    startRightSidebarResize: vi.fn(),
    stopRightSidebarResize: vi.fn(),
    toggleRightSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
} as SidebarLayout

interface AccountState {
    accountError: boolean
    accountLoading: boolean
    hasAccessToken: boolean
    storeReady: boolean
    user: SidebarAccountUser | null
}

function renderShell(
    initialState: AccountState,
    sidebarTitlebarContent?: ReactNode
) {
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    roots.push(root)
    let state = initialState

    function Harness() {
        return (
            <AppShell
                {...state}
                articleCounts={{}}
                editorStatusLabel="未发布（草稿）"
                layout={layout}
                onOpenSettings={vi.fn()}
                onSelectedDateChange={vi.fn()}
                page="editor"
                rightSidebarContent={<div>Notes</div>}
                selectedDate={null}
                sidebarContent={<div>Article list</div>}
                sidebarTitlebarContent={sidebarTitlebarContent}
            >
                <div>Editor</div>
            </AppShell>
        )
    }

    act(() => root.render(<Harness />))
    return {
        container,
        rerender: (nextState: AccountState) => {
            state = nextState
            act(() => root.render(<Harness />))
        },
    }
}

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

describe('AppShell account area', () => {
    it('renders optional content beside the sidebar toggle', () => {
        const {container} = renderShell(
            {
                accountError: false,
                accountLoading: false,
                hasAccessToken: false,
                storeReady: true,
                user: null,
            },
            <span data-testid="sidebar-titlebar-content">Update status</span>
        )
        const titlebar = container.querySelector('.sidebar-titlebar')
        const toggle = titlebar?.querySelector('.sidebar-toggle')
        const status = titlebar?.querySelector(
            '[data-testid="sidebar-titlebar-content"]'
        )

        expect(toggle?.nextElementSibling).toBe(status)
    })

    it('shows settings, loading, and failure states', () => {
        const {container, rerender} = renderShell({
            accountError: false,
            accountLoading: false,
            hasAccessToken: false,
            storeReady: true,
            user: null,
        })
        expect(container.textContent).toContain('设置 API Key')

        rerender({
            accountError: false,
            accountLoading: true,
            hasAccessToken: true,
            storeReady: true,
            user: null,
        })
        expect(
            container.querySelector('[aria-label="正在读取用户信息"]')
        ).not.toBeNull()

        rerender({
            accountError: true,
            accountLoading: false,
            hasAccessToken: true,
            storeReady: true,
            user: null,
        })
        expect(container.textContent).toContain('无法加载用户信息')
    })

    it('shows the user avatar', () => {
        vi.spyOn(window, 'Image').mockImplementation(
            () =>
                ({
                    complete: true,
                    naturalWidth: 30,
                }) as HTMLImageElement
        )
        const {container} = renderShell({
            accountError: false,
            accountLoading: false,
            hasAccessToken: true,
            storeReady: true,
            user: {
                avatar: 'https://example.com/avatar.png',
                displayName: 'Ben',
            },
        })
        const account = container.querySelector('[aria-label="当前用户：Ben"]')
        const image = account?.querySelector('img')

        expect(image?.getAttribute('src')).toBe(
            'https://example.com/avatar.png'
        )
        expect(image?.classList.contains('size-full')).toBe(true)
        expect(account?.textContent).toContain('Ben')
    })

    it('uses a same-size fallback when the user has no avatar', () => {
        const {container} = renderShell({
            accountError: false,
            accountLoading: false,
            hasAccessToken: true,
            storeReady: true,
            user: {
                avatar: null,
                displayName: 'Ben',
            },
        })
        const account = container.querySelector('[aria-label="当前用户：Ben"]')
        const avatar = account?.querySelector('[data-slot="avatar"]')
        const fallback = avatar?.querySelector(
            '[data-slot="avatar-fallback"]'
        )

        expect(account?.querySelector('img')).toBeNull()
        expect(avatar?.classList.contains('size-[30px]')).toBe(true)
        expect(fallback?.classList.contains('size-full')).toBe(true)
        expect(account?.textContent).toContain('B')
        expect(account?.textContent).toContain('Ben')
    })
})
