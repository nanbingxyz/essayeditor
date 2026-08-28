import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {ThemeCacheRepository} from './theme-cache-repository'
import type {ThemeClient} from './theme-client'
import {THEME_CACHE_TTL, useThemeController} from './use-theme-controller'

const roots: Root[] = []
const cachedThemes = [
    {id: 1, name: '频道一', slug: 'one', brief: '第一个频道'},
]
const remoteThemes = [
    {id: 2, name: '频道二', slug: 'two', brief: '第二个频道'},
]

function renderController({
    cacheRepository,
    client,
    now,
}: {
    cacheRepository: ThemeCacheRepository
    client: ThemeClient
    now: () => number
}) {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    let controller: ReturnType<typeof useThemeController> | undefined
    function Harness() {
        controller = useThemeController({
            accessToken: 'token',
            cacheRepository,
            client,
            enabled: true,
            now,
        })
        return null
    }
    act(() => root.render(<Harness />))
    return () => {
        if (!controller) {
            throw new Error('Controller has not rendered')
        }
        return controller
    }
}

async function settle(iterations = 8) {
    for (let index = 0; index < iterations; index += 1) {
        await Promise.resolve()
    }
}

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
})

describe('useThemeController', () => {
    it('uses a fresh 24-hour cache without requesting the network', async () => {
        const now = 2 * THEME_CACHE_TTL
        const cacheRepository: ThemeCacheRepository = {
            load: vi.fn(async () => ({
                fetchedAt: now - THEME_CACHE_TTL + 1,
                themes: cachedThemes,
            })),
            save: vi.fn(async () => undefined),
        }
        const client: ThemeClient = {list: vi.fn(async () => remoteThemes)}
        const getController = renderController({
            cacheRepository,
            client,
            now: () => now,
        })

        await act(async () => settle())
        expect(getController().themes).toEqual(cachedThemes)
        await act(async () => getController().refreshIfExpired())
        expect(client.list).not.toHaveBeenCalled()
    })

    it('refreshes when opening after 24 hours and deduplicates requests', async () => {
        let timestamp = THEME_CACHE_TTL
        let resolveRequest: ((themes: typeof remoteThemes) => void) | undefined
        const cacheRepository: ThemeCacheRepository = {
            load: vi.fn(async () => ({fetchedAt: timestamp, themes: cachedThemes})),
            save: vi.fn(async () => undefined),
        }
        const client: ThemeClient = {
            list: vi.fn(
                () =>
                    new Promise<typeof remoteThemes>((resolve) => {
                        resolveRequest = resolve
                    })
            ),
        }
        const getController = renderController({
            cacheRepository,
            client,
            now: () => timestamp,
        })
        await act(async () => settle())
        expect(client.list).not.toHaveBeenCalled()

        timestamp += THEME_CACHE_TTL
        let first: Promise<boolean>
        let second: Promise<boolean>
        act(() => {
            first = getController().refreshIfExpired()
            second = getController().refreshIfExpired()
        })
        expect(first!).toBe(second!)
        expect(client.list).toHaveBeenCalledTimes(1)

        await act(async () => {
            resolveRequest?.(remoteThemes)
            await first!
        })
        expect(getController().themes).toEqual(remoteThemes)
    })

    it('keeps stale themes silently and does not retry in the same run', async () => {
        const timestamp = 2 * THEME_CACHE_TTL
        const cacheRepository: ThemeCacheRepository = {
            load: vi.fn(async () => ({fetchedAt: 1, themes: cachedThemes})),
            save: vi.fn(async () => undefined),
        }
        const client: ThemeClient = {
            list: vi.fn(async () => {
                throw new Error('offline')
            }),
        }
        const getController = renderController({
            cacheRepository,
            client,
            now: () => timestamp,
        })

        await act(async () => settle())
        expect(getController().themes).toEqual(cachedThemes)
        expect(client.list).toHaveBeenCalledTimes(1)
        await act(async () => getController().refreshIfExpired())
        expect(client.list).toHaveBeenCalledTimes(1)
    })
})
