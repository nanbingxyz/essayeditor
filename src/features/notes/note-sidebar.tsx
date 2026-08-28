import {
    AddRegular,
    ArrowClockwiseRegular,
    Delete20Regular,
    Edit20Regular,
    Send20Filled,
} from '@fluentui/react-icons'
import {ShadowInnerIcon} from '@radix-ui/react-icons'
import {useEffect, useMemo, useRef, useState} from 'react'

import {
    MarkdownEditor,
    type MarkdownEditorHandle,
} from '@/features/editor'
import {Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, useToast} from '@/shared/ui'

import MarkdownPreview from './markdown-preview'
import type {Note, NoteFolder} from './note-client'
import './notes.css'

interface NoteSidebarProps {
    enabled: boolean
    error: string | null
    folders: NoteFolder[]
    hasMore: boolean
    loading: boolean
    loadingMore: boolean
    moreError: string | null
    mutating: boolean
    notes: Note[]
    onCreate: (content: string, folderId: string | null) => Promise<boolean>
    onLoadMore: () => void
    onOpenSettings: () => void
    onRefresh: () => void
    onRemove: (noteId: string) => Promise<boolean>
    onRetry: () => void
    onUpdate: (
        noteId: string,
        content: string,
        folderId: string | null
    ) => Promise<boolean>
    refreshing: boolean
}

function formatTimestamp(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return value
    }
    return new Intl.DateTimeFormat('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date)
}

function NoteSkeleton() {
    return (
        <div className="note-list-skeleton" aria-label="正在加载笔记">
            {Array.from({length: 4}, (_, index) => (
                <div className="note-card-skeleton" key={index}>
                    <span />
                    <span />
                    <span />
                </div>
            ))}
        </div>
    )
}

function CommentList({note, full = false}: {note: Note; full?: boolean}) {
    if (note.comments.length === 0) {
        return null
    }
    return (
        <div className={`note-comments ${full ? 'is-full' : ''}`}>
            {note.comments.map((comment) => (
                <div className="note-comment" key={comment.id}>
                    <span>{comment.content}</span>
                    <time dateTime={comment.createdAt}>
                        {formatTimestamp(comment.createdAt)}
                    </time>
                </div>
            ))}
        </div>
    )
}

interface NoteEditorDialogProps {
    folders: NoteFolder[]
    mode: 'create' | 'edit'
    mutating: boolean
    note: Note | null
    onClose: () => void
    onSubmit: (content: string, folderId: string | null) => Promise<boolean>
    open: boolean
}

