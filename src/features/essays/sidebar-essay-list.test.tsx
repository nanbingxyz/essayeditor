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
    it('renders loading rows and marks locally modified essays', () => {
        const container = document.body.appendChild(document.createElement('div'))
        const root = createRoot(container)
        const props = {
            activeEssayId: null,
            activeIsNew: true,
            entries: [],
            error: null,
            hasMore: false,
            loading: true,
            loadingMore: false,
            moreError: null,
            newDraftContent: '',
            onLoadMore: vi.fn(),
            onRetry: vi.fn(),
            onSelectEssay: vi.fn(),
            onSelectNew: vi.fn(),
            selectedDate: null,
        }
        act(() => root.render(<SidebarEssayList {...props} />))
        expect(container.querySelectorAll('.essay-list-skeleton-item')).toHaveLength(6)

        act(() =>
            root.render(
                <SidebarEssayList
                    {...props}
                    loading={false}
                    activeEssayId="one"
                    activeIsNew={false}
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
})
