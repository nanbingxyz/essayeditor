import {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    FileChild,
    HeadingLevel,
    ImageRun,
    type IParagraphOptions,
    LevelFormat,
    Packer,
    Paragraph,
    type ParagraphChild,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
} from 'docx'
import type {
    BlockContent,
    DefinitionContent,
    List,
    ListItem,
    Paragraph as MarkdownParagraph,
    PhrasingContent,
    Root,
    RootContent,
    Table as MarkdownTable,
} from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import {unified} from 'unified'

import {
    desktopHttpClient,
    type HttpClient,
} from '@/shared/platform/http'

const NUMBERING_REFERENCE = 'essay-numbering'
const MAX_LIST_LEVEL = 8
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_HEIGHT = 900
const MAX_IMAGE_WIDTH = 640
const IMAGE_DOWNLOAD_TIMEOUT = 10_000
const SVG_FALLBACK_PNG = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0,
    1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68,
    65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153,
    61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
])

type ImageFormat = 'bmp' | 'gif' | 'jpg' | 'png' | 'svg'
type DownloadedImageFormat = ImageFormat | 'webp'

interface RasterizedImage {
    data: Uint8Array
    height: number
    width: number
}

type ImageRasterizer = (
    data: Uint8Array,
    mimeType: string,
    targetSize?: {height: number; width: number}
) => Promise<RasterizedImage | null>

interface EmbeddedImage {
    data: Uint8Array
    fallback?: Uint8Array
    format: ImageFormat
    height: number
    width: number
}

interface MarkdownDocxOptions {
    fetchImage?: HttpClient
    rasterizeImage?: ImageRasterizer
}

interface InlineStyle {
    bold?: boolean
    italics?: boolean
    strike?: boolean
}

type DefinitionMap = Map<string, {title?: string | null; url: string}>
type ImageMap = Map<string, EmbeddedImage>

function isPublicImageUrl(value: string) {
    try {
        const url = new URL(value)
        if (
            (url.protocol !== 'http:' && url.protocol !== 'https:') ||
            url.username ||
            url.password ||
            url.port
        ) {
            return false
        }
        const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
        if (
            !hostname.includes('.') ||
            hostname.includes(':') ||
            /(?:^|\.)(?:home|internal|invalid|lan|local|localhost|test)$/.test(
                hostname
            )
        ) {
            return false
        }
        const ipv4 = hostname.split('.').map(Number)
        if (
            ipv4.length === 4 &&
            ipv4.every(
                (part) =>
                    Number.isInteger(part) && part >= 0 && part <= 255
            )
        ) {
            const [first, second, third] = ipv4
            return !(
                first === 0 ||
                first === 10 ||
                first === 127 ||
                first >= 224 ||
                (first === 100 && second >= 64 && second <= 127) ||
                (first === 169 && second === 254) ||
                (first === 172 && second >= 16 && second <= 31) ||
                (first === 192 && second === 168) ||
                (first === 192 && second === 0 && third === 0) ||
                (first === 192 && second === 0 && third === 2) ||
                (first === 198 && (second === 18 || second === 19)) ||
                (first === 198 && second === 51 && third === 100) ||
                (first === 203 && second === 0 && third === 113)
            )
        }
        return true
    } catch {
        return false
    }
}

function getRasterDimensions(data: Uint8Array, format: ImageFormat) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    if (format === 'png' && data.byteLength >= 24) {
        return {height: view.getUint32(20), width: view.getUint32(16)}
    }
    if (format === 'gif' && data.byteLength >= 10) {
        return {
            height: view.getUint16(8, true),
            width: view.getUint16(6, true),
        }
    }
    if (format === 'bmp' && data.byteLength >= 26) {
        return {
            height: Math.abs(view.getInt32(22, true)),
            width: Math.abs(view.getInt32(18, true)),
        }
    }
    if (format === 'jpg') {
        const startOfFrameMarkers = new Set([
            0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb,
            0xcd, 0xce, 0xcf,
        ])
        let offset = 2
        while (offset + 8 < data.byteLength) {
            if (data[offset] !== 0xff) {
                offset += 1
                continue
            }
            const marker = data[offset + 1]
            offset += 2
            if (marker === 0xd8 || marker === 0xd9) {
                continue
            }
            if (marker === 0xda || offset + 2 > data.byteLength) {
                break
            }
            const length = view.getUint16(offset)
            if (
                startOfFrameMarkers.has(marker) &&
                length >= 7 &&
                offset + length <= data.byteLength
            ) {
                return {
                    height: view.getUint16(offset + 3),
                    width: view.getUint16(offset + 5),
                }
            }
            if (length < 2) {
                break
            }
            offset += length
        }
    }
    return null
}

