import type {Nodes} from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import {unified} from 'unified'

const markdownParser = unified().use(remarkParse).use(remarkGfm)

const skippedNodeTypes = new Set([
    'code',
    'definition',
    'html',
    'image',
    'imageReference',
    'thematicBreak',
    'yaml',
])

const blockNodeTypes = new Set(['heading', 'paragraph', 'tableRow'])

export interface ExtractedSpan {
    extractedFrom: number
    extractedTo: number
    sourceFrom: number
    sourceTo: number
}

export interface ExtractedAnalysisText {
    source: string
    spans: ExtractedSpan[]
    text: string
}

function isParent(node: Nodes): node is Nodes & {children: Nodes[]} {
    return 'children' in node && Array.isArray(node.children)
}

function isUrlLike(value: string) {
    const trimmed = value.trim()
    return (
        /^https?:\/\//i.test(trimmed) ||
        /^mailto:/i.test(trimmed) ||
        /^www\./i.test(trimmed)
    )
}

function sourceRange(node: Nodes) {
    const from = node.position?.start.offset
    const to = node.position?.end.offset
    if (
        typeof from !== 'number' ||
        typeof to !== 'number' ||
        to < from
    ) {
        return null
    }
    return {from, to}
}

export function extractAnalysisText(source: string): ExtractedAnalysisText {
    const spans: ExtractedSpan[] = []
    let text = ''

    const append = (value: string, range: {from: number; to: number}) => {
        if (!value) {
            return
        }
        const extractedFrom = text.length
        text += value
        spans.push({
            extractedFrom,
            extractedTo: text.length,
            sourceFrom: range.from,
            sourceTo: range.to,
        })
    }

    const visit = (node: Nodes) => {
        if (skippedNodeTypes.has(node.type)) {
            return
        }
        if (blockNodeTypes.has(node.type) && text.length > 0 && !text.endsWith('\n')) {
            text += '\n\n'
        }
        if (node.type === 'text' || node.type === 'inlineCode') {
            if (isUrlLike(node.value)) {
                return
            }
            const range = sourceRange(node)
            if (range) {
                append(node.value, range)
            }
            return
        }
        if (isParent(node)) {
            node.children.forEach(visit)
        }
    }

    visit(markdownParser.parse(source))
    return trimExtractedText({source, spans, text})
}

function trimExtractedText(
    extracted: ExtractedAnalysisText
): ExtractedAnalysisText {
    const text = extracted.text.trimEnd()
    if (text.length === extracted.text.length) {
        return extracted
    }
    return {
        source: extracted.source,
        text,
        spans: extracted.spans.flatMap((span) => {
            if (span.extractedFrom >= text.length) {
                return []
            }
            return [
                {
                    ...span,
                    extractedTo: Math.min(span.extractedTo, text.length),
                },
            ]
        }),
    }
}

export function hasAnalyzableWriting(source: string) {
    return extractAnalysisText(source).text.trim().length > 0
}

export function mapExtractedRange(
    extracted: ExtractedAnalysisText,
    from: number,
    to: number
) {
    if (from < 0 || to <= from || to > extracted.text.length) {
        return null
    }

    let sourceFrom: number | undefined
    let sourceTo: number | undefined
    for (const span of extracted.spans) {
        const overlapFrom = Math.max(from, span.extractedFrom)
        const overlapTo = Math.min(to, span.extractedTo)
        if (overlapFrom >= overlapTo) {
            continue
        }
        const start = mapExtractedPoint(span, overlapFrom)
        const end = mapExtractedPoint(span, overlapTo)
        sourceFrom =
            sourceFrom === undefined ? start : Math.min(sourceFrom, start)
        sourceTo = sourceTo === undefined ? end : Math.max(sourceTo, end)
    }

    if (
        sourceFrom === undefined ||
        sourceTo === undefined ||
        sourceTo <= sourceFrom ||
        sourceTo > extracted.source.length
    ) {
        return null
    }

    return {
        from: sourceFrom,
        to: sourceTo,
        quote: extracted.source.slice(sourceFrom, sourceTo),
    }
}

function mapExtractedPoint(span: ExtractedSpan, extractedOffset: number) {
    if (extractedOffset <= span.extractedFrom) {
        return span.sourceFrom
    }
    if (extractedOffset >= span.extractedTo) {
        return span.sourceTo
    }
    const extractedLength = span.extractedTo - span.extractedFrom
    const sourceLength = span.sourceTo - span.sourceFrom
    if (extractedLength === sourceLength) {
        return span.sourceFrom + (extractedOffset - span.extractedFrom)
    }
    return span.sourceFrom
}
