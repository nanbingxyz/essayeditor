import {syntaxTree} from '@codemirror/language'
import {
    EditorSelection,
    EditorState,
    Extension,
    Range,
    StateField,
} from '@codemirror/state'
import {
    Command,
    Decoration,
    DecorationSet,
    EditorView,
    KeyBinding,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
} from '@codemirror/view'
import {SyntaxNode} from '@lezer/common'

export interface MarkdownLivePreviewOptions {
    openExternal: (url: string) => void
    revealSyntaxOnInitialSelection?: boolean
}

export interface MarkdownTable {
    alignments: Array<'left' | 'center' | 'right' | null>
    headers: string[]
    rows: string[][]
}

function splitTableRow(line: string) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
    const cells: string[] = []
    let cell = ''
    let escaped = false

    for (const character of trimmed) {
        if (escaped) {
            cell += character
            escaped = false
        } else if (character === '\\') {
            escaped = true
        } else if (character === '|') {
            cells.push(cell.trim())
            cell = ''
        } else {
            cell += character
        }
    }

    if (escaped) {
        cell += '\\'
    }
    cells.push(cell.trim())
    return cells
}

export function parseMarkdownTable(source: string): MarkdownTable | null {
    const lines = source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

    if (lines.length < 2) {
        return null
    }

    const headers = splitTableRow(lines[0])
    const delimiters = splitTableRow(lines[1])
    if (
        headers.length === 0 ||
        headers.length !== delimiters.length ||
        delimiters.some((cell) => !/^:?-+:?$/.test(cell))
    ) {
        return null
    }

    const alignments = delimiters.map((cell) => {
        if (cell.startsWith(':') && cell.endsWith(':')) {
            return 'center' as const
        }
        if (cell.endsWith(':')) {
            return 'right' as const
        }
        if (cell.startsWith(':')) {
            return 'left' as const
        }
        return null
    })

    const rows = lines.slice(2).map((line) => {
        const cells = splitTableRow(line)
        return headers.map((_, index) => cells[index] ?? '')
    })

    return {alignments, headers, rows}
}

export function getSafeHttpUrl(value: string) {
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:'
            ? url.href
            : null
    } catch {
        return null
    }
}

function selectionTouchesState(state: EditorState, from: number, to: number) {
    return state.selection.ranges.some((range) =>
        range.empty
            ? range.from >= from && range.from <= to
            : range.from < to && range.to > from
    )
}

function selectionTouches(view: EditorView, from: number, to: number) {
    return selectionTouchesState(view.state, from, to)
}

class TextWidget extends WidgetType {
    constructor(
        private readonly text: string,
        private readonly className: string
    ) {
        super()
    }

    eq(other: TextWidget) {
        return other.text === this.text && other.className === this.className
    }

    toDOM() {
        const span = document.createElement('span')
        span.className = this.className
        span.textContent = this.text
        return span
    }
}

abstract class RevealWidget extends WidgetType {
    constructor(
        protected readonly from: number,
        protected readonly to: number
    ) {
        super()
    }

    protected makeElement(tagName: 'div' | 'span', className: string) {
        const element = document.createElement(tagName)
        element.className = className
        element.dataset.markdownRevealFrom = String(this.from)
        element.dataset.markdownRevealTo = String(this.to)
        return element
    }

    ignoreEvent() {
        return false
    }
}

class HorizontalRuleWidget extends RevealWidget {
    eq(other: HorizontalRuleWidget) {
        return other.from === this.from && other.to === this.to
    }

    toDOM() {
        const wrapper = this.makeElement('div', 'cm-md-horizontal-rule')
        wrapper.setAttribute('role', 'separator')
        return wrapper
    }
}

class ImageWidget extends RevealWidget {
    constructor(
        from: number,
        to: number,
        private readonly source: string,
        private readonly alt: string
    ) {
        super(from, to)
    }

    eq(other: ImageWidget) {
        return (
            other.from === this.from &&
            other.to === this.to &&
            other.source === this.source &&
            other.alt === this.alt
        )
    }

