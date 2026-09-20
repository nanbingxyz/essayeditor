import type {
    OpenAiCompatibleClient,
    OpenAiConfig,
} from './openai-client'
import {
    analysisCategories,
    type AnalysisCategory,
    type AnalysisChunk,
    type AnalysisIssue,
} from './model'
import {WRITING_ANALYSIS_SYSTEM_PROMPT} from './checklist'

const MAX_CHUNK_LENGTH = 5000
const MIN_CONFIDENCE = 0.85
const categorySet = new Set<string>(analysisCategories)

interface AnalyzeWritingOptions {
    client: OpenAiCompatibleClient
    config: OpenAiConfig
    content: string
    onProgress?: (completed: number, total: number) => void
    signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isAnalysisCategory(value: unknown): value is AnalysisCategory {
    return typeof value === 'string' && categorySet.has(value)
}

function expectedSeverity(category: AnalysisCategory) {
    if (category.startsWith('1.') || category.startsWith('2.')) {
        return 'hard' as const
    }
    if (category.startsWith('4.')) {
        return 'style' as const
    }
    return null
}

function findBalancedObject(text: string, start: number) {
    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < text.length; index += 1) {
        const character = text[index]
        if (inString) {
            if (escaped) {
                escaped = false
            } else if (character === '\\') {
                escaped = true
            } else if (character === '"') {
                inString = false
            }
            continue
        }
        if (character === '"') {
            inString = true
        } else if (character === '{') {
            depth += 1
        } else if (character === '}') {
            depth -= 1
            if (depth === 0) {
                return text.slice(start, index + 1)
            }
        }
    }
    return null
}

export function extractJsonPayload(text: string): unknown {
    const trimmed = text.trim()
    const candidates = [trimmed]
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) {
        candidates.push(fenced[1].trim())
    }
    for (let index = 0; index < text.length; index += 1) {
        if (text[index] === '{') {
            const object = findBalancedObject(text, index)
            if (object) {
                candidates.push(object)
                index += object.length - 1
            }
        }
    }

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate) as unknown
        } catch {
            continue
        }
    }
    return null
}

function locateQuote(
    chunk: AnalysisChunk,
    quote: string,
    suggestedStart: unknown,
    suggestedEnd: unknown
) {
    if (
        typeof suggestedStart === 'number' &&
        Number.isInteger(suggestedStart) &&
        typeof suggestedEnd === 'number' &&
        Number.isInteger(suggestedEnd) &&
        suggestedStart >= 0 &&
        suggestedEnd > suggestedStart &&
        suggestedEnd <= chunk.text.length &&
        chunk.text.slice(suggestedStart, suggestedEnd) === quote
    ) {
        return {from: suggestedStart, to: suggestedEnd}
    }

    const first = chunk.text.indexOf(quote)
    if (first < 0 || chunk.text.indexOf(quote, first + 1) >= 0) {
        return null
    }
    return {from: first, to: first + quote.length}
}

function parseIssue(
    value: unknown,
    chunk: AnalysisChunk,
    index: number
): AnalysisIssue | null {
    if (!isRecord(value)) {
        return null
    }
    const category = value.category
    const severity = value.severity
    const quote = value.quote
    const message = value.message
    const confidence = value.confidence
    if (
        !isAnalysisCategory(category) ||
        (severity !== 'hard' && severity !== 'style') ||
        typeof quote !== 'string' ||
        !quote ||
        typeof message !== 'string' ||
        !message.trim() ||
        typeof confidence !== 'number' ||
        confidence < MIN_CONFIDENCE ||
        confidence > 1
    ) {
        return null
    }

    const requiredSeverity = expectedSeverity(category)
    if (requiredSeverity !== null && severity !== requiredSeverity) {
        return null
    }
    const suggestion =
        typeof value.suggestion === 'string' ? value.suggestion.trim() : ''
    if (
        (severity === 'hard' && !suggestion) ||
        (severity === 'style' && suggestion)
    ) {
        return null
    }
    const range = locateQuote(chunk, quote, value.start, value.end)
    if (!range) {
        return null
    }

    const normalizedMessage =
        severity === 'style' && !message.trim().startsWith('这里或许')
            ? `这里或许存在${message.trim()}`
            : message.trim()
    const from = chunk.from + range.from
    const to = chunk.from + range.to
    return {
        category,
        dismissed: false,
        from,
        id: `${chunk.id}:${range.from}:${range.to}:${category}:${index}`,
        message: normalizedMessage,
        quote,
        severity,
        ...(suggestion ? {suggestion} : {}),
        to,
    }
}

export function parseAnalysisResponse(
    response: string,
    chunk: AnalysisChunk
) {
    const payload = extractJsonPayload(response)
    if (!isRecord(payload) || !Array.isArray(payload.issues)) {
        throw new Error('模型未返回有效的分析 JSON')
    }
    return payload.issues
        .map((issue, index) => parseIssue(issue, chunk, index))
        .filter((issue): issue is AnalysisIssue => issue !== null)
}

export function createAnalysisChunks(content: string): AnalysisChunk[] {
    const ranges: Array<{from: number; to: number}> = []
    let cursor = 0
    while (cursor < content.length) {
        let to = Math.min(cursor + MAX_CHUNK_LENGTH, content.length)
        if (to < content.length) {
            const paragraphBreak = content.lastIndexOf('\n\n', to)
            if (paragraphBreak >= cursor) {
                to = paragraphBreak + 2
            }
            if (
                content.charCodeAt(to - 1) >= 0xd800 &&
                content.charCodeAt(to - 1) <= 0xdbff
            ) {
                to -= 1
            }
        }
        ranges.push({from: cursor, to})
        cursor = to
    }
    return ranges
        .filter((range) => content.slice(range.from, range.to).trim())
        .map((range, index) => ({
            from: range.from,
            id: `chunk-${index}`,
            text: content.slice(range.from, range.to),
        }))
}

export function createContentFingerprint(content: string) {
    let hash = 0x811c9dc5
    for (let index = 0; index < content.length; index += 1) {
        hash ^= content.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return `${content.length}:${(hash >>> 0).toString(16)}`
}

export async function analyzeWriting({
    client,
    config,
    content,
    onProgress,
    signal,
}: AnalyzeWritingOptions) {
    const chunks = createAnalysisChunks(content)
    const issues: AnalysisIssue[] = []
    for (let index = 0; index < chunks.length; index += 1) {
        signal?.throwIfAborted()
        const chunk = chunks[index]
        const response = await client.complete(
            config,
            [
                {role: 'system', content: WRITING_ANALYSIS_SYSTEM_PROMPT},
                {
                    role: 'user',
                    content: JSON.stringify({text: chunk.text}),
                },
            ],
            signal
        )
        issues.push(...parseAnalysisResponse(response, chunk))
        onProgress?.(index + 1, chunks.length)
    }

    const seen = new Set<string>()
    return issues.filter((issue) => {
        const key = [
            issue.from,
            issue.to,
            issue.category,
            issue.message,
        ].join(':')
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}
