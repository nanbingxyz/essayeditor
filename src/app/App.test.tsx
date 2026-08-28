import {StrictMode} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Toaster} from '@/shared/ui'

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

async function settle(iterations = 8) {
    for (let index = 0; index < iterations; index += 1) {
        await Promise.resolve()
    }
}

function buttonWithText(text: string) {
    return Array.from(document.body.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === text
    ) as HTMLButtonElement | undefined
}

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
    httpFetch.mockReset()
    storeFiles.clear()
})

describe('App navigation', () => {
    it('persists only one default draft when StrictMode repeats startup effects', async () => {
        const container = document.body.appendChild(
            document.createElement('div')
        )
        const root = createRoot(container)
        roots.push(root)

        await act(async () => {
            root.render(
                <StrictMode>
                    <App />
                </StrictMode>
            )
            await settle()
        })

        const collection = storeFiles
            .get('drafts.bin')
            ?.get('localDrafts') as {drafts: unknown[]}
        expect(collection.drafts).toHaveLength(1)
        expect(container.querySelectorAll('.essay-new-item')).toHaveLength(1)
    })

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
        expect(container.textContent).toContain('Essay Editor 的本地设置')

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
                        version: 2,
                        drafts: [
                            {
                                localId: 'newer',
                                content: 'Newer draft',
                                createdAt: 2,
                                themeId: null,
                                updatedAt: 3,
                            },
                            {
                                localId: 'older',
                                content: 'Older draft',
                                createdAt: 1,
                                themeId: null,
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
                        version: 2,
                        drafts: [
                            {
                                localId: 'temporary',
                                content: 'Publish me',
                                createdAt: 1,
                                themeId: null,
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
                                : [
                                      {
                                          id: 'real-id',
                                          content: 'Publish me',
                                          theme_slug: null,
                                      },
                                  ]
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
                body: JSON.stringify({
                    content: 'Publish me',
                    theme_id: null,
                    is_private: false,
                }),
            })
        )
    })

    it('publishes the selected numeric theme id', async () => {
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
                        version: 2,
                        drafts: [
                            {
                                localId: 'themed',
                                content: 'Themed essay',
                                createdAt: 1,
                                themeId: null,
                                updatedAt: 1,
                            },
                        ],
                    },
                ],
            ])
        )
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
                if (url.endsWith('/themes')) {
                    return new Response(
                        JSON.stringify([
                            {
                                id: 12,
                                name: '技术',
                                slug: 'tech',
                                brief: '技术频道',
                            },
                        ])
                    )
                }
                if (url.includes('/essays?')) {
                    return new Response('[]')
                }
                if (url.endsWith('/essays') && init?.method === 'POST') {
                    return new Response(JSON.stringify({id: 'published'}))
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
            await settle(12)
        })
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="选择频道"]'
                ) as HTMLButtonElement
            ).click()
        )
        act(() =>
            (
                Array.from(container.querySelectorAll('button')).find(
                    (button) => button.textContent === '技术'
                ) as HTMLButtonElement
            ).click()
        )
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="仅自己可见"]'
                ) as HTMLButtonElement
            ).click()
        )

        await act(async () => {
            (
                container.querySelector(
                    'button[aria-label="发布文章"]'
                ) as HTMLButtonElement
            ).click()
            await settle(12)
        })

        expect(httpFetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/essays$/),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    content: 'Themed essay',
                    theme_id: 12,
                    is_private: true,
                }),
            })
        )
    })

    it('echoes a published theme and private state', async () => {
        storeFiles.set(
            'store.bin',
            new Map([
                ['accessToken', 'token'],
                ['appearance', 'system'],
            ])
        )
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
                if (url.endsWith('/themes')) {
                    return new Response(
                        JSON.stringify([
                            {
                                id: 12,
                                name: '技术',
                                slug: 'technology',
                                brief: '技术频道',
                            },
                        ])
                    )
                }
                if (url.includes('/essays?')) {
                    return new Response(
                        JSON.stringify([
                            {
                                id: 'themed-essay',
                                content: 'Published with theme',
                                is_private: true,
                                theme_slug: 'technology',
                            },
                        ])
                    )
                }
                if (
                    url.endsWith('/essays/themed-essay') &&
                    init?.method === 'PUT'
                ) {
                    return new Response(null, {status: 204})
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
            await settle(12)
        })
        await act(async () => {
            const essayButton = container.querySelector(
                '[data-document-id="essay:themed-essay"]'
            ) as HTMLButtonElement
            essayButton.click()
            await settle()
        })

        expect(
            container.querySelector('button[aria-label="频道：技术"]')
        ).not.toBeNull()
        expect(
            container
                .querySelector('button[aria-label="仅自己可见"]')
                ?.getAttribute('aria-pressed')
        ).toBe('true')

        act(() =>
            (
                container.querySelector(
                    'button[aria-label="仅自己可见"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => {
            (
                container.querySelector(
                    'button[aria-label="更新文章"]'
                ) as HTMLButtonElement
            ).click()
            await settle(12)
        })

        expect(httpFetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/essays\/themed-essay$/),
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify({
                    content: 'Published with theme',
                    theme_id: 12,
                    is_private: false,
                }),
            })
        )
    })

    it('requires confirmation before deleting a local draft and selects the first remaining draft', async () => {
        storeFiles.set(
            'drafts.bin',
            new Map([
                [
                    'localDrafts',
                    {
                        version: 2,
                        drafts: [
                            {
                                localId: 'newer',
                                content: 'Delete me',
                                createdAt: 2,
                                themeId: null,
                                updatedAt: 3,
                            },
                            {
                                localId: 'older',
                                content: 'Keep me',
                                createdAt: 1,
                                themeId: null,
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
            await settle()
        })

        const deleteButton = container.querySelector(
            'button[aria-label="删除文章"]'
        ) as HTMLButtonElement
        expect(deleteButton.closest('.editor-toolbar')).not.toBeNull()
        expect(deleteButton.closest('.editor-footer')).toBeNull()
        act(() => deleteButton.click())
        expect(document.body.textContent).toContain('删除本地草稿？')
        expect(document.body.textContent).toContain('此操作不可撤销')

        act(() => buttonWithText('取消')?.click())
        expect(container.querySelectorAll('.essay-new-item')).toHaveLength(2)

        act(() => deleteButton.click())
        await act(async () => {
            buttonWithText('确认删除')?.click()
            await settle(12)
        })

        expect(container.querySelectorAll('.essay-new-item')).toHaveLength(1)
        expect(
            container.querySelector('.essay-new-item.is-active')?.textContent
        ).toBe('草稿Keep me')
        expect(
            (
                storeFiles
                    .get('drafts.bin')
                    ?.get('localDrafts') as {drafts: Array<{localId: string}>}
            ).drafts.map(({localId}) => localId)
        ).toEqual(['older'])
        expect(httpFetch).not.toHaveBeenCalled()
    })

    it('creates a blank draft after deleting the last document', async () => {
        storeFiles.set(
            'drafts.bin',
            new Map([
                [
                    'localDrafts',
                    {
                        version: 2,
                        drafts: [
                            {
                                localId: 'only',
                                content: 'Last draft',
                                createdAt: 1,
                                themeId: null,
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
            await settle()
        })
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="删除文章"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => {
            buttonWithText('确认删除')?.click()
            await settle(12)
        })

        const storedDrafts = (
            storeFiles
                .get('drafts.bin')
                ?.get('localDrafts') as {drafts: Array<{content: string}>}
        ).drafts
        expect(storedDrafts).toHaveLength(1)
        expect(storedDrafts[0].content).toBe('')
        expect(container.querySelectorAll('.essay-new-item')).toHaveLength(1)
        expect(
            container.querySelector('.essay-new-item.is-active')?.textContent
        ).toBe('草稿')
    })

    it('deletes a published essay and its local override before selecting the first draft', async () => {
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
                        version: 2,
                        drafts: [
                            {
                                localId: 'local',
                                content: 'Local first',
                                createdAt: 1,
                                themeId: null,
                                updatedAt: 1,
                            },
                        ],
                    },
                ],
                [
                    'draft:essay:one',
                    {
                        version: 2,
                        content: 'Locally modified',
                        themeId: null,
                        updatedAt: 2,
                    },
                ],
            ])
        )
        let deleted = false
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
                    return new Response(
                        JSON.stringify(
                            deleted
                                ? [
                                      {
                                          id: 'two',
                                          content: 'Published two',
                                          theme_slug: null,
                                      },
                                  ]
                                : [
                                      {
                                          id: 'one',
                                          content: 'Published one',
                                          theme_slug: null,
                                      },
                                      {
                                          id: 'two',
                                          content: 'Published two',
                                          theme_slug: null,
                                      },
                                  ]
                        )
                    )
                }
                if (
                    url.endsWith('/essays/one') &&
                    init?.method === 'DELETE'
                ) {
                    deleted = true
                    return new Response(null, {status: 204})
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
            await settle(12)
        })
        await act(async () => {
            (
                container.querySelector(
                    '[data-document-id="essay:one"]'
                ) as HTMLButtonElement
            ).click()
            await settle()
        })
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="删除文章"]'
                ) as HTMLButtonElement
            ).click()
        )
        expect(document.body.textContent).toContain('删除已发布文章？')
        expect(document.body.textContent).toContain('网站上的文章数据')

        await act(async () => {
            buttonWithText('确认删除')?.click()
            await settle(16)
        })

        expect(httpFetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/essays\/one$/),
            expect.objectContaining({
                method: 'DELETE',
                headers: {Authorization: 'Bearer token'},
            })
        )
        expect(storeFiles.get('drafts.bin')?.has('draft:essay:one')).toBe(false)
        expect(
            container.querySelector('[data-document-id="essay:one"]')
        ).toBeNull()
        expect(
            container.querySelector('.essay-new-item.is-active')?.textContent
        ).toBe('草稿Local first')
    })

    it('keeps a published essay selected when remote deletion fails', async () => {
        storeFiles.set(
            'store.bin',
            new Map([
                ['accessToken', 'token'],
                ['appearance', 'system'],
            ])
        )
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
                    return new Response(
                        JSON.stringify([
                            {
                                id: 'one',
                                content: 'Published one',
                                theme_slug: null,
                            },
                        ])
                    )
                }
                if (
                    url.endsWith('/essays/one') &&
                    init?.method === 'DELETE'
                ) {
                    return new Response('{"error":"not allowed"}', {
                        status: 403,
                    })
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
            root.render(
                <>
                    <App />
                    <Toaster />
                </>
            )
            await settle(12)
        })
        await act(async () => {
            (
                container.querySelector(
                    '[data-document-id="essay:one"]'
                ) as HTMLButtonElement
            ).click()
            await settle()
        })
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="删除文章"]'
                ) as HTMLButtonElement
            ).click()
        )
        await act(async () => {
            buttonWithText('确认删除')?.click()
            await settle(12)
        })

        expect(
            container.querySelector('[data-document-id="essay:one"].is-active')
        ).not.toBeNull()
        expect(document.body.textContent).toContain('删除已发布文章？')
        expect(document.body.textContent).toContain('删除失败')
        expect(document.body.textContent).toContain('not allowed')
    })
})
