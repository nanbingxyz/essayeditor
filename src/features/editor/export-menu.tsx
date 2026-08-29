import {ArrowCircleDownRight20Regular, Markdown20Regular} from '@fluentui/react-icons'
import {useEffect, useRef, useState} from 'react'

interface ExportMenuProps {
    disabled: boolean
    onExportMarkdown: () => void | Promise<void>
}

export default function ExportMenu({
    disabled,
    onExportMarkdown,
}: ExportMenuProps) {
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) {
            return
        }

        const closeOutside = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false)
            }
        }

        document.addEventListener('pointerdown', closeOutside)
        document.addEventListener('keydown', closeOnEscape)
        return () => {
            document.removeEventListener('pointerdown', closeOutside)
            document.removeEventListener('keydown', closeOnEscape)
        }
    }, [open])

    const exportMarkdown = () => {
        setOpen(false)
        void onExportMarkdown()
    }

    return (
        <div ref={rootRef} className="export-menu">
            <button
                type="button"
                className="export-menu-trigger"
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label="导出"
                title="导出"
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
            >
                <ArrowCircleDownRight20Regular aria-hidden="true" />
            </button>

            {open && (
                <div
                    className="export-menu-content"
                    role="menu"
                    aria-label="导出"
                >
                    <button
                        type="button"
                        className="export-menu-item flex justify-start gap-2"
                        role="menuitem"
                        onClick={exportMarkdown}
                    >
                        <Markdown20Regular aria-hidden="true" />
                        导出为 Markdown 文件
                    </button>
                </div>
            )}
        </div>
    )
}
