import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
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

function renderShell(initialState: AccountState) {
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
                selectedDate={null}
                sidebarContent={<div>Article list</div>}
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
})

describe('AppShell account area', () => {
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

    it('shows the user avatar and falls back to the display-name initial', () => {
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
        act(() => image?.dispatchEvent(new Event('error', {bubbles: true})))
        expect(account?.textContent).toContain('B')
        expect(account?.textContent).toContain('Ben')
    })
})
