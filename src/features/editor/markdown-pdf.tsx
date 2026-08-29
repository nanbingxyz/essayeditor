import {flushSync} from 'react-dom'
import {createRoot} from 'react-dom/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const IMAGE_LOAD_TIMEOUT = 5_000

function waitForImage(image: HTMLImageElement) {
    if (image.complete) {
        return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, IMAGE_LOAD_TIMEOUT)
        const finish = () => {
            window.clearTimeout(timeout)
            resolve()
        }

        image.addEventListener('load', finish, {once: true})
        image.addEventListener('error', finish, {once: true})
    })
}

async function waitForDocumentAssets(element: HTMLElement) {
    await document.fonts?.ready
    await Promise.all(
        Array.from(element.querySelectorAll('img')).map(waitForImage)
    )
}

export async function createMarkdownPdf(content: string) {
    const container = document.createElement('article')
    container.className = 'pdf-export-document'
    container.setAttribute('aria-hidden', 'true')
    document.body.append(container)

    const root = createRoot(container)
    try {
        flushSync(() => {
            root.render(
                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                    {content}
                </ReactMarkdown>
            )
        })
        await waitForDocumentAssets(container)

        const {default: html2pdf} = await import('html2pdf.js')
        const options = {
            enableLinks: true,
            html2canvas: {
                backgroundColor: '#ffffff',
                logging: false,
                onclone: (clonedDocument: Document) => {
                    const clonedElements = clonedDocument.querySelectorAll(
                        '.pdf-export-document'
                    ) as NodeListOf<HTMLElement>
                    clonedElements.forEach((clonedElement) => {
                        clonedElement.style.position = 'static'
                        clonedElement.style.visibility = 'visible'
                    })
                },
                scale: 2,
                useCORS: true,
            },
            image: {type: 'jpeg' as const, quality: 0.98},
            jsPDF: {
                format: 'a4',
                orientation: 'portrait' as const,
                unit: 'mm',
            },
            margin: [18, 18, 18, 18] as [number, number, number, number],
            pagebreak: {
                avoid: ['blockquote', 'img', 'pre', 'table'],
                mode: ['css', 'legacy'],
            },
        }
        const output = await html2pdf()
            .set(options)
            .from(container)
            .outputPdf('arraybuffer')

        return new Uint8Array(output as ArrayBuffer)
    } finally {
        flushSync(() => root.unmount())
        container.remove()
    }
}