function parseSvgLength(value?: string) {
    if (!value || value.trim().endsWith('%')) {
        return null
    }
    const length = Number.parseFloat(value)
    return Number.isFinite(length) && length > 0 ? length : null
}

function getSvgDimensions(data: Uint8Array) {
    const source = new TextDecoder().decode(data)
    const svgTag = source.match(/<svg\b[^>]*>/i)?.[0]
    if (!svgTag) {
        return null
    }
    const readAttribute = (name: string) =>
        svgTag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]
    let width = parseSvgLength(readAttribute('width'))
    let height = parseSvgLength(readAttribute('height'))
    const viewBox = readAttribute('viewBox')
        ?.trim()
        .split(/[\s,]+/)
        .map(Number)
    const viewBoxWidth = viewBox?.length === 4 ? viewBox[2] : undefined
    const viewBoxHeight = viewBox?.length === 4 ? viewBox[3] : undefined
    if (
        width &&
        !height &&
        viewBoxWidth &&
        viewBoxWidth > 0 &&
        viewBoxHeight &&
        viewBoxHeight > 0
    ) {
        height = (width * viewBoxHeight) / viewBoxWidth
    } else if (
        height &&
        !width &&
        viewBoxWidth &&
        viewBoxWidth > 0 &&
        viewBoxHeight &&
        viewBoxHeight > 0
    ) {
        width = (height * viewBoxWidth) / viewBoxHeight
    } else if (!width && !height && viewBoxWidth && viewBoxHeight) {
        width = viewBoxWidth
        height = viewBoxHeight
    }
    if (!width || !height) {
        return null
    }
    return {height, width}
}

function detectImageFormat(data: Uint8Array): DownloadedImageFormat | null {
    if (
        data.byteLength >= 8 &&
        data[0] === 137 &&
        data[1] === 80 &&
        data[2] === 78 &&
        data[3] === 71
    ) {
        return 'png'
    }
    if (
        data.byteLength >= 3 &&
        data[0] === 0xff &&
        data[1] === 0xd8 &&
        data[2] === 0xff
    ) {
        return 'jpg'
    }
    const signature = new TextDecoder().decode(data.slice(0, 6))
    if (signature === 'GIF87a' || signature === 'GIF89a') {
        return 'gif'
    }
    if (data.byteLength >= 2 && data[0] === 66 && data[1] === 77) {
        return 'bmp'
    }
    if (
        data.byteLength >= 12 &&
        data[0] === 82 &&
        data[1] === 73 &&
        data[2] === 70 &&
        data[3] === 70 &&
        data[8] === 87 &&
        data[9] === 69 &&
        data[10] === 66 &&
        data[11] === 80
    ) {
        return 'webp'
    }
    const prefix = new TextDecoder().decode(data.slice(0, 1024))
    return /<(?:\?xml[^>]*>\s*)?svg\b/i.test(prefix) ? 'svg' : null
}

function scaleImage(width: number, height: number) {
    const scale = Math.min(
        1,
        MAX_IMAGE_WIDTH / width,
        MAX_IMAGE_HEIGHT / height
    )
    return {
        height: Math.max(1, Math.round(height * scale)),
        width: Math.max(1, Math.round(width * scale)),
    }
}

