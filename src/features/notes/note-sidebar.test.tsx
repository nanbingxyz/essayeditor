import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {EditorView} from '@codemirror/view'

import type {Note} from './note-client'
import NoteSidebar from './note-sidebar'

const roots: Root[] = []

const note: Note = {
    id: 'one',
    content: '# Markdown title\n\n- first\n- second',
    createdAt: '2026-08-28T08:00:00Z',
    folder: {id: 'folder', name: 'Work'},
    comments: [
        {
            id: 9,
            content: 'A small comment',
            createdAt: '2026-08-28T09:00:00Z',
        },
    ],
}

function renderSidebar(overrides: Partial<Parameters<typeof NoteSidebar>[0]> = {}) {
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    roots.push(root)
    const props: Parameters<typeof NoteSidebar>[0] = {
        enabled: true,
        error: null,
        folders: [{id: 'folder', name: 'Work'}],
        hasMore: false,
        loading: false,
        loadingMore: false,
        moreError: null,
        mutating: false,
        notes: [note],
        onCreate: vi.fn(async () => true),
        onLoadMore: vi.fn(),
        onOpenSettings: vi.fn(),
        onRefresh: vi.fn(),
        onRemove: vi.fn(async () => true),
        onRetry: vi.fn(),
        onUpdate: vi.fn(async () => true),
        refreshing: false,
        ...overrides,
    }
    act(() => root.render(<NoteSidebar {...props} />))
    return {container, props}
}

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
})

describe('NoteSidebar', () => {
    it('renders toolbar order, Markdown cards, metadata, and comments', () => {
        const {container, props} = renderSidebar()
        const refresh = container.querySelector(
            'button[aria-label="刷新笔记"]'
        )!
        const add = container.querySelector('button[aria-label="添加笔记"]')!

        expect(
            refresh.compareDocumentPosition(add) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).not.toBe(0)
        expect(container.querySelector('.note-card h1')?.textContent).toBe(
            'Markdown title'
        )
        expect(container.querySelector('.note-card')?.textContent).toContain(
            'A small comment'
        )
        expect(container.querySelector('.note-card')?.textContent).toContain(
            'Work'
        )

        act(() => (refresh as HTMLButtonElement).click())
        expect(props.onRefresh).toHaveBeenCalledTimes(1)
    })

    it('opens view, edit, and delete confirmation dialogs', async () => {
        const {container} = renderSidebar()
        act(() =>
            (container.querySelector('.note-card') as HTMLButtonElement).click()
        )
        expect(document.body.textContent).toContain('查看笔记')
        expect(document.body.querySelector('.note-view-body h1')?.textContent).toBe(
            'Markdown title'
        )

        act(() =>
            (
                document.body.querySelector(
                    'button[aria-label="删除笔记"]'
                ) as HTMLButtonElement
            ).click()
        )
        expect(document.body.textContent).toContain('删除这条笔记？')
        const cancel = Array.from(document.body.querySelectorAll('button')).find(
            (button) => button.textContent === '取消'
        )!
        act(() => cancel.click())

        act(() =>
            (
                document.body.querySelector(
                    'button[aria-label="编辑笔记"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => Promise.resolve())
        expect(
            document.body.querySelector('.cm-content[aria-label="笔记内容"]')
        ).not.toBeNull()
        expect(
            document.body.querySelector('select[aria-label="笔记文件夹"]')
        ).toHaveProperty('value', 'folder')
    })

    it('shows setup guidance and disables note actions without an API key', () => {
        const onOpenSettings = vi.fn()
        const {container} = renderSidebar({
            enabled: false,
            notes: [],
            onOpenSettings,
        })
        expect(container.textContent).toContain('设置 API Key 后即可管理私人笔记')
        expect(
            (container.querySelector(
                'button[aria-label="刷新笔记"]'
            ) as HTMLButtonElement).disabled
        ).toBe(true)
        const settings = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent === '打开设置'
        )!
        act(() => settings.click())
        expect(onOpenSettings).toHaveBeenCalledTimes(1)
    })

    it('confirms before closing an unsaved note', async () => {
        const {container} = renderSidebar()
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="添加笔记"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => Promise.resolve())
        const content = document.body.querySelector(
            '.note-editor-dialog .cm-content'
        ) as HTMLElement
        const view = EditorView.findFromDOM(content)
        if (!view) {
            throw new Error('Note editor was not mounted')
        }
        act(() => view.dispatch({changes: {from: 0, insert: 'Unsaved'}}))

        const close = document.body.querySelector(
            '.note-editor-dialog > button'
        ) as HTMLButtonElement
        act(() => close.click())
        expect(document.body.textContent).toContain('放弃未保存的修改？')
        expect(document.body.querySelector('.note-editor-dialog')).not.toBeNull()
    })
})
