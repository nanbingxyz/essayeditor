import {
    type KeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    useEffect,
    useRef,
    useState,
} from 'react'

export type AppPage = 'editor' | 'settings'

export const LEFT_SIDEBAR_WIDTH = 240
export const MIN_EDITOR_WIDTH = 480
export const DEFAULT_RIGHT_SIDEBAR_WIDTH = 300
export const MIN_RIGHT_SIDEBAR_WIDTH = 240
export const MAX_RIGHT_SIDEBAR_WIDTH = 600

const SIDEBAR_BREAKPOINT = LEFT_SIDEBAR_WIDTH + MIN_EDITOR_WIDTH
const RIGHT_SIDEBAR_RESIZE_STEP = 16

interface RightSidebarResizeStart {
    pointerId: number
    pointerX: number
    width: number
}

interface SidebarLayoutOptions {
    onLayoutChange: () => void
    page: AppPage
}

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(Math.max(value, minimum), maximum)
}

export function useSidebarLayout({
    onLayoutChange,
    page,
}: SidebarLayoutOptions) {
    const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
    const [isNarrow, setIsNarrow] = useState(
        () => window.innerWidth < SIDEBAR_BREAKPOINT
    )
    const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const [desktopRightSidebarVisible, setDesktopRightSidebarVisible] =
        useState(false)
    const [rightSidebarWidth, setRightSidebarWidth] = useState(
        DEFAULT_RIGHT_SIDEBAR_WIDTH
    )
    const [isResizingRightSidebar, setIsResizingRightSidebar] =
        useState(false)
    const resizeStartRef = useRef<RightSidebarResizeStart>()

    const sidebarVisible = isNarrow
        ? mobileSidebarOpen
        : desktopSidebarVisible
    const leftSidebarOccupiedWidth =
        !isNarrow && desktopSidebarVisible ? LEFT_SIDEBAR_WIDTH : 0
    const availableRightSidebarWidth = Math.min(
        MAX_RIGHT_SIDEBAR_WIDTH,
        windowWidth - leftSidebarOccupiedWidth - MIN_EDITOR_WIDTH
    )
    const rightSidebarAvailable =
        page === 'editor' &&
        !isNarrow &&
        availableRightSidebarWidth >= MIN_RIGHT_SIDEBAR_WIDTH
    const rightSidebarVisible =
        rightSidebarAvailable && desktopRightSidebarVisible
    const effectiveRightSidebarWidth = rightSidebarAvailable
        ? clamp(
              rightSidebarWidth,
              MIN_RIGHT_SIDEBAR_WIDTH,
              availableRightSidebarWidth
          )
        : 0

    useEffect(() => {
        const handleResize = () => {
            const nextWindowWidth = window.innerWidth
            const nextIsNarrow = nextWindowWidth < SIDEBAR_BREAKPOINT
            setWindowWidth(nextWindowWidth)
            setIsNarrow((currentIsNarrow) => {
                if (currentIsNarrow !== nextIsNarrow) {
                    setMobileSidebarOpen(false)
                }
                return nextIsNarrow
            })
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        const animationFrame = requestAnimationFrame(onLayoutChange)
        return () => cancelAnimationFrame(animationFrame)
    }, [effectiveRightSidebarWidth, onLayoutChange, rightSidebarVisible, sidebarVisible])

    const toggleSidebar = () => {
        if (isNarrow) {
            setMobileSidebarOpen((open) => !open)
        } else {
            setDesktopSidebarVisible((visible) => !visible)
        }
    }

    const stopRightSidebarResize = (pointerId?: number) => {
        if (
            pointerId !== undefined &&
            resizeStartRef.current?.pointerId !== pointerId
        ) {
            return
        }

        resizeStartRef.current = undefined
        setIsResizingRightSidebar(false)
        onLayoutChange()
    }

    const startRightSidebarResize = (
        event: ReactPointerEvent<HTMLDivElement>
    ) => {
        if (event.button !== 0) {
            return
        }

        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        resizeStartRef.current = {
            pointerId: event.pointerId,
            pointerX: event.clientX,
            width: effectiveRightSidebarWidth,
        }
        setIsResizingRightSidebar(true)
    }

    const resizeRightSidebar = (event: ReactPointerEvent<HTMLDivElement>) => {
        const resizeStart = resizeStartRef.current
        if (!resizeStart || resizeStart.pointerId !== event.pointerId) {
            return
        }

        const nextWidth =
            resizeStart.width + resizeStart.pointerX - event.clientX
        setRightSidebarWidth(
            clamp(
                nextWidth,
                MIN_RIGHT_SIDEBAR_WIDTH,
                availableRightSidebarWidth
            )
        )
    }

    const resizeRightSidebarWithKeyboard = (
        event: KeyboardEvent<HTMLDivElement>
    ) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
            return
        }

        event.preventDefault()
        const direction = event.key === 'ArrowLeft' ? 1 : -1
        setRightSidebarWidth(
            clamp(
                effectiveRightSidebarWidth +
                    direction * RIGHT_SIDEBAR_RESIZE_STEP,
                MIN_RIGHT_SIDEBAR_WIDTH,
                availableRightSidebarWidth
            )
        )
    }

    return {
        availableRightSidebarWidth,
        closeMobileSidebar: () => setMobileSidebarOpen(false),
        effectiveRightSidebarWidth,
        isNarrow,
        isResizingRightSidebar,
        resizeRightSidebar,
        resizeRightSidebarWithKeyboard,
        rightSidebarAvailable,
        rightSidebarVisible,
        sidebarVisible,
        startRightSidebarResize,
        stopRightSidebarResize,
        toggleRightSidebar: () =>
            setDesktopRightSidebarVisible((visible) => !visible),
        toggleSidebar,
    }
}

export type SidebarLayout = ReturnType<typeof useSidebarLayout>