async function rasterizeBrowserImage(
    data: Uint8Array,
    mimeType: string,
    targetSize?: {height: number; width: number}
): Promise<RasterizedImage | null> {
    if (
        typeof document === 'undefined' ||
        typeof URL.createObjectURL !== 'function'
    ) {
        return null
    }
    const source = new Blob([data], {type: mimeType})
    const sourceUrl = URL.createObjectURL(source)
    try {
        const image = new Image()
        const loaded = new Promise<boolean>((resolve) => {
            const timeout = window.setTimeout(() => resolve(false), 5_000)
            image.addEventListener(
                'load',
                () => {
                    window.clearTimeout(timeout)
                    resolve(true)
                },
                {once: true}
            )
            image.addEventListener(
                'error',
                () => {
                    window.clearTimeout(timeout)
                    resolve(false)
                },
                {once: true}
            )
        })
        image.src = sourceUrl
        if (!(await loaded)) {
            return null
        }
        const dimensions = targetSize ??
            scaleImage(image.naturalWidth, image.naturalHeight)
        if (dimensions.width <= 0 || dimensions.height <= 0) {
            return null
        }
        const canvas = document.createElement('canvas')
        canvas.width = dimensions.width
        canvas.height = dimensions.height
        const context = canvas.getContext('2d')
        if (!context) {
            return null
        }
        context.drawImage(
            image,
            0,
            0,
            dimensions.width,
            dimensions.height
        )
        const output = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/png')
        )
        return output
            ? {
                  data: new Uint8Array(await output.arrayBuffer()),
                  ...dimensions,
              }
            : null
    } catch {
        return null
    } finally {
        URL.revokeObjectURL(sourceUrl)
    }
}

async function fetchImageWithoutReferrer(
    initialUrl: string,
    fetchImage: HttpClient,
    signal: AbortSignal
) {
    let url = initialUrl
    for (let redirects = 0; redirects <= 5; redirects += 1) {
        if (!isPublicImageUrl(url)) {
            return null
        }
        const response = await fetchImage(url, {
            connectTimeout: IMAGE_DOWNLOAD_TIMEOUT,
            credentials: 'omit',
            maxRedirections: 0,
            referrerPolicy: 'no-referrer',
            signal,
        })
        if (response.status < 300 || response.status >= 400) {
            return response
        }
        const location = response.headers.get('location')
        if (!location || redirects === 5) {
            return null
        }
        url = new URL(location, url).toString()
    }
    return null
}

async function downloadImage(
    url: string,
    fetchImage: HttpClient,
    rasterizeImage: ImageRasterizer
) {
    if (!isPublicImageUrl(url)) {
        return null
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(
        () => controller.abort(),
        IMAGE_DOWNLOAD_TIMEOUT
    )
    try {
        const response = await fetchImageWithoutReferrer(
            url,
            fetchImage,
            controller.signal
        )
        if (!response?.ok) {
            return null
        }
        const declaredSize = Number(response.headers.get('content-length'))
        if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) {
            return null
        }
        const data = new Uint8Array(await response.arrayBuffer())
        if (data.byteLength === 0 || data.byteLength > MAX_IMAGE_BYTES) {
            return null
        }
        const format = detectImageFormat(data)
        if (!format) {
            return null
        }
        if (format === 'webp') {
            const converted = await rasterizeImage(data, 'image/webp')
            return converted
                ? {...converted, format: 'png' as const}
                : null
        }
        const dimensions =
            format === 'svg'
                ? getSvgDimensions(data)
                : getRasterDimensions(data, format)
        if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
            return null
        }
        const scaled = scaleImage(dimensions.width, dimensions.height)
        const fallback =
            format === 'svg'
                ? await rasterizeImage(data, 'image/svg+xml', scaled)
                : null
        return {
            data,
            fallback: fallback?.data,
            format,
            ...scaled,
        }
    } catch {
        return null
    } finally {
        window.clearTimeout(timeout)
    }
}

function collectImageUrls(root: Root, definitions: DefinitionMap) {
    const urls = new Set<string>()
    const visit = (node: unknown) => {
        if (!node || typeof node !== 'object') {
            return
        }
        if ('type' in node && node.type === 'image' && 'url' in node) {
            if (typeof node.url === 'string') {
                urls.add(node.url)
            }
        }
        if (
            'type' in node &&
            node.type === 'imageReference' &&
            'identifier' in node &&
            typeof node.identifier === 'string'
        ) {
            const url = definitions.get(node.identifier)?.url
            if (url) {
                urls.add(url)
            }
        }
        const children = 'children' in node ? node.children : undefined
        if (Array.isArray(children)) {
            children.forEach(visit)
        }
    }
    visit(root)
    return [...urls]
}

