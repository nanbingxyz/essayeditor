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
        onSearch: vi.fn(),
        onUpdate: vi.fn(async () => true),
        query: {keyword: '', folderIds: []},
        refreshing: false,
        ...overrides,
    }
    act(() => root.render(<NoteSidebar {...props} />))
    return {container, props}
}

function setInputValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', {bubbles: true}))
}

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
})

describe('NoteSidebar', () => {
    it('disables sending empty content when creating and editing notes', async () => {
        const {container} = renderSidebar()
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="添加笔记"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => Promise.resolve())

        expect(
            (
                document.body.querySelector(
                    '.note-editor-dialog button[aria-label="添加笔记"]'
                ) as HTMLButtonElement
            ).disabled
        ).toBe(true)

        act(() =>
            (
                document.body.querySelector(
                    '.note-editor-dialog > button'
                ) as HTMLButtonElement
            ).click()
        )
        act(() =>
            (container.querySelector('.note-card') as HTMLButtonElement).click()
        )
        act(() =>
            (
                document.body.querySelector(
                    'button[aria-label="编辑笔记"]'
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
        act(() =>
            view.dispatch({
                changes: {from: 0, to: view.state.doc.length, insert: '   '},
            })
        )

        expect(
            (
                document.body.querySelector(
                    '.note-editor-dialog button[aria-label="更新笔记"]'
                ) as HTMLButtonElement
            ).disabled
        ).toBe(true)
    })

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
        expect(
            container.querySelector('.note-card.grid-pattern-card')
        ).not.toBeNull()
        expect(
            container.querySelector('.note-card .grid-pattern-card-body')
        ).not.toBeNull()
        expect(
            container.querySelector(
                '.note-card > .grid-pattern-card-pattern > .grid-pattern-card-gradient > .grid-pattern-card-body'
            )
        ).not.toBeNull()

        act(() => (refresh as HTMLButtonElement).click())
        expect(props.onRefresh).toHaveBeenCalledTimes(1)
    })

    it('opens view, edit, and delete confirmation dialogs', async () => {
        const {container} = renderSidebar()
        act(() =>
            (container.querySelector('.note-card') as HTMLButtonElement).click()
        )
        expect(document.body.querySelector('.note-view-dialog')).not.toBeNull()
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
            document.body.querySelector(
                'button[aria-label="笔记文件夹：Work"]'
            )
        ).not.toBeNull()
    })

    it('shows setup guidance and disables note actions without an API key', () => {
        const onOpenSettings = vi.fn()
        const {container} = renderSidebar({
            enabled: false,
            notes: [],
            onOpenSettings,
        })
        expect(container.textContent).toContain('设置 API Key 后即可管理个人笔记')
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

    it('can clear the selected folder and submit an uncategorized note', async () => {
        const {container, props} = renderSidebar()
        act(() =>
            (container.querySelector('.note-card') as HTMLButtonElement).click()
        )
        act(() =>
            (
                document.body.querySelector(
                    'button[aria-label="编辑笔记"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => Promise.resolve())

        act(() =>
            (
                document.body.querySelector(
                    'button[aria-label="笔记文件夹：Work"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => Promise.resolve())
        const uncategorized = Array.from(
            document.body.querySelectorAll('.note-folder-menu-item')
        ).find((item) => item.textContent === '不分类') as HTMLElement
        act(() => uncategorized.click())

        await act(async () => {
            (
                document.body.querySelector(
                    '.note-editor-dialog button[aria-label="更新笔记"]'
                ) as HTMLButtonElement
            ).click()
            await Promise.resolve()
        })
        expect(props.onUpdate).toHaveBeenCalledWith(
            'one',
            note.content,
            null
        )
    })

    it('can select a folder from the uncategorized state', async () => {
        const {container} = renderSidebar({notes: []})
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="添加笔记"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => Promise.resolve())

        act(() =>
            (
                document.body.querySelector(
                    'button[aria-label="笔记文件夹：不分类"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => Promise.resolve())
        const workFolder = Array.from(
            document.body.querySelectorAll('.note-folder-menu-item')
        ).find((item) => item.textContent === 'Work') as HTMLElement
        act(() => workFolder.click())

        expect(
            document.body.querySelector(
                'button[aria-label="笔记文件夹：Work"]'
            )
        ).not.toBeNull()
    })

    it('hides the folder menu and submits null when no folders exist', async () => {
        const {container, props} = renderSidebar({folders: [], notes: []})
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="添加笔记"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => Promise.resolve())

        expect(
            document.body.querySelector('.note-folder-menu-trigger')
        ).toBeNull()

        const content = document.body.querySelector(
            '.note-editor-dialog .cm-content'
        ) as HTMLElement
        const view = EditorView.findFromDOM(content)
        if (!view) {
            throw new Error('Note editor was not mounted')
        }
        act(() => view.dispatch({changes: {from: 0, insert: 'No folder'}}))

        await act(async () => {
            (
                document.body.querySelector(
                    '.note-editor-dialog button[aria-label="添加笔记"]'
                ) as HTMLButtonElement
            ).click()
            await Promise.resolve()
        })
        expect(props.onCreate).toHaveBeenCalledWith('No folder', null)
    })

    it('submits keyword searches and clears each active filter', () => {
        const {container, props} = renderSidebar({
            query: {keyword: 'topic', folderIds: ['folder']},
        })
        const input = container.querySelector(
            'input[aria-label="搜索笔记"]'
        ) as HTMLInputElement

        act(() => setInputValue(input, 'first,second'))
        act(() =>
            input.closest('form')?.dispatchEvent(
                new Event('submit', {bubbles: true, cancelable: true})
            )
        )
        expect(props.onSearch).toHaveBeenLastCalledWith({
            keyword: 'first,second',
            folderIds: ['folder'],
        })

        act(() =>
            (
                container.querySelector(
                    'button[aria-label="清空关键词"]'
                ) as HTMLButtonElement
            ).click()
        )
        expect(props.onSearch).toHaveBeenLastCalledWith({
            keyword: '',
            folderIds: ['folder'],
        })

        expect(container.querySelector('.note-folder-filter-badge')?.textContent)
            .toBe('1')
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="清空文件夹筛选"]'
                ) as HTMLButtonElement
            ).click()
        )
        expect(props.onSearch).toHaveBeenLastCalledWith({
            keyword: '',
            folderIds: [],
        })
    })

    it('confirms combined folder filters and discards unconfirmed changes', () => {
        const {container, props} = renderSidebar({
            query: {keyword: 'topic', folderIds: []},
        })
        const trigger = container.querySelector(
            'button[aria-label="按文件夹筛选"]'
        ) as HTMLButtonElement

        act(() => trigger.click())
        const options = Array.from(
            container.querySelectorAll<HTMLButtonElement>(
                '.note-folder-filter-option'
            )
        )
        const unclassified = options.find(
            (option) => option.textContent === '未分类'
        )!
        const work = options.find((option) => option.textContent === 'Work')!
        act(() => {
            unclassified.click()
            work.click()
        })
        const confirm = Array.from(
            container.querySelectorAll<HTMLButtonElement>('button')
        ).find((button) => button.textContent === '确定')!
        act(() => confirm.click())
        expect(props.onSearch).toHaveBeenLastCalledWith({
            keyword: 'topic',
            folderIds: ['unclassified', 'folder'],
        })

        act(() => trigger.click())
        const reopenedWork = Array.from(
            container.querySelectorAll<HTMLButtonElement>(
                '.note-folder-filter-option'
            )
        ).find((option) => option.textContent === 'Work')!
        act(() => reopenedWork.click())
        act(() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'})))
        act(() => trigger.click())
        const resetWork = Array.from(
            container.querySelectorAll<HTMLButtonElement>(
                '.note-folder-filter-option'
            )
        ).find((option) => option.textContent === 'Work')!
        expect(resetWork.getAttribute('aria-checked')).toBe('false')
    })

    it('shows a filtered empty state without the create shortcut', () => {
        const {container} = renderSidebar({
            notes: [],
            query: {keyword: 'missing', folderIds: []},
        })

        expect(container.textContent).toContain('未找到匹配的笔记')
        expect(container.textContent).not.toContain('添加第一条笔记')
    })
})
