import {createRef} from 'react'
import {EditorView} from '@codemirror/view'
import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import MarkdownEditor, {type MarkdownEditorHandle} from './markdown-editor'

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
})
