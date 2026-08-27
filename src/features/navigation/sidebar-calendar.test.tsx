import {useState} from 'react'
import {createRoot, Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import SidebarCalendar, {
    type ArticleCountByDate,
    createMonthGrid,
    getHeatMapColor,
} from './sidebar-calendar'

const roots: Root[] = []

function renderCalendar(
    articleCounts: ArticleCountByDate = {},
    initialSelectedDate: string | null = null
) {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)

    function CalendarHarness() {
        const [selectedDate, setSelectedDate] = useState(initialSelectedDate)

        return (
            <>
                <output data-testid="selected-date">
                    {selectedDate ?? ''}
                </output>
                <SidebarCalendar
                    articleCounts={articleCounts}
                    selectedDate={selectedDate}
                    onDateSelect={setSelectedDate}
                />
            </>
        )
    }

    act(() => root.render(<CalendarHarness />))
    return container
}

function click(element: Element | null | undefined) {
    expect(element).not.toBeNull()
    act(() => (element as HTMLElement).click())
}

function getButtonByLabel(container: HTMLElement, label: string) {
    return Array.from(container.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === label
    )
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 12))
})

afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
    vi.useRealTimers()
})

describe('calendar date utilities', () => {
    it('creates a Monday-first 42-day grid for a leap-year February', () => {
        const days = createMonthGrid(2024, 1)

        expect(days).toHaveLength(42)
        expect(days[0].key).toBe('2024-01-29')
        expect(days[41].key).toBe('2024-03-10')
        expect(days.filter((day) => day.isCurrentMonth)).toHaveLength(29)
    })

    it('maps article counts to the expected heatmap thresholds', () => {
        expect(getHeatMapColor(0)).toBe('heat-map-level-0')
        expect(getHeatMapColor(1)).toBe('heat-map-level-1')
        expect(getHeatMapColor(2)).toBe('heat-map-level-2')
        expect(getHeatMapColor(4)).toBe('heat-map-level-2')
        expect(getHeatMapColor(5)).toBe('heat-map-level-3')
        expect(getHeatMapColor(6)).toBe('heat-map-level-3')
        expect(getHeatMapColor(7)).toBe('heat-map-level-4')
    })
})

describe('SidebarCalendar', () => {
    it('renders the current month with 42 date buttons', () => {
        const container = renderCalendar()

        expect(container.textContent).toContain('2026年1月')
        expect(container.querySelectorAll('.calendar-day')).toHaveLength(42)
        expect(
            container
                .querySelector('[data-date="2026-01-15"]')
                ?.getAttribute('aria-current')
        ).toBe('date')
    })

    it('moves between months across a year boundary', () => {
        const container = renderCalendar()

        click(getButtonByLabel(container, '上个月'))
        expect(container.textContent).toContain('2025年12月')

        click(getButtonByLabel(container, '下个月'))
        expect(container.textContent).toContain('2026年1月')
    })

    it('pages through years and selects a year and month', () => {
        const container = renderCalendar()

        click(getButtonByLabel(container, '2026年1月，选择年份和月份'))
        expect(container.textContent).toContain('2016–2027年')

        click(getButtonByLabel(container, '后12年'))
        expect(container.textContent).toContain('2028–2039年')

        click(getButtonByLabel(container, '选择2030年'))
        expect(container.textContent).toContain('2030年')
        expect(getButtonByLabel(container, '选择2030年2月')).toBeDefined()

        click(getButtonByLabel(container, '选择2030年2月'))
        expect(container.textContent).toContain('2030年2月')
        expect(container.querySelectorAll('.calendar-day')).toHaveLength(42)
    })

    it('selects an adjacent-month date, changes month, and toggles it off', () => {
        const container = renderCalendar()
        const selectedDate = container.querySelector(
            '[data-testid="selected-date"]'
        )

        click(container.querySelector('[data-date="2025-12-29"]'))
        expect(selectedDate?.textContent).toBe('2025-12-29')
        expect(container.textContent).toContain('2025年12月')
        expect(
            container
                .querySelector('[data-date="2025-12-29"]')
                ?.getAttribute('aria-pressed')
        ).toBe('true')

        click(container.querySelector('[data-date="2025-12-29"]'))
        expect(selectedDate?.textContent).toBe('')
    })

    it('normalizes article counts and applies visual levels only above zero', () => {
        const container = renderCalendar({
            '2026-01-13': 1,
            '2026-01-14': 2,
            '2026-01-15': 5,
            '2026-01-16': 7,
            '2026-01-17': -2,
        })
        const emptyDate = container.querySelector(
            '[data-date="2026-01-17"]'
        )

        expect(
            container.querySelector('[data-date="2026-01-13"]')?.className
        ).toContain('heat-map-level-1')
        expect(
            container.querySelector('[data-date="2026-01-14"]')?.className
        ).toContain('heat-map-level-2')
        expect(
            container.querySelector('[data-date="2026-01-15"]')?.className
        ).toContain('heat-map-level-3')
        expect(
            container.querySelector('[data-date="2026-01-16"]')?.className
        ).toContain('heat-map-level-4')
        expect(emptyDate?.getAttribute('data-article-count')).toBe('0')
        expect(emptyDate?.getAttribute('aria-label')).toContain('没有文章')
        expect(emptyDate?.className).not.toContain('heat-map-level-0')
    })

    it('keeps the selected state alongside the heatmap level', () => {
        const container = renderCalendar({'2026-01-15': 5}, '2026-01-15')
        const selectedDate = container.querySelector(
            '[data-date="2026-01-15"]'
        )

        expect(selectedDate?.className).toContain('heat-map-level-3')
        expect(selectedDate?.className).toContain('is-selected')
    })
})