async function downloadImages(
    urls: readonly string[],
    fetchImage: HttpClient,
    rasterizeImage: ImageRasterizer
) {
    const images: ImageMap = new Map()
    let nextIndex = 0
    const workers = Array.from(
        {length: Math.min(4, urls.length)},
        async () => {
            while (nextIndex < urls.length) {
                const url = urls[nextIndex]
                nextIndex += 1
                const image = await downloadImage(
                    url,
                    fetchImage,
                    rasterizeImage
                )
                if (image) {
                    images.set(url, image)
                }
            }
        }
    )
    await Promise.all(workers)
    return images
}

function createImageRun(image: EmbeddedImage, alt?: string | null) {
    const options = {
        altText: {
            description: alt || '文章图片',
            name: alt || '文章图片',
            title: alt || undefined,
        },
        data: image.data,
        transformation: {height: image.height, width: image.width},
    }
    return image.format === 'svg'
        ? new ImageRun({
              ...options,
              fallback: {
                  data: image.fallback ?? SVG_FALLBACK_PNG,
                  type: 'png',
              },
              type: 'svg',
          })
        : new ImageRun({...options, type: image.format})
}

function getText(node: unknown): string {
    if (!node || typeof node !== 'object') {
        return ''
    }
    const value = 'value' in node ? node.value : undefined
    if (typeof value === 'string') {
        return value
    }
    const children = 'children' in node ? node.children : undefined
    return Array.isArray(children) ? children.map(getText).join('') : ''
}

function createTextRun(text: string, style: InlineStyle = {}) {
    return new TextRun({
        text,
        bold: style.bold,
        italics: style.italics,
        strike: style.strike,
    })
}

function buildInlineChildren(
    nodes: readonly PhrasingContent[],
    definitions: DefinitionMap,
    images: ImageMap,
    style: InlineStyle = {}
): ParagraphChild[] {
    return nodes.flatMap((node): ParagraphChild[] => {
        switch (node.type) {
            case 'text':
                return [createTextRun(node.value, style)]
            case 'strong':
                return buildInlineChildren(node.children, definitions, images, {
                    ...style,
                    bold: true,
                })
            case 'emphasis':
                return buildInlineChildren(node.children, definitions, images, {
                    ...style,
                    italics: true,
                })
            case 'delete':
                return buildInlineChildren(node.children, definitions, images, {
                    ...style,
                    strike: true,
                })
            case 'inlineCode':
                return [
                    new TextRun({
                        text: node.value,
                        bold: style.bold,
                        italics: style.italics,
                        strike: style.strike,
                        font: 'Consolas',
                        shading: {
                            fill: 'F2F2F2',
                            type: ShadingType.CLEAR,
                        },
                    }),
                ]
            case 'break':
                return [new TextRun({break: 1})]
            case 'link': {
                const children = buildInlineChildren(
                    node.children,
                    definitions,
                    images,
                    style
                )
                return [
                    new ExternalHyperlink({
                        children:
                            children.length > 0
                                ? children
                                : [createTextRun(node.url, style)],
                        link: node.url,
                    }),
                ]
            }
            case 'linkReference': {
                const definition = definitions.get(node.identifier)
                if (!definition) {
                    return [createTextRun(getText(node), style)]
                }
                return [
                    new ExternalHyperlink({
                        children: buildInlineChildren(
                            node.children,
                            definitions,
                            images,
                            style
                        ),
                        link: definition.url,
                    }),
                ]
            }
            case 'image': {
                const image = images.get(node.url)
                if (image) {
                    return [createImageRun(image, node.alt)]
                }
                return [
                    createTextRun(
                        node.alt ? `[图片：${node.alt}] ` : '[图片] ',
                        style
                    ),
                    new ExternalHyperlink({
                        children: [createTextRun(node.url, style)],
                        link: node.url,
                    }),
                ]
            }
            case 'imageReference': {
                const definition = definitions.get(node.identifier)
                const label = node.alt ? `[图片：${node.alt}]` : '[图片]'
                if (!definition) {
                    return [createTextRun(label, style)]
                }
                const image = images.get(definition.url)
                if (image) {
                    return [createImageRun(image, node.alt)]
                }
                return [
                    createTextRun(`${label} `, style),
                    new ExternalHyperlink({
                        children: [createTextRun(definition.url, style)],
                        link: definition.url,
                    }),
                ]
            }
            case 'footnoteReference':
                return [createTextRun(`[${node.identifier}]`, style)]
            case 'html':
                return []
            default:
                return [createTextRun(getText(node), style)]
        }
    })
}

