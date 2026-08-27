import {
    type CSSProperties,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react'
import {
    AddRegular,
} from '@fluentui/react-icons'

import {
    getLocalDraftDocumentKey,
    type LocalDraft,
} from '@/features/editor'
import { Button } from '@/shared/ui'

import type { EssayListEntry } from './use-essay-library-controller'
interface SidebarEssayListProps {
    activeDocumentId: string | null
    drafts: LocalDraft[]
    entries: EssayListEntry[]
    error: string | null
    hasMore: boolean
    loading: boolean
    loadingMore: boolean
    moreError: string | null
    onCreateDraft: () => void
    onLoadMore: () => void
    onRefresh: () => void
    onRetry: () => void
    onSelectDraft: (draft: LocalDraft) => void
    onSelectEssay: (essay: EssayListEntry) => void
    refreshDisabled: boolean
    refreshing: boolean
    selectedDate: string | null
}

const PULL_REFRESH_THRESHOLD = 64
const PULL_REFRESH_MAX_DISTANCE = 96
const PULL_REFRESH_ACTIVE_DISTANCE = 44

function resistedPullDistance(distance: number) {
    return Math.min(PULL_REFRESH_MAX_DISTANCE, Math.max(0, distance) * 0.5)
}

function isInteractiveTarget(target: EventTarget | null) {
    return (
        target instanceof Element &&
        target.closest('button, a, input, textarea, select, [role="button"]')
    )
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

function EssaySkeleton({ count }: { count: number }) {
    return (
        <div className="essay-list-skeleton" aria-label="正在加载文章">
            {Array.from({ length: count }, (_, index) => (
                <div className="essay-list-skeleton-item" key={index}>
                    <span />
                    <span />
                </div>
            ))}
        </div>
    )
}

export default function SidebarEssayList({
    activeDocumentId,
    drafts,
    entries,
    error,
    hasMore,
    loading,
    loadingMore,
    moreError,
    onCreateDraft,
    onLoadMore,
    onRefresh,
    onRetry,
    onSelectDraft,
    onSelectEssay,
    refreshDisabled,
    refreshing,
    selectedDate,
}: SidebarEssayListProps) {
    const regionRef = useRef<HTMLDivElement>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const pointerIdRef = useRef<number | null>(null)
    const pullDistanceRef = useRef(0)
    const refreshObservedRef = useRef(false)
    const startYRef = useRef<number | null>(null)
    const suppressClickRef = useRef(false)
    const touchStartYRef = useRef<number | null>(null)
    const [pullDistance, setPullDistanceState] = useState(0)
    const [refreshRequested, setRefreshRequested] = useState(false)
    const refreshActive = refreshing || refreshRequested
    const refreshBlocked = refreshActive || refreshDisabled || loading

    const setPullDistance = useCallback((distance: number) => {
        pullDistanceRef.current = distance
        setPullDistanceState(distance)
    }, [])

    const finishPull = useCallback(() => {
        pointerIdRef.current = null
        startYRef.current = null
        touchStartYRef.current = null
        if (suppressClickRef.current) {
            window.setTimeout(() => {
                suppressClickRef.current = false
            }, 0)
        }

        if (
            pullDistanceRef.current >= PULL_REFRESH_THRESHOLD &&
            !refreshBlocked
        ) {
            refreshObservedRef.current = false
            setRefreshRequested(true)
            setPullDistance(PULL_REFRESH_ACTIVE_DISTANCE)
            onRefresh()
            return
        }
        if (!refreshActive) {
            setPullDistance(0)
        }
    }, [onRefresh, refreshActive, refreshBlocked, setPullDistance])

    const updatePull = useCallback(
        (clientY: number, preventDefault: () => void) => {
            const region = regionRef.current
            const startY = startYRef.current ?? touchStartYRef.current
            if (!region || startY === null || refreshBlocked) {
                return
            }

            const distance = clientY - startY
            if (region.scrollTop > 0 || distance <= 0) {
                if (pullDistanceRef.current > 0) {
                    setPullDistance(0)
                }
                return
            }

            preventDefault()
            if (distance > 4) {
                suppressClickRef.current = true
            }
            setPullDistance(resistedPullDistance(distance))
        },
        [refreshBlocked, setPullDistance]
    )

    useEffect(() => {
        regionRef.current?.scrollTo?.({ top: 0 })
    }, [selectedDate])

    useEffect(() => {
        if (refreshing) {
            refreshObservedRef.current = true
            setPullDistance(PULL_REFRESH_ACTIVE_DISTANCE)
            return
        }
        if (refreshRequested && refreshObservedRef.current) {
            setRefreshRequested(false)
            setPullDistance(0)
        }
    }, [refreshRequested, refreshing, setPullDistance])

    useEffect(() => {
        const region = regionRef.current
        if (!region) {
            return
        }

        const handleTouchStart = (event: TouchEvent) => {
            if (
                refreshBlocked ||
                region.scrollTop > 0 ||
                event.touches.length !== 1
            ) {
                touchStartYRef.current = null
                return
            }
            touchStartYRef.current = event.touches[0].clientY
        }
        const handleTouchMove = (event: TouchEvent) => {
            if (event.touches.length !== 1) {
                return
            }
            updatePull(event.touches[0].clientY, () => event.preventDefault())
        }
        const handleTouchEnd = () => finishPull()

        region.addEventListener('touchstart', handleTouchStart, { passive: true })
        region.addEventListener('touchmove', handleTouchMove, { passive: false })
        region.addEventListener('touchend', handleTouchEnd)
        region.addEventListener('touchcancel', handleTouchEnd)
        return () => {
            region.removeEventListener('touchstart', handleTouchStart)
            region.removeEventListener('touchmove', handleTouchMove)
            region.removeEventListener('touchend', handleTouchEnd)
            region.removeEventListener('touchcancel', handleTouchEnd)
        }
    }, [finishPull, refreshBlocked, updatePull])

    useEffect(() => {
        const sentinel = sentinelRef.current
        if (
            !sentinel ||
            !hasMore ||
            loadingMore ||
            refreshing ||
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
            { root: regionRef.current, rootMargin: '120px' }
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasMore, loadingMore, onLoadMore, refreshing])

    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (
            isInteractiveTarget(event.target) ||
            event.pointerType === 'touch' ||
            !event.isPrimary ||
            event.button !== 0 ||
            refreshBlocked ||
            (regionRef.current?.scrollTop ?? 0) > 0
        ) {
            return
        }
        pointerIdRef.current = event.pointerId
        startYRef.current = event.clientY
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== event.pointerId) {
            return
        }
        updatePull(event.clientY, () => event.preventDefault())
    }

    const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== event.pointerId) {
            return
        }
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        finishPull()
    }

    const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!suppressClickRef.current) {
            return
        }
        suppressClickRef.current = false
        event.preventDefault()
        event.stopPropagation()
    }

    const handleScroll = () => {
        const region = regionRef.current
        if (!region || !hasMore || loadingMore || refreshing) {
            return
        }

        const distanceToBottom =
            region.scrollHeight - region.scrollTop - region.clientHeight
        if (distanceToBottom <= 120) {
            onLoadMore()
        }
    }

    const refreshLabel = refreshActive
        ? '正在刷新'
        : pullDistance >= PULL_REFRESH_THRESHOLD
            ? '松开刷新'
            : '下拉刷新'
    const refreshStyle = {
        '--pull-refresh-distance': `${pullDistance}px`,
    } as CSSProperties

    return (
        <>
            <div className="sidebar-create-action flex justify-between items-center">
               <span className="text-xs font-semibold opacity-60">Essays</span>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="sidebar-create-button size-6"
                    onClick={onCreateDraft}
                >
                    <AddRegular />
                </Button>
            </div>
            <div
                ref={regionRef}
                className={`sidebar-list-region ${pullDistance > 0 ? 'is-pulling' : ''
                    } ${pullDistance >= PULL_REFRESH_THRESHOLD ? 'is-armed' : ''
                    } ${refreshActive ? 'is-refreshing' : ''}`}
                onClickCapture={handleClickCapture}
                onPointerCancel={handlePointerEnd}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onScroll={handleScroll}
            >
                <div
                    className="pull-refresh-indicator"
                    style={refreshStyle}
                    role="status"
                    aria-live="polite"
                    aria-hidden={pullDistance === 0 && !refreshActive}
                >
                    <span className="pull-refresh-icon" aria-hidden="true">
                        ↓
                    </span>
                    <span>{refreshLabel}</span>
                </div>
                <nav className="essay-index" aria-label="文章索引">
                    {drafts.map((draft) => {
                        const documentId = getLocalDraftDocumentKey(
                            draft.localId
                        )
                        const active = documentId === activeDocumentId
                        return (
                            <button
                                type="button"
                                key={draft.localId}
                                data-document-id={documentId}
                                className={`essay-index-item essay-new-item ${active ? 'is-active' : ''
                                    }`}
                                aria-current={active ? 'page' : undefined}
                                aria-label={`草稿，${markdownToSummary(
                                    draft.content
                                )}`}
                                onClick={() => onSelectDraft(draft)}
                            >
                                <span className="essay-index-label">草稿</span>
                                {draft.content.trim() && (
                                    <span className="essay-index-preview">
                                        {markdownToSummary(draft.content)}
                                    </span>
                                )}
                            </button>
                        )
                    })}

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
                            {selectedDate
                                ? '当天没有文章'
                                : '暂无已发布文章'}
                        </div>
                    ) : (
                        entries.map((essay) => {
                            const modified = essay.localContent !== undefined
                            const preview = essay.localContent ?? essay.content
                            const active =
                                `essay:${essay.id}` === activeDocumentId
                            return (
                                <button
                                    type="button"
                                    key={essay.id}
                                    data-document-id={`essay:${essay.id}`}
                                    className={`essay-index-item ${active ? 'is-active' : ''
                                        }`}
                                    aria-current={active ? 'page' : undefined}
                                    aria-label={`${markdownToSummary(preview)}${modified ? '，有本地更改' : ''
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
                        <div
                            className="essay-list-message is-compact"
                            role="alert"
                        >
                            <button type="button" onClick={onRetry}>
                                加载失败，点击重试
                            </button>
                        </div>
                    )}
                    <div ref={sentinelRef} className="essay-list-sentinel" />
                </nav>
            </div>
        </>
    )
}