function NoteEditorDialog({
    folders,
    mode,
    mutating,
    note,
    onClose,
    onSubmit,
    open,
}: NoteEditorDialogProps) {
    const initialContent = mode === 'edit' ? note?.content ?? '' : ''
    const initialFolderId = mode === 'edit' ? note?.folder?.id ?? '' : ''
    const [content, setContent] = useState(initialContent)
    const [folderId, setFolderId] = useState(initialFolderId)
    const [discardOpen, setDiscardOpen] = useState(false)
    const editorRef = useRef<MarkdownEditorHandle>(null)
    const selectableFolders = useMemo(
        () =>
            note?.folder &&
            !folders.some((folder) => folder.id === note.folder?.id)
                ? [note.folder, ...folders]
                : folders,
        [folders, note?.folder]
    )
    const dirty =
        content !== initialContent || folderId !== initialFolderId

    useEffect(() => {
        if (!open) {
            return
        }
        setContent(initialContent)
        setFolderId(initialFolderId)
        setDiscardOpen(false)
        requestAnimationFrame(() => editorRef.current?.focus())
    }, [initialContent, initialFolderId, open])

    const requestClose = () => {
        if (mutating) {
            return
        }
        if (dirty) {
            setDiscardOpen(true)
            return
        }
        onClose()
    }

    const submit = async () => {
        const value = editorRef.current?.getValue() ?? content
        if (!value.trim() || mutating) {
            return
        }
        if (await onSubmit(value, folderId || null)) {
            onClose()
        }
    }

    return (
        <>
            <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
                <DialogContent className="note-editor-dialog">
                    <DialogHeader className="sr-only">
                        <DialogTitle>
                            {mode === 'create' ? '添加笔记' : '编辑笔记'}
                        </DialogTitle>
                        <DialogDescription>
                            使用 Markdown 编辑笔记内容
                        </DialogDescription>
                    </DialogHeader>
                    <MarkdownEditor
                        key={`${mode}:${note?.id ?? 'new'}:${open}`}
                        ref={editorRef}
                        ariaLabel="笔记内容"
                        initialValue={initialContent}
                        disabled={mutating}
                        onChange={setContent}
                        placeholder="记录点什么..."
                    />
                    <footer className="note-editor-footer">
                        <label className="note-folder-select-label">
                            <span className="sr-only">笔记文件夹</span>
                            <select
                                aria-label="笔记文件夹"
                                value={folderId}
                                disabled={mutating}
                                onChange={(event) =>
                                    setFolderId(event.target.value)
                                }
                            >
                                <option value="">不分类</option>
                                {selectableFolders.map((folder) => (
                                    <option value={folder.id} key={folder.id}>
                                        {folder.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <Button
                            type="button"
                            size="icon"
                            className="note-send-button rounded-full"
                            aria-label={mode === 'create' ? '添加笔记' : '更新笔记'}
                            title={mode === 'create' ? '添加' : '更新'}
                            disabled={!content.trim() || mutating}
                            onClick={() => void submit()}
                        >
                            {mutating ? (
                                <ShadowInnerIcon className="animate-spin" />
                            ) : (
                                <Send20Filled className="ml-0.5 -rotate-[18deg]" />
                            )}
                        </Button>
                    </footer>
                </DialogContent>
            </Dialog>
            <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>放弃未保存的修改？</DialogTitle>
                        <DialogDescription>
                            关闭后，本次输入的笔记内容和文件夹选择将不会保留。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDiscardOpen(false)}
                        >
                            继续编辑
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                                setDiscardOpen(false)
                                onClose()
                            }}
                        >
                            放弃修改
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

export default function NoteSidebar({
    enabled,
    error,
    folders,
    hasMore,
    loading,
    loadingMore,
    moreError,
    mutating,
    notes,
    onCreate,
    onLoadMore,
    onOpenSettings,
    onRefresh,
    onRemove,
    onRetry,
    onUpdate,
    refreshing,
}: NoteSidebarProps) {
    const {toast} = useToast()
    const listRef = useRef<HTMLDivElement>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
    const [editorOpen, setEditorOpen] = useState(false)
    const [viewingId, setViewingId] = useState<string | null>(null)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const viewingNote = useMemo(
        () => notes.find((note) => note.id === viewingId) ?? null,
        [notes, viewingId]
    )

    useEffect(() => {
        const root = listRef.current
        const sentinel = sentinelRef.current
        if (!root || !sentinel || !hasMore || loading || loadingMore) {
            return
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    onLoadMore()
                }
            },
            {root, rootMargin: '0px 0px 160px'}
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasMore, loading, loadingMore, onLoadMore])

    useEffect(() => {
        if (viewingId && !viewingNote && !mutating) {
            setViewingId(null)
        }
    }, [mutating, viewingId, viewingNote])

    const beginCreate = () => {
        setEditorMode('create')
        setEditorOpen(true)
    }

    const beginEdit = () => {
        if (!viewingNote) {
            return
        }
        setEditorMode('edit')
        setEditorOpen(true)
    }

    const submitEditor = async (
        content: string,
        folderId: string | null
    ) => {
        const succeeded =
            editorMode === 'create'
                ? await onCreate(content, folderId)
                : viewingNote
                    ? await onUpdate(viewingNote.id, content, folderId)
                    : false
        if (succeeded) {
            toast({title: editorMode === 'create' ? '笔记已添加' : '笔记已更新'})
        }
        return succeeded
    }

    const confirmDelete = async () => {
        if (!viewingNote || !(await onRemove(viewingNote.id))) {
            return
        }
        setDeleteOpen(false)
        setViewingId(null)
        toast({title: '笔记已删除'})
    }

    return (
        <div className="note-sidebar">
            <header
                data-tauri-drag-region
                className="titlebar-surface note-sidebar-header"
            >
                <span data-tauri-drag-region className="note-sidebar-title">
                    笔记
                </span>
                <div className="note-sidebar-actions">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="刷新笔记"
                        title="刷新"
                        disabled={!enabled || refreshing || loadingMore}
                        onClick={onRefresh}
                    >
                        <ArrowClockwiseRegular
                            className={refreshing ? 'is-spinning' : ''}
                        />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="添加笔记"
                        title="添加笔记"
                        disabled={!enabled || mutating}
                        onClick={beginCreate}
                    >
                        <AddRegular />
                    </Button>
                </div>
            </header>

            {!enabled ? (
                <div className="note-list-message">
                    <span>设置 API Key 后即可管理个人笔记</span>
                    <Button type="button" variant="outline" onClick={onOpenSettings}>
                        打开设置
                    </Button>
                </div>
            ) : (
                <div ref={listRef} className="note-list-region">
                    {loading && notes.length === 0 ? (
                        <NoteSkeleton />
                    ) : error && notes.length === 0 ? (
                        <div className="note-list-message">
                            <span>{error}</span>
                            <button type="button" onClick={onRetry}>
                                重试
                            </button>
                        </div>
                    ) : notes.length === 0 ? (
                        <div className="note-list-message">
                            <span>还没有笔记</span>
                            <button type="button" onClick={beginCreate}>
                                添加第一条笔记
                            </button>
                        </div>
                    ) : (
                        <div className="note-list">
                            {notes.map((note) => (
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className="note-card"
                                    key={note.id}
                                    onClick={() => setViewingId(note.id)}
                                    onKeyDown={(event) => {
                                        if (
                                            event.target === event.currentTarget &&
                                            (event.key === 'Enter' ||
                                                event.key === ' ')
                                        ) {
                                            event.preventDefault()
                                            setViewingId(note.id)
                                        }
                                    }}
                                >
                                    <div className="note-card-meta">
                                        <span>{note.folder?.name ?? '未分类'}</span>
                                        <time dateTime={note.createdAt}>
                                            {formatTimestamp(note.createdAt)}
                                        </time>
                                    </div>
                                    <div className="note-card-content">
                                        <MarkdownPreview content={note.content} />
                                    </div>
                                    <CommentList note={note} />
                                </div>
                            ))}
                            {moreError && (
                                <div className="note-list-message is-compact">
                                    <span>{moreError}</span>
                                    <button type="button" onClick={onRetry}>
                                        重试
                                    </button>
                                </div>
                            )}
                            {loadingMore && (
                                <div className="note-list-loading-more">
                                    <ShadowInnerIcon className="animate-spin" />
                                    正在加载
                                </div>
                            )}
                            <div ref={sentinelRef} className="note-list-sentinel" />
                        </div>
                    )}
                </div>
            )}

            <Dialog
                open={Boolean(viewingNote)}
                onOpenChange={(next) => !next && !mutating && setViewingId(null)}
            >
                <DialogContent className="note-view-dialog">
                    <DialogHeader>
                        <div className="note-view-heading">
                            <div>
                                <DialogTitle>查看笔记</DialogTitle>
                                {viewingNote && (
                                    <DialogDescription>
                                        {viewingNote.folder?.name ?? '未分类'} ·{' '}
                                        {formatTimestamp(viewingNote.createdAt)}
                                    </DialogDescription>
                                )}
                            </div>
                            <div className="note-view-actions">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="编辑笔记"
                                    title="编辑"
                                    disabled={mutating}
                                    onClick={beginEdit}
                                >
                                    <Edit20Regular />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="note-delete-button"
                                    aria-label="删除笔记"
                                    title="删除"
                                    disabled={mutating}
                                    onClick={() => setDeleteOpen(true)}
                                >
                                    <Delete20Regular />
                                </Button>
                            </div>
                        </div>
                    </DialogHeader>
                    {viewingNote && (
                        <div className="note-view-body">
                            <MarkdownPreview content={viewingNote.content} />
                            <CommentList note={viewingNote} full />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <NoteEditorDialog
                folders={folders}
                mode={editorMode}
                mutating={mutating}
                note={editorMode === 'edit' ? viewingNote : null}
                onClose={() => setEditorOpen(false)}
                onSubmit={submitEditor}
                open={editorOpen}
            />

            <Dialog open={deleteOpen} onOpenChange={mutating ? undefined : setDeleteOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>删除这条笔记？</DialogTitle>
                        <DialogDescription>
                            此操作不可撤销，删除后无法恢复。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={mutating}
                            onClick={() => setDeleteOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={mutating}
                            onClick={() => void confirmDelete()}
                        >
                            {mutating && (
                                <ShadowInnerIcon className="mr-2 animate-spin" />
                            )}
                            确认删除
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
