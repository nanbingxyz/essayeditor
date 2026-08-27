export interface DebouncedTask<TArgs extends unknown[]> {
    (...args: TArgs): void
    cancel: () => void
    flush: () => void
}

export function debounce<TArgs extends unknown[]>(
    callback: (...args: TArgs) => void,
    delay: number
): DebouncedTask<TArgs> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let pendingArguments: TArgs | undefined

    const invoke = () => {
        if (!pendingArguments) {
            return
        }

        const argumentsToUse = pendingArguments
        pendingArguments = undefined
        timeoutId = undefined
        callback(...argumentsToUse)
    }

    const debounced = (...args: TArgs) => {
        pendingArguments = args
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId)
        }
        timeoutId = setTimeout(invoke, delay)
    }

    debounced.cancel = () => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId)
        }
        timeoutId = undefined
        pendingArguments = undefined
    }

    debounced.flush = () => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId)
        }
        invoke()
    }

    return debounced
}

export function getRelativeTime(date: Date, now = new Date()) {
    const elapsedSeconds = Math.max(
        0,
        Math.floor((now.getTime() - date.getTime()) / 1000)
    )
    const intervals = [
        ['month', 30 * 24 * 60 * 60],
        ['week', 7 * 24 * 60 * 60],
        ['day', 24 * 60 * 60],
        ['hour', 60 * 60],
        ['minute', 60],
        ['second', 1],
    ] as const

    for (const [unit, secondsInUnit] of intervals) {
        const interval = Math.floor(elapsedSeconds / secondsInUnit)
        if (interval >= 1) {
            return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`
        }
    }

    return 'just now'
}
