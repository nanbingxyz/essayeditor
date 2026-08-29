import {afterEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react-dom/test-utils'

const pdfMock = vi.hoisted(() => {
    const state = {html: ''}
    const worker: Record<string, unknown> = {}
    worker.set = vi.fn(() => worker)
    worker.from = vi.fn((element: HTMLElement) => {
        state.html = element.innerHTML
        return worker
    })
    worker.outputPdf = vi.fn(async () =>
        Uint8Array.from([37, 80, 68, 70]).buffer
    )

    return {state, worker}
})

vi.mock('html2pdf.js', () => ({
    default: () => pdfMock.worker,
}))

import {createMarkdownPdf} from './markdown-pdf'

afterEach(() => {
    document.body.replaceChildren()
    pdfMock.state.html = ''
    vi.clearAllMocks()
})

describe('createMarkdownPdf', () => {
    it('renders GFM content and returns generated PDF bytes', async () => {
        let result: Uint8Array | undefined
        await act(async () => {
            result = await createMarkdownPdf(`
# 中文标题

> 引用内容

| 项目 | 数量 |
| --- | ---: |
| 苹果 | 2 |

\`inline code\`
            `)
        })

        expect(Array.from(result ?? [])).toEqual([37, 80, 68, 70])
        expect(pdfMock.state.html).toContain('<h1>中文标题</h1>')
        expect(pdfMock.state.html).toContain('<blockquote>')
        expect(pdfMock.state.html).toContain('<table>')
        expect(pdfMock.state.html).toContain('<code>inline code</code>')
        expect(document.querySelector('.pdf-export-document')).toBeNull()
    })
})
