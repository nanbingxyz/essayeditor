import {type KeyboardEvent} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {useSidebarLayout} from './use-sidebar-layout'

type SidebarLayout = ReturnType<typeof useSidebarLayout>

const roots: Root[] = []

function renderLayout() {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    let layout: SidebarLayout | undefined

    function Harness() {
        layout = useSidebarLayout({
            page: 'editor',
            onLayoutChange: vi.fn(),
        })
        return null
    }

    act(() => root.render(<Harness />))
    return () => {
        if (!layout) {
            throw new Error('Layout has not rendered')
        }
        return layout
    }
}

beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 1200,
    })
})

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
})

describe('useSidebarLayout', () => {
    it('derives right sidebar availability and supports keyboard resizing', () => {
        const getLayout = renderLayout()

        expect(getLayout().rightSidebarVisible).toBe(true)
        expect(getLayout().effectiveRightSidebarWidth).toBe(300)

        const preventDefault = vi.fn()
        act(() =>
            getLayout().resizeRightSidebarWithKeyboard({
                key: 'ArrowLeft',
                preventDefault,
            } as unknown as KeyboardEvent<HTMLDivElement>)
        )

        expect(preventDefault).toHaveBeenCalled()
        expect(getLayout().effectiveRightSidebarWidth).toBe(316)
    })

    it('switches to the mobile sidebar model below the breakpoint', () => {
        const getLayout = renderLayout()

        window.innerWidth = 600
        act(() => window.dispatchEvent(new Event('resize')))

        expect(getLayout().isNarrow).toBe(true)
        expect(getLayout().rightSidebarAvailable).toBe(false)

        act(() => getLayout().toggleSidebar())
        expect(getLayout().sidebarVisible).toBe(true)
        act(() => getLayout().closeMobileSidebar())
        expect(getLayout().sidebarVisible).toBe(false)
    })
})
