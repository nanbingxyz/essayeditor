import type {MouseEvent} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {tauriDesktopAdapter} from '@/shared/platform/desktop'

interface MarkdownPreviewProps {
    className?: string
    content: string
}

export default function MarkdownPreview({
    className = '',
    content,
}: MarkdownPreviewProps) {
    const openLink = (event: MouseEvent<HTMLAnchorElement>, href?: string) => {
        if (!href) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        void tauriDesktopAdapter.openExternal(href)
    }

    return (
        <div className={`note-markdown-preview ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={{
                    a: ({href, children, ...props}) => (
                        <a
                            {...props}
                            href={href}
                            onClick={(event) => openLink(event, href)}
                        >
                            {children}
                        </a>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}
