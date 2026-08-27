import {useEffect, useRef} from 'react'

import type {EssayListEntry} from './use-essay-library-controller'

interface SidebarEssayListProps {
    activeEssayId: string | null
    activeIsNew: boolean
    entries: EssayListEntry[]
    error: string | null
    hasMore: boolean
    loading: boolean
    loadingMore: boolean
    moreError: string | null
    newDraftContent: string
    onLoadMore: () => void
    onRetry: () => void
    onSelectEssay: (essay: EssayListEntry) => void
    onSelectNew: () => void
    selectedDate: string | null
}

export function markdownToSummary(markdown: string) {
    const summary = markdown
        .replace(/!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g, ' ')
        .replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ')
        .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
        .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, ' ')
        .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
        .replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, '$1')
        .replace(/<https?:\/\/[^>]+>/gi, ' ')
        .replace(/https?:\/\/[^\s)>\]]+/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(
            /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm,
            ' '
        )
        .replace(/^\s{0,3}(#{1,6}|>|[-+*]\s|\d+[.)]\s)\s*/gm, '')
        .replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*_~]+/g, '')
        .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1')
        .replace(/[|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    return summary || '无文本内容'
}

function EssaySkeleton({count}: {count: number}) {
    return (
        <div className="essay-list-skeleton" aria-label="正在加载文章">
            {Array.from({length: count}, (_, index) => (
                <div className="essay-list-skeleton-item" key={index}>
                    <span />
                    <span />
                </div>
            ))}
        </div>
    )
}

export default function SidebarEssayList({
    activeEssayId,
    activeIsNew,
    entries,
    error,
    hasMore,
    loading,
    loadingMore,
    moreError,
    newDraftContent,
    onLoadMore,
    onRetry,
    onSelectEssay,
    onSelectNew,
    selectedDate,
}: SidebarEssayListProps) {
    const regionRef = useRef<HTMLDivElement>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        regionRef.current?.scrollTo?.({top: 0})
    }, [selectedDate])

    useEffect(() => {
        const sentinel = sentinelRef.current
        if (
            !sentinel ||
            !hasMore ||
            loadingMore ||
            typeof IntersectionObserver === 'undefined'
        ) {
            return
        }

        const observer = new IntersectionObserver(
            (records) => {
                if (records.some((record) => record.isIntersecting)) {
                    onLoadMore()
                }
            },
            {root: regionRef.current, rootMargin: '120px'}
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasMore, loadingMore, onLoadMore])

    return (
        <div ref={regionRef} className="sidebar-list-region">
            <nav className="essay-index" aria-label="文章索引">
                <button
                    type="button"
                    className={`essay-index-item essay-new-item ${
                        activeIsNew ? 'is-active' : ''
                    }`}
                    aria-current={activeIsNew ? 'page' : undefined}
                    onClick={onSelectNew}
                >
                    <span className="essay-index-label">草稿</span>
                    {newDraftContent.trim() && (
                        <span className="essay-index-preview">
                            {markdownToSummary(newDraftContent)}
                        </span>
                    )}
                </button>

                {loading ? (
                    <EssaySkeleton count={6} />
                ) : error ? (
                    <div className="essay-list-message" role="alert">
                        <span>无法加载文章</span>
                        <button type="button" onClick={onRetry}>
                            重试
                        </button>
                    </div>
                ) : entries.length === 0 ? (
                    <div className="essay-list-message">
                        {selectedDate ? '当天没有文章' : '暂无已发布文章'}
                    </div>
                ) : (
                    entries.map((essay) => {
                        const modified = essay.localContent !== undefined
                        const preview = essay.localContent ?? essay.content
                        const active = essay.id === activeEssayId
                        return (
                            <button
                                type="button"
                                key={essay.id}
                                className={`essay-index-item ${
                                    active ? 'is-active' : ''
                                }`}
                                aria-current={active ? 'page' : undefined}
                                aria-label={`${markdownToSummary(preview)}${
                                    modified ? '，有本地更改' : ''
                                }`}
                                onClick={() => onSelectEssay(essay)}
                            >
                                <span className="essay-index-preview">
                                    {markdownToSummary(preview)}
                                </span>
                                {modified && (
                                    <span
                                        className="essay-modified-marker"
                                        title="有本地更改"
                                        aria-hidden="true"
                                    />
                                )}
                            </button>
                        )
                    })
                )}

                {loadingMore && <EssaySkeleton count={2} />}
                {moreError && (
                    <div className="essay-list-message is-compact" role="alert">
                        <button type="button" onClick={onRetry}>
                            加载失败，点击重试
                        </button>
                    </div>
                )}
                <div ref={sentinelRef} className="essay-list-sentinel" />
            </nav>
        </div>
    )
}
