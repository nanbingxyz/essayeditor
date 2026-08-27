import {ShadowInnerIcon} from '@radix-ui/react-icons'
import {Send20Filled} from '@fluentui/react-icons'
import {forwardRef} from 'react'
import {Button} from '@/shared/ui'
import {getRelativeTime} from '@/shared/lib/timing'

import MarkdownEditor, {type MarkdownEditorHandle} from './markdown-editor'

interface EditorPageProps {
    active: boolean
    actionLabel: string
    backupTimestamp: number
    disabled: boolean
    editorKey: string
    initialContent: string
    loading: boolean
    onContentChange: (content: string) => void
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
            disabled,
            editorKey,
            initialContent,
            loading,
            onContentChange,
            onPublish,
            publishReady,
            ready,
        },
        ref
    ) => (
        <div className={`editor-page ${active ? '' : 'is-page-hidden'}`}>
            {ready ? (
                <MarkdownEditor
                    key={editorKey}
                    ref={ref}
                    initialValue={initialContent}
                    disabled={disabled}
                    onChange={onContentChange}
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
            </footer>
        </div>
    )
)

EditorPage.displayName = 'EditorPage'

export default EditorPage
