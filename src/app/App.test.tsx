import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

const {httpFetch, storeFiles} = vi.hoisted(() => ({
    httpFetch: vi.fn(),
    storeFiles: new Map<string, Map<string, unknown>>(),
}))

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(async () => undefined),
}))

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({
        setTheme: vi.fn(async () => undefined),
        show: vi.fn(async () => undefined),
    }),
}))

vi.mock('@tauri-apps/plugin-shell', () => ({
    open: vi.fn(async () => undefined),
}))

vi.mock('@tauri-apps/plugin-http', () => ({
    fetch: httpFetch,
}))

vi.mock('@tauri-apps/plugin-store', () => ({
    load: vi.fn(async (path: string) => {
        const values = storeFiles.get(path) ?? new Map<string, unknown>()
        storeFiles.set(path, values)
        return {
            delete: vi.fn(async (key: string) => values.delete(key)),
            get: vi.fn(async <T,>(key: string) => values.get(key) as T),
            save: vi.fn(async () => undefined),
            set: vi.fn(async (key: string, value: unknown) => {
                values.set(key, value)
            }),
        }
    }),
}))

import App from './App'

const roots: Root[] = []

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
    httpFetch.mockReset()
    storeFiles.clear()
})

describe('App navigation', () => {
    it('moves between the editor and settings without a router', async () => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 1000,
        })
        const container = document.body.appendChild(
            document.createElement('div')
        )
        const root = createRoot(container)
        roots.push(root)

        await act(async () => {
            root.render(<App />)
            await Promise.resolve()
        })
        expect(container.textContent).toContain('草稿')

        const settingsButton = container.querySelector(
            'button[aria-label="打开设置"]'
        )
        act(() => (settingsButton as HTMLButtonElement).click())
        expect(container.querySelector('.settings-page-container')?.className)
            .not.toContain('is-page-hidden')
        expect(container.textContent).toContain('管理 EssayEditor 的本地设置')

        const backButton = container.querySelector(
            'button[aria-label="返回编辑器"]'
        )
        await act(async () => {
            const button = backButton as HTMLButtonElement
            button.click()
            await Promise.resolve()
        })
        expect(container.querySelector('.editor-page')?.className).not.toContain(
            'is-page-hidden'
        )

        const publishButton = container.querySelector(
            'button[aria-label="发布文章"]'
        ) as HTMLButtonElement
        expect(publishButton.disabled).toBe(false)
        act(() => publishButton.click())
        expect(container.querySelector('.settings-page-container')?.className)
            .not.toContain('is-page-hidden')
    })

    it('creates multiple local drafts and reuses an existing blank one', async () => {
        storeFiles.set(
            'drafts.bin',
            new Map([
                [
                    'localDrafts',
                    {
                        version: 1,
                        drafts: [
                            {
                                localId: 'newer',
                                content: 'Newer draft',
                                createdAt: 2,
                                updatedAt: 3,
                            },
                            {
                                localId: 'older',
                                content: 'Older draft',
                                createdAt: 1,
                                updatedAt: 1,
                            },
                        ],
                    },
                ],
            ])
        )
        const container = document.body.appendChild(
            document.createElement('div')
        )
        const root = createRoot(container)
        roots.push(root)

        await act(async () => {
            root.render(<App />)
            await Promise.resolve()
            await Promise.resolve()
        })
        expect(
            Array.from(container.querySelectorAll('.essay-new-item')).map(
                (node) => node.textContent
            )
        ).toEqual(['草稿Newer draft', '草稿Older draft'])

        const createButton = container.querySelector(
            '.sidebar-create-button'
        ) as HTMLButtonElement
        await act(async () => {
            createButton.click()
            await Promise.resolve()
            await Promise.resolve()
        })
        expect(container.querySelectorAll('.essay-new-item')).toHaveLength(3)

        await act(async () => {
            createButton.click()
            await Promise.resolve()
        })
        expect(container.querySelectorAll('.essay-new-item')).toHaveLength(3)
        expect(
            container.querySelector('.essay-new-item.is-active')?.textContent
        ).toBe('草稿')
    })

    it('replaces a published draft with the server id without clearing content', async () => {
        storeFiles.set(
            'store.bin',
            new Map([
                ['accessToken', 'token'],
                ['appearance', 'system'],
            ])
        )
        storeFiles.set(
            'drafts.bin',
            new Map([
                [
                    'localDrafts',
                    {
                        version: 1,
                        drafts: [
                            {
                                localId: 'temporary',
                                content: 'Publish me',
                                createdAt: 1,
                                updatedAt: 1,
                            },
                        ],
                    },
                ],
            ])
        )
        let listRequests = 0
        httpFetch.mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                const url = String(input)
                if (url.includes('/heatmap?')) {
                    return new Response(
                        JSON.stringify({
                            user: {
                                id: 'user',
                                avatar: 'https://example.com/avatar.png',
                                displayName: 'User',
                            },
                            heatmap: {},
                        })
                    )
                }
                if (url.includes('/essays?')) {
                    listRequests += 1
                    return new Response(
                        JSON.stringify(
                            listRequests === 1
                                ? []
                                : [{id: 'real-id', content: 'Publish me'}]
                        )
                    )
                }
                if (url.endsWith('/essays') && init?.method === 'POST') {
                    return new Response(JSON.stringify({id: 'real-id'}))
                }
                throw new Error(`Unexpected request: ${url}`)
            }
        )
        const container = document.body.appendChild(
            document.createElement('div')
        )
        const root = createRoot(container)
        roots.push(root)

        await act(async () => {
            root.render(<App />)
            for (let index = 0; index < 8; index += 1) {
                await Promise.resolve()
            }
        })
        const publishButton = container.querySelector(
            'button[aria-label="发布文章"]'
        ) as HTMLButtonElement
        expect(publishButton.disabled).toBe(false)

        await act(async () => {
            publishButton.click()
            for (let index = 0; index < 12; index += 1) {
                await Promise.resolve()
            }
        })

        expect(container.querySelector('.editor-toolbar-title')?.textContent)
            .toBe('已发布')
        expect(
            container.querySelector('[data-document-id="essay:real-id"]')
        ).not.toBeNull()
        expect(container.textContent).toContain('Publish me')
        expect(
            (
                storeFiles
                    .get('drafts.bin')
                    ?.get('localDrafts') as {drafts: unknown[]}
            ).drafts
        ).toHaveLength(0)
        expect(httpFetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/essays$/),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({content: 'Publish me'}),
            })
        )
    })
})
