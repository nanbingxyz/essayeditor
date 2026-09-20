import {describe, expect, it} from 'vitest'

import {
    extractAnalysisText,
    hasAnalyzableWriting,
    mapExtractedRange,
} from './extract-analysis-text'

describe('extractAnalysisText', () => {
    it('keeps prose and drops markdown, images, and link URLs', () => {
        const source =
            '# 标题\n\n看[这里](https://example.com/path)和图片 ![示意图](https://img.example/a.png)'
        const extracted = extractAnalysisText(source)

        expect(extracted.text.replace(/\n+/g, '\n')).toBe(
            '标题\n看这里和图片'
        )
        expect(extracted.text).not.toContain('https://')
        expect(extracted.text).not.toContain('示意图')
        expect(extracted.text).not.toContain('#')
        expect(hasAnalyzableWriting(source)).toBe(true)
    })

    it('treats documents with only markup or links as empty', () => {
        expect(hasAnalyzableWriting('')).toBe(false)
        expect(hasAnalyzableWriting('![](https://example.com/a.png)')).toBe(
            false
        )
        expect(hasAnalyzableWriting('[](https://example.com)')).toBe(false)
        expect(hasAnalyzableWriting('<https://example.com>')).toBe(false)
        expect(hasAnalyzableWriting('```ts\nconst value = 1\n```')).toBe(
            false
        )
    })

    it('maps extracted quotes back onto the original source', () => {
        const source = '看[安祥](https://example.com)离世'
        const extracted = extractAnalysisText(source)
        const start = extracted.text.indexOf('安祥')
        const mapped = mapExtractedRange(
            extracted,
            start,
            start + 2
        )

        expect(extracted.text).toContain('看安祥离世')
        expect(mapped).toEqual({
            from: source.indexOf('安祥'),
            to: source.indexOf('安祥') + 2,
            quote: '安祥',
        })
    })
})
