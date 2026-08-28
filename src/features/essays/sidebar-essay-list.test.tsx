import {createRoot} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {describe, expect, it, vi} from 'vitest'

import SidebarEssayList, {markdownToSummary} from './sidebar-essay-list'

describe('markdownToSummary', () => {
    it('keeps readable text while removing markdown and URLs', () => {
        expect(
            markdownToSummary(
                '# Title\n![alt](https://example.com/image.png) [Essay](https://essay.ink) **bold** `code` https://hidden.test'
            )
        ).toBe('Title Essay bold code')
    })

    it('removes html and falls back when no text remains', () => {
        expect(markdownToSummary('<strong>Hello</strong>')).toBe('Hello')
        expect(markdownToSummary('![](image.png)')).toBe('无文本内容')
    })

    it('removes table separators and images with parenthesized URLs', () => {
        expect(
            markdownToSummary(
                '| 功能 | 状态 |\n| :--- | ---: |\n| 渲染 | 完成 |\n![](https://example.com/a_(1).png)'
            )
        ).toBe('功能 状态 渲染 完成')
    })
})

describe('SidebarEssayList', () => {
    it('keeps the create action fixed before drafts and published entries', () => {
        const container = document.body.appendChild(document.createElement('div'))
        const root = createRoot(container)
        const onCreateDraft = vi.fn()
        act(() =>
            root.render(
                <SidebarEssayList
                    activeDocumentId="local:newer"
                    drafts={[
                        {
                            localId: 'newer',
                            content: 'Newest draft',
                            createdAt: 2,
                            updatedAt: 3,
                        },
                        {
                            localId: 'older',
                            content: 'Older draft',
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ]}
                    entries={[{id: 'published', content: 'Published essay'}]}
                    error={null}
                    hasMore={false}
                    loading={false}
                    loadingMore={false}
                    moreError={null}
                    onCreateDraft={onCreateDraft}
                    onLoadMore={vi.fn()}
                    onRefresh={vi.fn()}
                    onRetry={vi.fn()}
                    onSelectDraft={vi.fn()}
                    onSelectEssay={vi.fn()}
                    refreshDisabled={false}
                    refreshing={false}
                    selectedDate="2026-08-27"
                />
            )
        )

        const createAction = container.querySelector('.sidebar-create-action')!
        const listRegion = container.querySelector('.sidebar-list-region')!
        expect(
            createAction.compareDocumentPosition(listRegion) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).not.toBe(0)
        expect(
            Array.from(container.querySelectorAll('.essay-index-preview')).map(
                (node) => node.textContent
            )
        ).toEqual(['Newest draft', 'Older draft', 'Published essay'])

        act(() =>
            (
                createAction.querySelector(
                    '.sidebar-create-button'
                ) as HTMLButtonElement
            ).click()
        )
        expect(onCreateDraft).toHaveBeenCalledTimes(1)

        const refreshButton = createAction.querySelector(
            '.sidebar-refresh-button'
        ) as HTMLButtonElement
        const createButton = createAction.querySelector(
            '.sidebar-create-button'
        ) as HTMLButtonElement
        expect(
            refreshButton.compareDocumentPosition(createButton) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).not.toBe(0)

        act(() => root.unmount())
        container.remove()
    })

    it('renders loading rows and marks locally modified essays', () => {
        const container = document.body.appendChild(document.createElement('div'))
        const root = createRoot(container)
        const props = {
            activeDocumentId: 'local:draft-one',
            drafts: [
                {
                    localId: 'draft-one',
                    content: '',
                    createdAt: 1,
                    updatedAt: 1,
                },
            ],
            entries: [],
            error: null,
            hasMore: false,
            loading: true,
            loadingMore: false,
            moreError: null,
            onCreateDraft: vi.fn(),
            onLoadMore: vi.fn(),
            onRefresh: vi.fn(),
            onRetry: vi.fn(),
            onSelectDraft: vi.fn(),
            onSelectEssay: vi.fn(),
            refreshDisabled: false,
            refreshing: false,
            selectedDate: null,
        }
        act(() => root.render(<SidebarEssayList {...props} />))
        expect(container.querySelectorAll('.essay-list-skeleton-item')).toHaveLength(6)

        act(() =>
            root.render(
                <SidebarEssayList
                    {...props}
                    loading={false}
                    activeDocumentId="essay:one"
                    entries={[
                        {
                            id: 'one',
                            content: '# Published',
                            localContent: '**Local** edit',
                        },
                    ]}
                />
            )
        )
        expect(container.querySelector('.essay-index-preview')?.textContent).toBe(
            'Local edit'
        )
        expect(container.querySelector('.essay-modified-marker')).not.toBeNull()
        expect(
            container.querySelector('button[aria-label$="有本地更改"]')
        ).not.toBeNull()

        act(() => root.unmount())
        container.remove()
    })

    it('refreshes after pulling past the threshold at the top', () => {
        const container = document.body.appendChild(document.createElement('div'))
        const root = createRoot(container)
        const onRefresh = vi.fn()
        act(() =>
            root.render(
                <SidebarEssayList
                    activeDocumentId="local:draft-one"
                    drafts={[
                        {
                            localId: 'draft-one',
                            content: '',
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ]}
                    entries={[]}
                    error={null}
                    hasMore={false}
                    loading={false}
                    loadingMore={false}
                    moreError={null}
                    onCreateDraft={vi.fn()}
                    onLoadMore={vi.fn()}
                    onRefresh={onRefresh}
                    onRetry={vi.fn()}
                    onSelectDraft={vi.fn()}
                    onSelectEssay={vi.fn()}
                    refreshDisabled={false}
                    refreshing={false}
                    selectedDate={null}
                />
            )
        )

        const region = container.querySelector('.sidebar-list-region')!
        const pointerEvent = (type: string, clientY: number) => {
            const event = new MouseEvent(type, {
                bubbles: true,
                button: 0,
                cancelable: true,
                clientY,
            })
            Object.defineProperties(event, {
                isPrimary: {value: true},
                pointerId: {value: 1},
                pointerType: {value: 'mouse'},
            })
            region.dispatchEvent(event)
        }

        act(() => {
            pointerEvent('pointerdown', 10)
            pointerEvent('pointermove', 150)
        })
        expect(container.textContent).toContain('松开刷新')

        act(() => pointerEvent('pointerup', 150))
        expect(onRefresh).toHaveBeenCalledTimes(1)
        expect(container.textContent).toContain('正在刷新')

        act(() => root.unmount())
        container.remove()
    })

    it('does not capture clicks that start on an article button', () => {
        const container = document.body.appendChild(document.createElement('div'))
        const root = createRoot(container)
        const onSelectEssay = vi.fn()
        act(() =>
            root.render(
                <SidebarEssayList
                    activeDocumentId="local:draft-one"
                    drafts={[
                        {
                            localId: 'draft-one',
                            content: '',
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ]}
                    entries={[{id: 'one', content: 'Published'}]}
                    error={null}
                    hasMore={false}
                    loading={false}
                    loadingMore={false}
                    moreError={null}
                    onCreateDraft={vi.fn()}
                    onLoadMore={vi.fn()}
                    onRefresh={vi.fn()}
                    onRetry={vi.fn()}
                    onSelectDraft={vi.fn()}
                    onSelectEssay={onSelectEssay}
                    refreshDisabled={false}
                    refreshing={false}
                    selectedDate={null}
                />
            )
        )

        const region = container.querySelector(
            '.sidebar-list-region'
        ) as HTMLDivElement
        const articleButton = container.querySelector(
            '.essay-index-item:not(.essay-new-item)'
        ) as HTMLButtonElement
        const setPointerCapture = vi.fn()
        region.setPointerCapture = setPointerCapture

        const pointerDown = new MouseEvent('pointerdown', {
            bubbles: true,
            button: 0,
            cancelable: true,
            clientY: 10,
        })
        Object.defineProperties(pointerDown, {
            isPrimary: {value: true},
            pointerId: {value: 1},
            pointerType: {value: 'mouse'},
        })

        act(() => {
            articleButton.dispatchEvent(pointerDown)
            articleButton.click()
        })

        expect(setPointerCapture).not.toHaveBeenCalled()
        expect(onSelectEssay).toHaveBeenCalledWith({
            id: 'one',
            content: 'Published',
        })

        act(() => root.unmount())
        container.remove()
    })

    it('loads the next page when scrolling near the bottom', () => {
        const container = document.body.appendChild(document.createElement('div'))
        const root = createRoot(container)
        const onLoadMore = vi.fn()
        act(() =>
            root.render(
                <SidebarEssayList
                    activeDocumentId="local:draft-one"
                    drafts={[
                        {
                            localId: 'draft-one',
                            content: '',
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ]}
                    entries={[{id: 'one', content: 'Published'}]}
                    error={null}
                    hasMore
                    loading={false}
                    loadingMore={false}
                    moreError={null}
                    onCreateDraft={vi.fn()}
                    onLoadMore={onLoadMore}
                    onRefresh={vi.fn()}
                    onRetry={vi.fn()}
                    onSelectDraft={vi.fn()}
                    onSelectEssay={vi.fn()}
                    refreshDisabled={false}
                    refreshing={false}
                    selectedDate={null}
                />
            )
        )

        const region = container.querySelector(
            '.sidebar-list-region'
        ) as HTMLDivElement
        Object.defineProperties(region, {
            clientHeight: {configurable: true, value: 300},
            scrollHeight: {configurable: true, value: 1000},
            scrollTop: {configurable: true, writable: true, value: 500},
        })

        act(() => region.dispatchEvent(new Event('scroll', {bubbles: true})))
        expect(onLoadMore).not.toHaveBeenCalled()

        region.scrollTop = 590
        act(() => region.dispatchEvent(new Event('scroll', {bubbles: true})))
        expect(onLoadMore).toHaveBeenCalledTimes(1)

        act(() => root.unmount())
        container.remove()
    })

    it('spins for first-page refreshes and disables without spinning while loading more', () => {
        const container = document.body.appendChild(document.createElement('div'))
        const root = createRoot(container)
        const props = {
            activeDocumentId: null,
            drafts: [],
            entries: [{id: 'one', content: 'Published'}],
            error: null,
            hasMore: true,
            loading: false,
            loadingMore: false,
            moreError: null,
            onCreateDraft: vi.fn(),
            onLoadMore: vi.fn(),
            onRefresh: vi.fn(),
            onRetry: vi.fn(),
            onSelectDraft: vi.fn(),
            onSelectEssay: vi.fn(),
            refreshDisabled: false,
            refreshing: true,
            selectedDate: null,
        }

        act(() => root.render(<SidebarEssayList {...props} />))
        let refreshButton = container.querySelector(
            '.sidebar-refresh-button'
        ) as HTMLButtonElement
        expect(refreshButton.disabled).toBe(true)
        expect(
            refreshButton.querySelector('.sidebar-refresh-icon.is-spinning')
        ).not.toBeNull()
        expect(container.querySelector('.pull-refresh-indicator')?.textContent)
            .toContain('正在刷新')
        expect(
            (container.querySelector('.pull-refresh-indicator') as HTMLElement)
                .style.getPropertyValue('--pull-refresh-distance')
        ).toBe('0px')

        act(() =>
            root.render(
                <SidebarEssayList
                    {...props}
                    refreshing={false}
                    loadingMore
                />
            )
        )
        refreshButton = container.querySelector(
            '.sidebar-refresh-button'
        ) as HTMLButtonElement
        expect(refreshButton.disabled).toBe(true)
        expect(
            refreshButton.querySelector('.sidebar-refresh-icon.is-spinning')
        ).toBeNull()

        act(() => root.unmount())
        container.remove()
    })
})
