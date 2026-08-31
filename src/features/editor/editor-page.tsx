import { ShadowInnerIcon } from '@radix-ui/react-icons'
import { Send20Filled, EyeOff20Filled, EyeOff20Regular } from '@fluentui/react-icons'
import { forwardRef } from 'react'
import { Button, Toggle } from '@/shared/ui'
import { getRelativeTime } from '@/shared/lib/timing'

import MarkdownEditor, {
    type MarkdownEditorHandle,
    type MarkdownEditorReadyMetrics,
} from './markdown-editor'
import { cn } from '@/shared/lib'

interface EditorPageProps {
    active: boolean
    actionLabel: string
    backupTimestamp: number
    content: string
    disabled: boolean
    documentKey: string
    isPrivate: boolean
    loading: boolean
    onContentChange: (content: string) => void
    onEditorReady?: (
        documentKey: string,
        metrics?: MarkdownEditorReadyMetrics
    ) => void
    onPrivateChange: (isPrivate: boolean) => void
    onPublish: () => void
    publishReady: boolean
    ready: boolean
}

const EditorPage = forwardRef<MarkdownEditorHandle, EditorPageProps>(
    (
        {
            active,
            actionLabel,
            backupTimestamp,
            content,
            disabled,
            documentKey,
            isPrivate,
            loading,
            onContentChange,
            onEditorReady,
            onPrivateChange,
            onPublish,
            publishReady,
            ready,
        },
        ref
    ) => (
        <div className={`editor-page ${active ? '' : 'is-page-hidden'}`}>
            {ready ? (
                <MarkdownEditor
                    ref={ref}
                    documentKey={documentKey}
                    value={content}
                    disabled={disabled}
                    onChange={onContentChange}
                    onReady={onEditorReady}
                />
            ) : (
                <div
                    className="editor-loading-skeleton"
                    aria-label="正在恢复本地草稿"
                />
            )}
            <footer className="editor-footer">
                <div>
                    {backupTimestamp !== 0 && (
                        <span className="backup-status">
                            last saved{' '}
                            {getRelativeTime(new Date(backupTimestamp))}
                        </span>
                    )}
                </div>
                <div className="editor-publish-actions">
                    <Toggle
                        type="button"
                        size="sm"
                        className={cn("text-xs rounded-full", isPrivate?'text-primary-foreground':'text-muted-foreground  opacity-45')}
                        variant="default"
                        pressed={isPrivate}
                        aria-label="仅自己可见"
                        disabled={disabled || !ready}
                        onPressedChange={onPrivateChange}
                    >
                        {isPrivate ? (
                            <EyeOff20Filled />
                        ) : (
                            <EyeOff20Regular />
                        )}
                        仅自己可见
                    </Toggle>
                    <Button
                        type="button"
                        size="icon"
                        className="publish-button rounded-full"
                        aria-label={actionLabel}
                        title={actionLabel === '更新文章' ? '更新' : '发布'}
                        disabled={disabled || !publishReady}
                        onClick={onPublish}
                    >
                        {loading ? (
                            <ShadowInnerIcon className="animate-spin" />
                        ) : (
                            <Send20Filled className="ml-0.5 -rotate-[18deg]" />
                        )}
                    </Button>
                </div>
            </footer>
        </div>
    )
)

EditorPage.displayName = 'EditorPage'

export default EditorPage
