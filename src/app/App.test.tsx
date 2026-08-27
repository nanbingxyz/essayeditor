import {createRoot, type Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

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

vi.mock('@tauri-apps/plugin-store', () => ({
    load: vi.fn(async () => ({
        delete: vi.fn(async () => false),
        get: vi.fn(async () => undefined),
        save: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
    })),
}))

import App from './App'

const roots: Root[] = []

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
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
        expect(container.textContent).toContain('新文章')

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
})