function createParagraph(
    node: MarkdownParagraph,
    definitions: DefinitionMap,
    images: ImageMap,
    options: Omit<IParagraphOptions, 'children' | 'text'> = {}
) {
    return new Paragraph({
        children: buildInlineChildren(node.children, definitions, images),
        spacing: {after: 160, line: 360},
        ...options,
    })
}

function createCodeParagraph(value: string) {
    const lines = value.split('\n')
    return new Paragraph({
        children: lines.map(
            (line, index) =>
                new TextRun({
                    text: line || ' ',
                    break: index === 0 ? undefined : 1,
                    font: 'Consolas',
                    size: 19,
                })
        ),
        indent: {left: 240, right: 240},
        shading: {fill: 'F4F4F4', type: ShadingType.CLEAR},
        spacing: {after: 200, before: 80, line: 300},
    })
}

function createTable(
    node: MarkdownTable,
    definitions: DefinitionMap,
    images: ImageMap
) {
    return new Table({
        rows: node.children.map(
            (row, rowIndex) =>
                new TableRow({
                    tableHeader: rowIndex === 0,
                    children: row.children.map(
                        (cell) =>
                            new TableCell({
                                children: [
                                    new Paragraph({
                                        children: buildInlineChildren(
                                            cell.children,
                                            definitions,
                                            images,
                                            {bold: rowIndex === 0}
                                        ),
                                        spacing: {after: 80, before: 80},
                                    }),
                                ],
                                margins: {
                                    bottom: 80,
                                    left: 100,
                                    right: 100,
                                    top: 80,
                                },
                                shading:
                                    rowIndex === 0
                                        ? {
                                              fill: 'EEEEEE',
                                              type: ShadingType.CLEAR,
                                          }
                                        : undefined,
                            })
                    ),
                })
        ),
        width: {size: 100, type: WidthType.PERCENTAGE},
    })
}

function convertListItem(
    item: ListItem,
    ordered: boolean,
    level: number,
    definitions: DefinitionMap,
    images: ImageMap
): FileChild[] {
    const children: FileChild[] = []
    let hasListMarker = false

    item.children.forEach((node) => {
        if (node.type === 'list') {
            children.push(...convertList(node, level + 1, definitions, images))
            return
        }

        if (node.type === 'paragraph') {
            const prefix =
                !hasListMarker && typeof item.checked === 'boolean'
                    ? item.checked
                        ? '☒ '
                        : '☐ '
                    : ''
            const paragraphNode: MarkdownParagraph = prefix
                ? {
                      ...node,
                      children: [{type: 'text', value: prefix}, ...node.children],
                  }
                : node
            children.push(
                createParagraph(paragraphNode, definitions, images, {
                    ...(hasListMarker
                        ? {indent: {left: 720 + level * 360}}
                        : ordered
                          ? {
                                numbering: {
                                    level: Math.min(level, MAX_LIST_LEVEL),
                                    reference: NUMBERING_REFERENCE,
                                },
                            }
                          : {
                                bullet: {
                                    level: Math.min(level, MAX_LIST_LEVEL),
                                },
                            }),
                })
            )
            hasListMarker = true
            return
        }

        children.push(...convertBlocks([node], definitions, images))
    })

    return children
}

function convertList(
    node: List,
    level: number,
    definitions: DefinitionMap,
    images: ImageMap
) {
    return node.children.flatMap((item) =>
        convertListItem(item, Boolean(node.ordered), level, definitions, images)
    )
}

