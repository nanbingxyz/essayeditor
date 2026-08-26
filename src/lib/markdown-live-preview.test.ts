import {history, redo, undo} from '@codemirror/commands'
import {markdown, markdownLanguage} from '@codemirror/lang-markdown'
import {EditorState} from '@codemirror/state'
import {EditorView} from '@codemirror/view'
import {afterEach, describe, expect, it} from 'vitest'

import {
    getSafeHttpUrl,
    markdownLivePreview,
    parseMarkdownTable,
    toggleBold,
    toggleItalic,
    toggleLink,
} from './markdown-live-preview'

const views: EditorView[] = []

function createView(source: string, cursor = source.length) {
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = new EditorView({
        parent,
        state: EditorState.create({
            doc: source,
            selection: {anchor: cursor},
            extensions: [
                history(),
                markdown({base: markdownLanguage}),
                markdownLivePreview({openExternal: () => undefined}),
            ],
        }),
    })
    views.push(view)
    return view
}

afterEach(() => {
    views.splice(0).forEach((view) => view.destroy())
    document.body.replaceChildren()
})

describe('markdown live preview', () => {
    it('styles h1 through h4 equally and leaves h5 as source', () => {
        const source = '# one\n## two\n### three\n#### four\n##### five\n\nend'
        const view = createView(source)
        const headingLines = view.dom.querySelectorAll('.cm-md-heading')

        expect(headingLines).toHaveLength(4)
        expect(headingLines[0].textContent).toBe('one')
        expect(headingLines[1].textContent).toBe('two')
        expect(view.dom.textContent).toContain('##### five')
        expect(view.state.doc.toString()).toBe(source)
    })

    it('renders inline formatting and reveals syntax at the cursor', () => {
        const source = '**bold** and *italic* and [Essay](https://essay.ink)\n\nend'
        const view = createView(source)

        expect(view.dom.querySelector('.cm-md-strong')?.textContent).toBe('bold')
        expect(view.dom.querySelector('.cm-md-emphasis')?.textContent).toBe(
            'italic'
        )
        expect(view.dom.querySelector('.cm-md-link')?.textContent).toBe('Essay')
        expect(view.dom.textContent).not.toContain('https://essay.ink')

        view.dispatch({selection: {anchor: 3}})
        expect(view.dom.textContent).toContain('**bold**')
    })

    it('renders quotes, lists, rules, images, and GFM tables', () => {
        const source = [
            '> quote',
            '',
            '- bullet',
            '1. ordered',
            '',
            '---',
            '',
            '![alt](https://example.com/image.png)',
            '',
            '| A | B |',
            '| :--- | ---: |',
            '| x | y |',
            '',
            'end',
        ].join('\n')
        const view = createView(source)

        expect(view.dom.querySelector('.cm-md-blockquote')).not.toBeNull()
        expect(view.dom.querySelectorAll('.cm-md-list-item')).toHaveLength(2)
        expect(view.dom.querySelector('.cm-md-horizontal-rule')).not.toBeNull()
        expect(
            view.dom.querySelector<HTMLImageElement>('.cm-md-image-preview img')
                ?.src
        ).toBe('https://example.com/image.png')
        expect(view.state.doc.toString()).toBe(source)

        const tableSource = [
            '| A | B |',
            '| :--- | ---: |',
            '| x | y |',
            '',
            'end',
        ].join('\n')
        const tableView = createView(tableSource)
        expect(
            tableView.dom.querySelector('.cm-md-table-preview table')
        ).not.toBeNull()
        expect(tableView.dom.querySelector('th')?.textContent).toBe('A')

        tableView.dispatch({selection: {anchor: 2}})
        expect(
            tableView.dom.querySelector('.cm-md-table-preview')
        ).toBeNull()
        expect(tableView.dom.textContent).toContain('| A | B |')

        tableView.dispatch({selection: {anchor: tableSource.length}})
        expect(
            tableView.dom.querySelector('.cm-md-table-preview')
        ).not.toBeNull()
    })

    it('keeps malformed input editable and blocks unsafe image URLs', () => {
        const source = [
            '**unfinished',
            '[unfinished](https://example.com',
            '![unsafe](javascript:alert(1))',
            '| incomplete | table |',
            '',
            'end',
        ].join('\n')
        const view = createView(source)

        expect(view.state.doc.toString()).toBe(source)
        expect(view.dom.querySelector('.cm-md-table-preview')).toBeNull()
        expect(view.dom.querySelector('.cm-md-image-preview img')).toBeNull()
        expect(view.dom.textContent).not.toContain('图片无法加载')
    })
})

describe('format commands', () => {
    it('toggles bold and supports undo', () => {
        const view = createView('word', 0)
        view.dispatch({selection: {anchor: 0, head: 4}})

        expect(toggleBold(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('**word**')
        expect(undo(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('word')
        expect(redo(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('**word**')
        expect(toggleBold(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('word')
    })

    it('toggles italic delimiters', () => {
        const view = createView('word', 0)
        view.dispatch({selection: {anchor: 0, head: 4}})

        expect(toggleItalic(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('*word*')
        expect(toggleItalic(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('word')
    })

    it('creates and removes a link while preserving its label', () => {
        const view = createView('Essay', 0)
        view.dispatch({selection: {anchor: 0, head: 5}})

        expect(toggleLink(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('[Essay](https://)')

        view.dispatch({selection: {anchor: 1, head: 6}})
        expect(toggleLink(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('Essay')
    })
})

describe('markdown utilities', () => {
    it('accepts only HTTP image and link URLs', () => {
        expect(getSafeHttpUrl('https://essay.ink')).toBe('https://essay.ink/')
        expect(getSafeHttpUrl('http://essay.ink/path')).toBe(
            'http://essay.ink/path'
        )
        expect(getSafeHttpUrl('javascript:alert(1)')).toBeNull()
        expect(getSafeHttpUrl('data:text/html,test')).toBeNull()
        expect(getSafeHttpUrl('/relative')).toBeNull()
    })

    it('parses table alignment and escaped pipes', () => {
        expect(
            parseMarkdownTable(
                '| Left | Center | Right |\n| :--- | :---: | ---: |\n| a \\| b | c | d |'
            )
        ).toEqual({
            alignments: ['left', 'center', 'right'],
            headers: ['Left', 'Center', 'Right'],
            rows: [['a | b', 'c', 'd']],
        })
    })

    it('rejects incomplete tables', () => {
        expect(parseMarkdownTable('| A | B |')).toBeNull()
        expect(parseMarkdownTable('| A | B |\n| --- |')).toBeNull()
        expect(parseMarkdownTable('| A | B |\n| nope | --- |')).toBeNull()
    })
})
