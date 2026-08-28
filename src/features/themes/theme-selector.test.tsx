import {createRoot} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {describe, expect, it, vi} from 'vitest'

import ThemeSelector from './theme-selector'

const themes = [
    {id: 1, name: '频道一', slug: 'one', brief: '第一个频道'},
    {
        id: 2,
        name: '这是一个很长的频道名称用于验证截断布局',
        slug: 'long',
        brief: '长名称频道',
    },
]

describe('ThemeSelector', () => {
    it('selects and clears a theme from the dropdown', () => {
        const container = document.body.appendChild(document.createElement('div'))
        const root = createRoot(container)
        const onChange = vi.fn()
        const onOpen = vi.fn()

        act(() =>
            root.render(
                <ThemeSelector
                    disabled={false}
                    loading={false}
                    onChange={onChange}
                    onOpen={onOpen}
                    ready
                    themes={themes}
                    value={null}
                />
            )
        )
        const trigger = container.querySelector(
            'button[aria-label="选择频道"]'
        ) as HTMLButtonElement
        act(() => trigger.click())
        expect(onOpen).toHaveBeenCalledTimes(1)

        act(() =>
            (
                Array.from(container.querySelectorAll('button')).find(
                    (button) => button.textContent === '频道一'
                ) as HTMLButtonElement
            ).click()
        )
        expect(onChange).toHaveBeenCalledWith(1)

        act(() =>
            root.render(
                <ThemeSelector
                    disabled={false}
                    loading={false}
                    onChange={onChange}
                    onOpen={onOpen}
                    ready
                    themes={themes}
                    value={1}
                />
            )
        )
        act(() =>
            (
                container.querySelector(
                    'button[aria-label="频道：频道一"]'
                ) as HTMLButtonElement
            ).click()
        )
        act(() =>
            (
                Array.from(container.querySelectorAll('button')).find(
                    (button) => button.textContent === '清除频道'
                ) as HTMLButtonElement
            ).click()
        )
        expect(onChange).toHaveBeenLastCalledWith(null)

        act(() => root.unmount())
        container.remove()
    })

    it('preserves an unknown selected id and labels it clearly', () => {
        const container = document.body.appendChild(document.createElement('div'))
        const root = createRoot(container)
        act(() =>
            root.render(
                <ThemeSelector
                    disabled={false}
                    loading={false}
                    onChange={vi.fn()}
                    onOpen={vi.fn()}
                    ready
                    themes={themes}
                    value={99}
                />
            )
        )

        expect(
            container.querySelector('button[aria-label="频道：未知频道"]')
        ).not.toBeNull()

        act(() => root.unmount())
        container.remove()
    })
})