    toDOM() {
        const wrapper = this.makeElement('span', 'cm-md-image-preview')
        const safeSource = getSafeHttpUrl(this.source)

        if (!safeSource) {
            wrapper.classList.add('is-error')
            wrapper.textContent = '图片地址无效'
            return wrapper
        }

        const image = document.createElement('img')
        image.src = safeSource
        image.alt = this.alt
        image.loading = 'lazy'
        image.decoding = 'async'
        image.setAttribute('referrerpolicy', 'no-referrer')
        image.addEventListener('error', () => {
            image.remove()
            wrapper.classList.add('is-error')
            wrapper.textContent = this.alt
                ? `图片无法加载：${this.alt}`
                : '图片无法加载'
        })
        wrapper.append(image)
        return wrapper
    }
}

class TableWidget extends RevealWidget {
    constructor(
        from: number,
        to: number,
        private readonly table: MarkdownTable
    ) {
        super(from, to)
    }

    eq(other: TableWidget) {
        return (
            other.from === this.from &&
            other.to === this.to &&
            JSON.stringify(other.table) === JSON.stringify(this.table)
        )
    }

    toDOM() {
        const wrapper = this.makeElement('div', 'cm-md-table-preview')
        const table = document.createElement('table')
        const head = document.createElement('thead')
        const headRow = document.createElement('tr')

        this.table.headers.forEach((header, index) => {
            const cell = document.createElement('th')
            cell.textContent = header
            if (this.table.alignments[index]) {
                cell.style.textAlign = this.table.alignments[index]!
            }
            headRow.append(cell)
        })
        head.append(headRow)
        table.append(head)

        if (this.table.rows.length > 0) {
            const body = document.createElement('tbody')
            this.table.rows.forEach((row) => {
                const tableRow = document.createElement('tr')
                row.forEach((value, index) => {
                    const cell = document.createElement('td')
                    cell.textContent = value
                    if (this.table.alignments[index]) {
                        cell.style.textAlign = this.table.alignments[index]!
                    }
                    tableRow.append(cell)
                })
                body.append(tableRow)
            })
            table.append(body)
        }

        wrapper.append(table)
        return wrapper
    }
}

function getLinkParts(view: EditorView, node: SyntaxNode) {
    const urlNode = node.getChild('URL')
    if (!urlNode) {
        return null
    }

    const source = view.state.sliceDoc(node.from, node.to)
    const labelEndOffset = source.indexOf(']')
    if (labelEndOffset < 1) {
        return null
    }

    return {
        labelFrom: node.from + 1,
        labelTo: node.from + labelEndOffset,
        url: view.state.sliceDoc(urlNode.from, urlNode.to),
        urlFrom: urlNode.from,
        urlTo: urlNode.to,
    }
}

function getImageParts(view: EditorView, node: SyntaxNode) {
    const urlNode = node.getChild('URL')
    if (!urlNode) {
        return null
    }

    const source = view.state.sliceDoc(node.from, node.to)
    const altEndOffset = source.indexOf(']')
    if (altEndOffset < 2) {
        return null
    }

    return {
        alt: source.slice(2, altEndOffset),
        url: view.state.sliceDoc(urlNode.from, urlNode.to),
    }
}

function findLinkAt(view: EditorView, position: number) {
    let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(position, -1)
    while (node && node.name !== 'Link' && node.name !== 'Image') {
        node = node.parent
    }
    return node?.name === 'Link' ? node : null
}