function convertBlockquote(
    nodes: readonly (BlockContent | DefinitionContent)[],
    definitions: DefinitionMap,
    images: ImageMap
) {
    return nodes.flatMap((node): FileChild[] => {
        if (node.type === 'paragraph') {
            return [
                createParagraph(node, definitions, images, {
                    border: {
                        left: {
                            color: 'B7B7B7',
                            size: 12,
                            space: 10,
                            style: BorderStyle.SINGLE,
                        },
                    },
                    indent: {left: 360},
                }),
            ]
        }
        return convertBlocks([node], definitions, images)
    })
}

function convertBlocks(
    nodes: readonly RootContent[],
    definitions: DefinitionMap,
    images: ImageMap
): FileChild[] {
    return nodes.flatMap((node): FileChild[] => {
        switch (node.type) {
            case 'paragraph':
                return [createParagraph(node, definitions, images)]
            case 'heading':
                return [
                    new Paragraph({
                        children: buildInlineChildren(
                            node.children,
                            definitions,
                            images
                        ),
                        heading: HeadingLevel[
                            `HEADING_${node.depth}` as keyof typeof HeadingLevel
                        ],
                        spacing: {after: 160, before: 240},
                    }),
                ]
            case 'blockquote':
                return convertBlockquote(node.children, definitions, images)
            case 'list':
                return convertList(node, 0, definitions, images)
            case 'code':
                return [createCodeParagraph(node.value)]
            case 'table':
                return [createTable(node, definitions, images)]
            case 'thematicBreak':
                return [
                    new Paragraph({
                        border: {
                            bottom: {
                                color: 'B7B7B7',
                                size: 6,
                                space: 8,
                                style: BorderStyle.SINGLE,
                            },
                        },
                        spacing: {after: 200, before: 120},
                    }),
                ]
            case 'footnoteDefinition':
                return [
                    new Paragraph({
                        children: [
                            createTextRun(`[${node.identifier}] `, {bold: true}),
                            ...buildInlineChildren(
                                node.children.flatMap((child) =>
                                    child.type === 'paragraph'
                                        ? child.children
                                        : []
                                ),
                                definitions,
                                images
                            ),
                        ],
                    }),
                ]
            case 'html':
            case 'definition':
                return []
            default:
                return []
        }
    })
}

function collectDefinitions(root: Root): DefinitionMap {
    const definitions: DefinitionMap = new Map()
    root.children.forEach((node) => {
        if (node.type === 'definition') {
            definitions.set(node.identifier, {
                title: node.title,
                url: node.url,
            })
        }
    })
    return definitions
}

export async function createMarkdownDocx(
    content: string,
    {
        fetchImage = desktopHttpClient,
        rasterizeImage = rasterizeBrowserImage,
    }: MarkdownDocxOptions = {}
) {
    const root = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .parse(content) as Root
    const definitions = collectDefinitions(root)
    const images = await downloadImages(
        collectImageUrls(root, definitions),
        fetchImage,
        rasterizeImage
    )
    const children = convertBlocks(root.children, definitions, images)
    const titleNode = root.children.find((node) => node.type === 'heading')
    const title = titleNode ? getText(titleNode) : undefined
    const levels = Array.from({length: MAX_LIST_LEVEL + 1}, (_, level) => ({
        alignment: AlignmentType.START,
        format: LevelFormat.DECIMAL,
        level,
        style: {
            paragraph: {
                indent: {hanging: 360, left: 720 + level * 360},
            },
        },
        text: `%${level + 1}.`,
    }))
    const document = new Document({
        creator: 'Essay',
        numbering: {
            config: [{levels, reference: NUMBERING_REFERENCE}],
        },
        sections: [
            {
                children:
                    children.length > 0 ? children : [new Paragraph('')],
                properties: {
                    page: {
                        margin: {
                            bottom: 1134,
                            left: 1134,
                            right: 1134,
                            top: 1134,
                        },
                    },
                },
            },
        ],
        title,
    })
    return Packer.pack(document, 'uint8array')
}
