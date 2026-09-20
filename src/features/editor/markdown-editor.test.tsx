import {createRef} from 'react'
import {undo} from '@codemirror/commands'
import {EditorView} from '@codemirror/view'
import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import MarkdownEditor, {type MarkdownEditorHandle} from './markdown-editor'
import type {AnalysisIssue} from '@/features/analysis'
import {dismissEditorAnalysisIssue} from './analysis-decorations'

const roots: Root[] = []

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

describe('MarkdownEditor document switching', () => {
    it('reuses the EditorView and does not emit a change while switching', () => {
        const setState = vi.spyOn(EditorView.prototype, 'setState')
        const container = document.body.appendChild(
            document.createElement('div')
        )
        const root = createRoot(container)
        roots.push(root)
        const editorRef = createRef<MarkdownEditorHandle>()
        const onChange = vi.fn()

        act(() => {
            root.render(
                <MarkdownEditor
                    ref={editorRef}
                    documentKey="essay:first"
                    value="First article"
                    onChange={onChange}
                />
            )
        })
        const editorDom = container.querySelector('.cm-editor')
        const scrollDom = container.querySelector(
            '.cm-scroller'
        ) as HTMLElement
        scrollDom.scrollTop = 120
        scrollDom.scrollLeft = 40
        expect(editorRef.current?.getValue()).toBe('First article')

        act(() => {
            root.render(
                <MarkdownEditor
                    ref={editorRef}
                    documentKey="essay:second"
                    value="Second article"
                    onChange={onChange}
                />
            )
        })

        expect(container.querySelector('.cm-editor')).toBe(editorDom)
        expect(scrollDom.scrollTop).toBe(0)
        expect(scrollDom.scrollLeft).toBe(0)
        expect(editorRef.current?.getValue()).toBe('Second article')
        expect(setState).not.toHaveBeenCalled()
        expect(onChange).not.toHaveBeenCalled()
    })

    it('keeps imperative edits user-visible after a document reset', () => {
        const container = document.body.appendChild(
            document.createElement('div')
        )
        const root = createRoot(container)
        roots.push(root)
        const editorRef = createRef<MarkdownEditorHandle>()
        const onChange = vi.fn()

        act(() => {
            root.render(
                <MarkdownEditor
                    ref={editorRef}
                    documentKey="local:first"
                    value="First"
                    onChange={onChange}
                />
            )
        })
        act(() => editorRef.current?.setValue('Edited first'))
        expect(onChange).toHaveBeenLastCalledWith('Edited first')

        const content = container.querySelector('.cm-content') as HTMLElement
        act(() => {
            content.dispatchEvent(
                new KeyboardEvent('keydown', {
                    bubbles: true,
                    code: 'KeyZ',
                    ctrlKey: true,
                    key: 'z',
                })
            )
            content.dispatchEvent(
                new KeyboardEvent('keydown', {
                    bubbles: true,
                    code: 'KeyZ',
                    key: 'z',
                    metaKey: true,
                })
            )
        })
        expect(editorRef.current?.getValue()).toBe('First')
        act(() => editorRef.current?.setValue('Edited first'))

        onChange.mockClear()
        act(() => {
            root.render(
                <MarkdownEditor
                    ref={editorRef}
                    documentKey="local:second"
                    value="Second"
                    onChange={onChange}
                />
            )
        })
        expect(editorRef.current?.getValue()).toBe('Second')
        const nextContent = container.querySelector(
            '.cm-content'
        ) as HTMLElement
        act(() => {
            nextContent.dispatchEvent(
                new KeyboardEvent('keydown', {
                    bubbles: true,
                    code: 'KeyZ',
                    ctrlKey: true,
                    key: 'z',
                })
            )
            nextContent.dispatchEvent(
                new KeyboardEvent('keydown', {
                    bubbles: true,
                    code: 'KeyZ',
                    key: 'z',
                    metaKey: true,
                })
            )
        })
        expect(editorRef.current?.getValue()).toBe('Second')
        expect(onChange).not.toHaveBeenCalled()
    })

    it('maps findings outside edits and hides then restores changed findings on undo', () => {
        const container = document.body.appendChild(
            document.createElement('div')
        )
        const root = createRoot(container)
        roots.push(root)
        const onAnalysisIssuesChange = vi.fn()
        const issues: AnalysisIssue[] = [
            {
                category: '1.1',
                dismissed: false,
                from: 1,
                id: 'hard',
                message: '同音字误用',
                quote: '错误',
                severity: 'hard',
                suggestion: '应该是“正确”',
                to: 3,
            },
            {
                category: '4.4',
                dismissed: false,
                from: 1,
                id: 'style',
                message: '这里或许存在语义重复',
                quote: '错误',
                severity: 'style',
                to: 3,
            },
        ]

        act(() => {
            root.render(
                <MarkdownEditor
                    analysisIssues={issues}
                    documentKey="local:analysis"
                    value="前错误后"
                    onAnalysisIssuesChange={onAnalysisIssuesChange}
                />
            )
        })
        const editorElement = container.querySelector(
            '.cm-editor'
        ) as HTMLElement
        const view = EditorView.findFromDOM(editorElement)
        if (!view) {
            throw new Error('EditorView was not created')
        }
        expect(container.querySelectorAll('.cm-analysis-hard')).toHaveLength(
            1
        )
        expect(container.querySelectorAll('.cm-analysis-style')).toHaveLength(
            0
        )

        act(() => {
            view.dispatch({changes: {from: 0, insert: '新'}})
        })
        expect(onAnalysisIssuesChange).toHaveBeenLastCalledWith([
            expect.objectContaining({id: 'hard', from: 2, to: 4}),
            expect.objectContaining({id: 'style', from: 2, to: 4}),
        ], '新前错误后')
        expect(container.querySelectorAll('.cm-analysis-hard')).toHaveLength(
            1
        )

        act(() => {
            view.dispatch({changes: {from: 2, to: 3, insert: '正'}})
        })
        expect(container.querySelectorAll('.cm-analysis-issue')).toHaveLength(
            0
        )

        act(() => {
            undo(view)
        })
        expect(view.state.doc.toString()).toBe('新前错误后')
        expect(container.querySelectorAll('.cm-analysis-hard')).toHaveLength(
            1
        )

        act(() => {
            view.dispatch({changes: {from: 2, to: 4, insert: ''}})
        })
        expect(container.querySelectorAll('.cm-analysis-issue')).toHaveLength(
            0
        )
        act(() => {
            undo(view)
        })
        expect(view.state.doc.toString()).toBe('新前错误后')
        expect(container.querySelectorAll('.cm-analysis-hard')).toHaveLength(
            1
        )
    })

    it('dismisses issues individually and removes the mark with the last issue', () => {
        const container = document.body.appendChild(
            document.createElement('div')
        )
        const root = createRoot(container)
        roots.push(root)
        const onAnalysisIssuesChange = vi.fn()
        const issues: AnalysisIssue[] = [
            {
                category: '1.1',
                dismissed: false,
                from: 0,
                id: 'first',
                message: '问题一',
                quote: '文本',
                severity: 'hard',
                suggestion: '应该修正',
                to: 2,
            },
            {
                category: '4.1',
                dismissed: false,
                from: 0,
                id: 'second',
                message: '这里或许存在问题二',
                quote: '文本',
                severity: 'style',
                to: 2,
            },
        ]

        act(() => {
            root.render(
                <MarkdownEditor
                    analysisIssues={issues}
                    value="文本"
                    onAnalysisIssuesChange={onAnalysisIssuesChange}
                />
            )
        })
        const view = EditorView.findFromDOM(
            container.querySelector('.cm-editor') as HTMLElement
        )
        if (!view) {
            throw new Error('EditorView was not created')
        }

        act(() => dismissEditorAnalysisIssue(view, 'first'))
        expect(container.querySelectorAll('.cm-analysis-style')).toHaveLength(
            1
        )
        expect(onAnalysisIssuesChange).toHaveBeenLastCalledWith(
            [expect.objectContaining({id: 'second'})],
            '文本'
        )

        act(() => dismissEditorAnalysisIssue(view, 'second'))
        expect(container.querySelectorAll('.cm-analysis-issue')).toHaveLength(
            0
        )
        expect(onAnalysisIssuesChange).toHaveBeenLastCalledWith([], '文本')
    })
})