function buildDecorations(view: EditorView, revealSelection = true) {
    const ranges: Range<Decoration>[] = []
    const seen = new Set<string>()
    const selectionTouchesPreview = (from: number, to: number) =>
        revealSelection && selectionTouches(view, from, to)
    const lineIsActivePreview = (position: number) => {
        const line = view.state.doc.lineAt(position)
        return selectionTouchesPreview(line.from, line.to)
    }

    const add = (key: string, range: Range<Decoration>) => {
        if (!seen.has(key)) {
            seen.add(key)
            ranges.push(range)
        }
    }

    const addLineClass = (position: number, className: string) => {
        const line = view.state.doc.lineAt(position)
        add(
            `line:${line.from}:${className}`,
            Decoration.line({class: className}).range(line.from)
        )
    }

    for (const visibleRange of view.visibleRanges) {
        const from = view.state.doc.lineAt(visibleRange.from).from
        const to = view.state.doc.lineAt(visibleRange.to).to

        syntaxTree(view.state).iterate({
            from,
            to,
            enter: (reference) => {
                const node = reference.node
                const source = view.state.sliceDoc(node.from, node.to)

                if (/^ATXHeading[1-4]$/.test(node.name)) {
                    addLineClass(node.from, 'cm-md-heading')
                    return
                }

                if (
                    node.name === 'HeaderMark' &&
                    node.parent &&
                    /^ATXHeading[1-4]$/.test(node.parent.name) &&
                    !selectionTouchesPreview(
                        node.parent.from,
                        node.parent.to
                    )
                ) {
                    const hideTo =
                        view.state.sliceDoc(node.to, node.to + 1) === ' '
                            ? node.to + 1
                            : node.to
                    add(
                        `hide:${node.from}:${hideTo}`,
                        Decoration.replace({}).range(node.from, hideTo)
                    )
                    return
                }

                if (node.name === 'StrongEmphasis' && node.to - node.from >= 4) {
                    add(
                        `strong:${node.from}:${node.to}`,
                        Decoration.mark({class: 'cm-md-strong'}).range(
                            node.from + 2,
                            node.to - 2
                        )
                    )
                    if (!selectionTouchesPreview(node.from, node.to)) {
                        add(
                            `hide:${node.from}:${node.from + 2}`,
                            Decoration.replace({}).range(node.from, node.from + 2)
                        )
                        add(
                            `hide:${node.to - 2}:${node.to}`,
                            Decoration.replace({}).range(node.to - 2, node.to)
                        )
                    }
                    return
                }

                if (node.name === 'Emphasis' && node.to - node.from >= 2) {
                    add(
                        `emphasis:${node.from}:${node.to}`,
                        Decoration.mark({class: 'cm-md-emphasis'}).range(
                            node.from + 1,
                            node.to - 1
                        )
                    )
                    if (!selectionTouchesPreview(node.from, node.to)) {
                        add(
                            `hide:${node.from}:${node.from + 1}`,
                            Decoration.replace({}).range(node.from, node.from + 1)
                        )
                        add(
                            `hide:${node.to - 1}:${node.to}`,
                            Decoration.replace({}).range(node.to - 1, node.to)
                        )
                    }
                    return
                }

                if (node.name === 'Image') {
                    if (!selectionTouchesPreview(node.from, node.to)) {
                        const image = getImageParts(view, node)
                        if (image) {
                            add(
                                `image:${node.from}:${node.to}`,
                                Decoration.replace({
                                    widget: new ImageWidget(
                                        node.from,
                                        node.to,
                                        image.url,
                                        image.alt
                                    ),
                                }).range(node.from, node.to)
                            )
                        }
                    }
                    return false
                }

                if (node.name === 'Link') {
                    const link = getLinkParts(view, node)
                    if (!link) {
                        return false
                    }

                    add(
                        `link:${link.labelFrom}:${link.labelTo}`,
                        Decoration.mark({class: 'cm-md-link'}).range(
                            link.labelFrom,
                            link.labelTo
                        )
                    )

                    if (!selectionTouchesPreview(node.from, node.to)) {
                        const hiddenRanges = [
                            [node.from, link.labelFrom],
                            [link.labelTo, link.urlFrom],
                            [link.urlFrom, link.urlTo],
                            [link.urlTo, node.to],
                        ]
                        hiddenRanges.forEach(([hideFrom, hideTo]) => {
                            if (hideFrom < hideTo) {
                                add(
                                    `hide:${hideFrom}:${hideTo}`,
                                    Decoration.replace({}).range(hideFrom, hideTo)
                                )
                            }
                        })
                    }
                    return false
                }

                if (node.name === 'QuoteMark') {
                    addLineClass(node.from, 'cm-md-blockquote')
                    if (!lineIsActivePreview(node.from)) {
                        add(
                            `hide:${node.from}:${node.to}`,
                            Decoration.replace({}).range(node.from, node.to)
                        )
                    }
                    return
                }

                if (node.name === 'ListMark') {
                    addLineClass(node.from, 'cm-md-list-item')
                    if (!lineIsActivePreview(node.from)) {
                        const marker = /^\d/.test(source) ? source : '•'
                        add(
                            `list:${node.from}:${node.to}`,
                            Decoration.replace({
                                widget: new TextWidget(marker, 'cm-md-list-marker'),
                            }).range(node.from, node.to)
                        )
                    }
                    return
                }

                if (node.name === 'HorizontalRule' || node.name === 'Table') {
                    return false
                }

                return
            },
        })
    }

    return Decoration.set(ranges, true)
}

