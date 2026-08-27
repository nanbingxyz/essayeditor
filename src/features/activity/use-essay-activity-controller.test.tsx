import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {EssayActivityClient} from './essay-activity-client'
import type {EssayActivitySnapshot} from './model'
import {useEssayActivityController} from './use-essay-activity-controller'

type Controller = ReturnType<typeof useEssayActivityController>

interface HarnessProps {
    accessToken: string
    enabled: boolean
}

const roots: Root[] = []

function renderController(
    client: EssayActivityClient,
    initialProps: HarnessProps
) {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    let props = initialProps
    let controller: Controller | undefined
    const onError = vi.fn()

    function Harness() {
        controller = useEssayActivityController({
            ...props,
            client,
            onError,
        })
        return null
    }

    act(() => root.render(<Harness />))

    return {
        getController: () => {
            if (!controller) {
                throw new Error('Controller has not rendered')
            }
            return controller
        },
        onError,
        rerender: async (nextProps: HarnessProps) => {
            props = nextProps
            await act(async () => {
                root.render(<Harness />)
                await Promise.resolve()
            })
        },
    }
}

function snapshot(name: string, count: number): EssayActivitySnapshot {
    return {
        user: {avatar: `${name}-avatar`, displayName: name},
        heatmap: {'2026-08-27': count},
    }
}

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })
    return {promise, reject, resolve}
}

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
})

describe('useEssayActivityController', () => {
    it('loads only when enabled and the saved API key changes', async () => {
        const getHeatmap = vi.fn(async (token: string) =>
            snapshot(token, token === 'first' ? 1 : 2)
        )
        const client: EssayActivityClient = {getHeatmap}
        const {getController, rerender} = renderController(client, {
            accessToken: 'first',
            enabled: false,
        })

        expect(getHeatmap).not.toHaveBeenCalled()
        await rerender({accessToken: 'first', enabled: true})
        expect(getHeatmap).toHaveBeenCalledTimes(1)
        expect(getController().user?.displayName).toBe('first')

        await rerender({accessToken: 'first', enabled: true})
        expect(getHeatmap).toHaveBeenCalledTimes(1)

        await rerender({accessToken: 'second', enabled: true})
        expect(getHeatmap).toHaveBeenCalledTimes(2)
        expect(getController().heatmap).toEqual({'2026-08-27': 2})

        await rerender({accessToken: '', enabled: true})
        expect(getHeatmap).toHaveBeenCalledTimes(2)
        expect(getController().user).toBeNull()
        expect(getController().heatmap).toEqual({})
    })

    it('ignores a stale response after the API key changes', async () => {
        const first = deferred<EssayActivitySnapshot>()
        const second = deferred<EssayActivitySnapshot>()
        const signals: AbortSignal[] = []
        const client: EssayActivityClient = {
            getHeatmap: vi.fn((token, signal) => {
                if (signal) {
                    signals.push(signal)
                }
                return token === 'first' ? first.promise : second.promise
            }),
        }
        const {getController, rerender} = renderController(client, {
            accessToken: 'first',
            enabled: true,
        })

        await rerender({accessToken: 'second', enabled: true})
        expect(signals[0].aborted).toBe(true)

        await act(async () => {
            second.resolve(snapshot('second', 2))
            await second.promise
        })
        expect(getController().user?.displayName).toBe('second')

        await act(async () => {
            first.resolve(snapshot('first', 1))
            await first.promise
        })
        expect(getController().user?.displayName).toBe('second')
    })

    it('clears activity data and reports request failures once', async () => {
        const client: EssayActivityClient = {
            getHeatmap: vi.fn(async () => {
                throw new Error('invalid token')
            }),
        }
        const {getController, onError} = renderController(client, {
            accessToken: 'invalid',
            enabled: true,
        })

        await act(async () => Promise.resolve())
        expect(getController().error).toBe('invalid token')
        expect(getController().heatmap).toEqual({})
        expect(onError).toHaveBeenCalledOnce()
        expect(onError).toHaveBeenCalledWith('invalid token')
    })
})
