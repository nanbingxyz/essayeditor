import {describe, expect, it} from 'vitest'

import {hasRenderableMarkdownContent} from './markdown-content'

describe('hasRenderableMarkdownContent', () => {
    it.each([
        '',
        '   \n\t',
        '[]()',
        '![]()',
        '![替代文本]()',
        '``',
        '`   `',
        '```\n```',
        '```ts\n   \n```',
    ])('rejects Markdown without rendered content: %j', (content) => {
        expect(hasRenderableMarkdownContent(content)).toBe(false)
    })

    it.each([
        '正文',
        '[Essay]()',
        '`const value = 1`',
        '```ts\nconst value = 1\n```',
        '![](https://example.com/image.png)',
    ])('accepts Markdown with rendered content: %j', (content) => {
        expect(hasRenderableMarkdownContent(content)).toBe(true)
    })
})