function buildBlockDecorations(state: EditorState) {
    const ranges: Range<Decoration>[] = []

    syntaxTree(state).iterate({
        enter: (reference) => {
            const node = reference.node
            if (selectionTouchesState(state, node.from, node.to)) {
                return node.name === 'Table' ? false : undefined
            }

            if (node.name === 'HorizontalRule') {
                ranges.push(
                    Decoration.replace({
                        block: true,
                        widget: new HorizontalRuleWidget(node.from, node.to),
                    }).range(node.from, node.to)
                )
                return false
            }

            if (node.name === 'Table') {
                const table = parseMarkdownTable(
                    state.sliceDoc(node.from, node.to)
                )
                if (table) {
                    ranges.push(
                        Decoration.replace({
                            block: true,
                            widget: new TableWidget(node.from, node.to, table),
                        }).range(node.from, node.to)
                    )
                }
                return false
            }

            return
        },
    })

    return Decoration.set(ranges, true)
}

function getSelectedBlockKeys(state: EditorState) {
    const keys = new Set<string>()

    const addBlockAt = (position: number, side: -1 | 1) => {
        let node: SyntaxNode | null = syntaxTree(state).resolveInner(
            position,
            side
        )
        while (node) {
            if (node.name === 'Table' || node.name === 'HorizontalRule') {
                keys.add(`${node.name}:${node.from}:${node.to}`)
                return
            }
            node = node.parent
        }
    }

    state.selection.ranges.forEach((range) => {
        addBlockAt(range.from, 1)
        addBlockAt(range.to, -1)
    })
    return [...keys].sort().join('|')
}

export function markdownLivePreview({
    openExternal,
    revealSyntaxOnInitialSelection = true,
}: MarkdownLivePreviewOptions): Extension {
    const openLinkFromPointer = (event: MouseEvent, view: EditorView) => {
        const position = view.posAtCoords({
            x: event.clientX,
            y: event.clientY,
        })
        if (position === null) {
            return false
        }

        const linkNode = findLinkAt(view, position)
        const urlNode = linkNode?.getChild('URL')
        const safeUrl = urlNode
            ? getSafeHttpUrl(view.state.sliceDoc(urlNode.from, urlNode.to))
            : null
        if (!safeUrl) {
            return false
        }

        event.preventDefault()
        openExternal(safeUrl)
        return true
    }

    const blockDecorations = StateField.define<DecorationSet>({
        create: buildBlockDecorations,
        update(value, transaction) {
            if (transaction.docChanged) {
                return buildBlockDecorations(transaction.state)
            }
            if (
                transaction.selection &&
                getSelectedBlockKeys(transaction.startState) !==
                    getSelectedBlockKeys(transaction.state)
            ) {
                return buildBlockDecorations(transaction.state)
            }
            return value.map(transaction.changes)
        },
        provide: (field) => EditorView.decorations.from(field),
    })

    const inlineDecorations = ViewPlugin.fromClass(
        class {
            decorations: DecorationSet
            private revealSelection = revealSyntaxOnInitialSelection

            constructor(view: EditorView) {
                this.decorations = buildDecorations(
                    view,
                    this.revealSelection
                )
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.selectionSet) {
                    this.revealSelection = true
                }
                if (
                    update.docChanged ||
                    update.selectionSet ||
                    update.viewportChanged ||
                    update.geometryChanged
                ) {
                    this.decorations = buildDecorations(
                        update.view,
                        this.revealSelection
                    )
                }
            }
        },
        {
            decorations: (instance) => instance.decorations,
            eventHandlers: {
                mousedown(event, view) {
                    if (
                        (event.metaKey || event.ctrlKey) &&
                        openLinkFromPointer(event, view)
                    ) {
                        return true
                    }

                    const target = event.target
                    if (!(target instanceof Element)) {
                        return false
                    }

                    const revealTarget = target.closest<HTMLElement>(
                        '[data-markdown-reveal-from]'
                    )
                    const from = Number(revealTarget?.dataset.markdownRevealFrom)
                    if (!revealTarget || !Number.isFinite(from)) {
                        return false
                    }

                    event.preventDefault()
                    view.dispatch({selection: {anchor: from}})
                    view.focus()
                    return true
                },
            },
        }
    )

    return [blockDecorations, inlineDecorations]
}

