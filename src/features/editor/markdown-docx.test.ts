import JSZip from 'jszip'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {nativeImageFetch} = vi.hoisted(() => ({
    nativeImageFetch: vi.fn(),
}))

vi.mock('@/shared/platform/http', () => ({
    desktopHttpClient: nativeImageFetch,
}))

import {createMarkdownDocx} from './markdown-docx'

const PNG_BYTES = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0,
    1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68,
    65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153,
    61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
])

describe('createMarkdownDocx', () => {
    beforeEach(() => {
        nativeImageFetch.mockReset()
    })

    it('creates a Word document from common Markdown structures', async () => {
        const output = await createMarkdownDocx(`# 中文标题

正文包含 **粗体**、*斜体*、[链接](https://essay.ink) 和 \`代码\`。

> 引用段落

1. 第一项
2. 第二项

| 名称 | 值 |
| --- | --- |
| Essay | 42 |

\`\`\`ts
const answer = 42
\`\`\``)

        expect(output.byteLength).toBeGreaterThan(1_000)
        expect(Array.from(output.slice(0, 4))).toEqual([80, 75, 3, 4])
    })

    it('creates a valid empty document', async () => {
        const output = await createMarkdownDocx('')

        expect(output.byteLength).toBeGreaterThan(1_000)
        expect(Array.from(output.slice(0, 4))).toEqual([80, 75, 3, 4])
    })

    it('downloads without a referrer and embeds a Markdown image', async () => {
        nativeImageFetch.mockImplementation(async () =>
            new Response(PNG_BYTES, {
                headers: {'content-type': 'image/png'},
                status: 200,
            })
        )

        const output = await createMarkdownDocx(
            '![嵌入图片](https://cdn.example.com/image.png)'
        )
        const archive = await JSZip.loadAsync(output)
        const mediaFiles = Object.keys(archive.files).filter(
            (path) =>
                path.startsWith('word/media/') && !archive.files[path].dir
        )
        const documentXml = await archive
            .file('word/document.xml')
            ?.async('string')

        expect(nativeImageFetch).toHaveBeenCalledOnce()
        expect(nativeImageFetch).toHaveBeenCalledWith(
            'https://cdn.example.com/image.png',
            expect.objectContaining({
                credentials: 'omit',
                maxRedirections: 0,
                referrerPolicy: 'no-referrer',
                signal: expect.any(AbortSignal),
            })
        )
        expect(mediaFiles).toHaveLength(1)
        expect(
            await archive.file(mediaFiles[0])?.async('uint8array')
        ).toEqual(PNG_BYTES)
        expect(documentXml).toContain('嵌入图片')
        expect(documentXml).not.toContain('[图片')
    })

    it('embeds SVG and scales it to the page width', async () => {
        const svg = new TextEncoder().encode(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640"><rect width="1280" height="640"/></svg>'
        )
        const fetchImage = vi.fn(async () => new Response(svg)) as typeof fetch

        const output = await createMarkdownDocx(
            '![宽图](https://cdn.example.com/image.svg)',
            {fetchImage}
        )
        const archive = await JSZip.loadAsync(output)
        const mediaFiles = Object.keys(archive.files).filter(
            (path) =>
                path.startsWith('word/media/') && !archive.files[path].dir
        )
        const documentXml = await archive
            .file('word/document.xml')
            ?.async('string')

        expect(mediaFiles.some((path) => path.endsWith('.svg'))).toBe(true)
        expect(mediaFiles.some((path) => path.endsWith('.png'))).toBe(true)
        expect(documentXml).toContain('cx="6096000" cy="3048000"')
    })

    it('falls back to an image label and link when downloading fails', async () => {
        const fetchImage = vi.fn(async () =>
            new Response(null, {status: 404})
        ) as typeof fetch

        const output = await createMarkdownDocx(
            '![加载失败](https://cdn.example.com/missing.png)',
            {fetchImage}
        )
        const archive = await JSZip.loadAsync(output)
        const documentXml = await archive
            .file('word/document.xml')
            ?.async('string')
        const relationshipsXml = await archive
            .file('word/_rels/document.xml.rels')
            ?.async('string')
        const mediaFiles = Object.keys(archive.files).filter(
            (path) =>
                path.startsWith('word/media/') && !archive.files[path].dir
        )

        expect(mediaFiles).toHaveLength(0)
        expect(documentXml).toContain('[图片：加载失败]')
        expect(relationshipsXml).toContain(
            'https://cdn.example.com/missing.png'
        )
    })

    it('follows public redirects without adding a referrer', async () => {
        const fetchImage = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(null, {
                    headers: {
                        location: 'https://images.example.com/final.png',
                    },
                    status: 302,
                })
            )
            .mockResolvedValueOnce(new Response(PNG_BYTES)) as typeof fetch

        const output = await createMarkdownDocx(
            '![重定向图片](https://cdn.example.com/image.png)',
            {fetchImage}
        )
        const archive = await JSZip.loadAsync(output)
        const mediaFiles = Object.keys(archive.files).filter(
            (path) =>
                path.startsWith('word/media/') && !archive.files[path].dir
        )

        expect(fetchImage).toHaveBeenCalledTimes(2)
        expect(fetchImage).toHaveBeenNthCalledWith(
            2,
            'https://images.example.com/final.png',
            expect.objectContaining({
                maxRedirections: 0,
                referrerPolicy: 'no-referrer',
            })
        )
        expect(mediaFiles).toHaveLength(1)
    })

    it('does not request private network image URLs', async () => {
        const fetchImage = vi.fn() as typeof fetch

        await createMarkdownDocx(
            '![内网图片](http://127.0.0.1/private.png)',
            {fetchImage}
        )

        expect(fetchImage).not.toHaveBeenCalled()
    })
})