function toggleDelimited(open: string, close = open): Command {
    return (view) => {
        const {state} = view
        const transaction = state.changeByRange((range) => {
            const selected = state.sliceDoc(range.from, range.to)
            const before = state.sliceDoc(
                Math.max(0, range.from - open.length),
                range.from
            )
            const after = state.sliceDoc(
                range.to,
                Math.min(state.doc.length, range.to + close.length)
            )

            if (before === open && after === close) {
                return {
                    changes: [
                        {from: range.from - open.length, to: range.from},
                        {from: range.to, to: range.to + close.length},
                    ],
                    range: EditorSelection.range(
                        range.from - open.length,
                        range.to - open.length
                    ),
                }
            }

            if (
                selected.startsWith(open) &&
                selected.endsWith(close) &&
                selected.length >= open.length + close.length
            ) {
                const inner = selected.slice(open.length, -close.length)
                return {
                    changes: {from: range.from, to: range.to, insert: inner},
                    range: EditorSelection.range(
                        range.from,
                        range.from + inner.length
                    ),
                }
            }

            return {
                changes: [
                    {from: range.from, insert: open},
                    {from: range.to, insert: close},
                ],
                range: range.empty
                    ? EditorSelection.cursor(range.from + open.length)
                    : EditorSelection.range(
                          range.from + open.length,
                          range.to + open.length
                      ),
            }
        })

        view.dispatch(transaction)
        return true
    }
}

export const toggleBold = toggleDelimited('**')
export const toggleItalic = toggleDelimited('*')

export const toggleLink: Command = (view) => {
    const {state} = view
    const transaction = state.changeByRange((range) => {
        const selected = state.sliceDoc(range.from, range.to)
        const tail = state.sliceDoc(
            range.to,
            Math.min(state.doc.length, range.to + 2048)
        )
        const closingMatch = /^\]\(([^)\n]*)\)/.exec(tail)
        const hasOpeningBracket = state.sliceDoc(
            Math.max(0, range.from - 1),
            range.from
        ) === '['

        if (hasOpeningBracket && closingMatch) {
            return {
                changes: [
                    {from: range.from - 1, to: range.from},
                    {
                        from: range.to,
                        to: range.to + closingMatch[0].length,
                    },
                ],
                range: EditorSelection.range(range.from - 1, range.to - 1),
            }
        }

        const completeLink = /^\[([^\]]*)\]\(([^)\n]*)\)$/.exec(selected)
        if (completeLink) {
            return {
                changes: {
                    from: range.from,
                    to: range.to,
                    insert: completeLink[1],
                },
                range: EditorSelection.range(
                    range.from,
                    range.from + completeLink[1].length
                ),
            }
        }

        const replacement = `[${selected}](https://)`
        const selection = range.empty
            ? EditorSelection.cursor(range.from + 1)
            : EditorSelection.range(
                  range.from + selected.length + 3,
                  range.from + selected.length + 11
              )
        return {
            changes: {from: range.from, to: range.to, insert: replacement},
            range: selection,
        }
    })

    view.dispatch(transaction)
    return true
}

export const markdownFormatKeymap: readonly KeyBinding[] = [
    {key: 'Mod-b', run: toggleBold, preventDefault: true},
    {key: 'Mod-i', run: toggleItalic, preventDefault: true},
    {key: 'Mod-k', run: toggleLink, preventDefault: true},
]
