import {
    ChevronLeftRegular,
    ChevronRightRegular,
} from '@fluentui/react-icons'
import {useState} from 'react'

export type ArticleCountByDate = Record<string, number>

export interface SidebarCalendarProps {
    articleCounts?: ArticleCountByDate
    selectedDate: string | null
    onDateSelect: (date: string | null) => void
}

export interface CalendarDay {
    date: Date
    key: string
    isCurrentMonth: boolean
}

type CalendarView = 'days' | 'years' | 'months'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const MONTHS = Array.from({length: 12}, (_, index) => index + 1)

export const colorScale = [
    'heat-map-level-0',
    'heat-map-level-1',
    'heat-map-level-2',
    'heat-map-level-3',
    'heat-map-level-4',
]

export function getHeatMapColor(value: number) {
    const thresholds = [0, 1, 2, 5, 7]

    let colorIndex = 0
    for (let index = 0; index < thresholds.length; index += 1) {
        if (value >= thresholds[index]) {
            colorIndex = index
        } else {
            break
        }
    }
    return colorScale[colorIndex]
}

function padDatePart(value: number) {
    return String(value).padStart(2, '0')
}

export function formatDateKey(date: Date) {
    return [
        date.getFullYear(),
        padDatePart(date.getMonth() + 1),
        padDatePart(date.getDate()),
    ].join('-')
}

export function createMonthGrid(year: number, month: number): CalendarDay[] {
    const firstDay = new Date(year, month, 1)
    const mondayFirstOffset = (firstDay.getDay() + 6) % 7

    return Array.from({length: 42}, (_, index) => {
        const date = new Date(year, month, 1 - mondayFirstOffset + index)
        return {
            date,
            key: formatDateKey(date),
            isCurrentMonth:
                date.getFullYear() === year && date.getMonth() === month,
        }
    })
}

function getValidArticleCount(value: number | undefined) {
    return Number.isInteger(value) && value !== undefined && value > 0
        ? value
        : 0
}

function SidebarCalendar({
    articleCounts = {},
    selectedDate,
    onDateSelect,
}: SidebarCalendarProps) {
    const [today] = useState(() => new Date())
    const [displayedMonth, setDisplayedMonth] = useState(
        () => new Date(today.getFullYear(), today.getMonth(), 1)
    )
    const [view, setView] = useState<CalendarView>('days')
    const [yearPageStart, setYearPageStart] = useState(
        () => Math.floor(today.getFullYear() / 12) * 12
    )
    const [pickerYear, setPickerYear] = useState(today.getFullYear())

    const displayedYear = displayedMonth.getFullYear()
    const displayedMonthIndex = displayedMonth.getMonth()
    const days = createMonthGrid(displayedYear, displayedMonthIndex)
    const todayKey = formatDateKey(today)

    const showYearPicker = () => {
        setYearPageStart(Math.floor(displayedYear / 12) * 12)
        setPickerYear(displayedYear)
        setView('years')
    }

    const handleTitleClick = () => {
        if (view === 'days') {
            showYearPicker()
        } else {
            setView('days')
        }
    }

    const navigateBackward = () => {
        if (view === 'days') {
            setDisplayedMonth(
                new Date(displayedYear, displayedMonthIndex - 1, 1)
            )
        } else if (view === 'years') {
            setYearPageStart((start) => start - 12)
        } else {
            setPickerYear((year) => year - 1)
        }
    }

    const navigateForward = () => {
        if (view === 'days') {
            setDisplayedMonth(
                new Date(displayedYear, displayedMonthIndex + 1, 1)
            )
        } else if (view === 'years') {
            setYearPageStart((start) => start + 12)
        } else {
            setPickerYear((year) => year + 1)
        }
    }

    const selectDay = (day: CalendarDay) => {
        if (!day.isCurrentMonth) {
            setDisplayedMonth(
                new Date(day.date.getFullYear(), day.date.getMonth(), 1)
            )
        }
        onDateSelect(selectedDate === day.key ? null : day.key)
    }

    const headerLabel =
        view === 'days'
            ? `${displayedYear}年${displayedMonthIndex + 1}月`
            : view === 'years'
              ? `${yearPageStart}–${yearPageStart + 11}年`
              : `${pickerYear}年`

    const previousLabel =
        view === 'days'
            ? '上个月'
            : view === 'years'
              ? '前12年'
              : '上一年'
    const nextLabel =
        view === 'days'
            ? '下个月'
            : view === 'years'
              ? '后12年'
              : '下一年'

    return (
        <section className="sidebar-calendar" aria-label="日历">
            <header className="calendar-header">
                <button
                    type="button"
                    className="calendar-navigation-button"
                    aria-label={previousLabel}
                    title={previousLabel}
                    onClick={navigateBackward}
                >
                    <ChevronLeftRegular aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="calendar-title-button"
                    aria-label={
                        view === 'days'
                            ? `${headerLabel}，选择年份和月份`
                            : `${headerLabel}，返回日历`
                    }
                    aria-expanded={view !== 'days'}
                    onClick={handleTitleClick}
                >
                    {headerLabel}
                </button>
                <button
                    type="button"
                    className="calendar-navigation-button"
                    aria-label={nextLabel}
                    title={nextLabel}
                    onClick={navigateForward}
                >
                    <ChevronRightRegular aria-hidden="true" />
                </button>
            </header>

            <div className="calendar-body">
                {view === 'days' && (
                    <>
                        <div className="calendar-weekdays" aria-hidden="true">
                            {WEEKDAYS.map((weekday) => (
                                <span key={weekday}>{weekday}</span>
                            ))}
                        </div>
                        <div className="calendar-days">
                            {days.map((day) => {
                                const isToday = day.key === todayKey
                                const isSelected = day.key === selectedDate
                                const articleCount = getValidArticleCount(
                                    articleCounts[day.key]
                                )
                                const articleLabel =
                                    articleCount > 0
                                        ? `${articleCount}篇文章`
                                        : '没有文章'
                                const heatMapColor =
                                    articleCount > 0
                                        ? getHeatMapColor(articleCount)
                                        : ''

                                return (
                                    <button
                                        type="button"
                                        key={day.key}
                                        className={`calendar-day ${
                                            day.isCurrentMonth
                                                ? ''
                                                : 'is-outside-month'
                                        } ${isToday ? 'is-today' : ''} ${
                                            isSelected ? 'is-selected' : ''
                                        } ${heatMapColor}`}
                                        data-date={day.key}
                                        data-article-count={articleCount}
                                        aria-label={`${day.date.getFullYear()}年${
                                            day.date.getMonth() + 1
                                        }月${day.date.getDate()}日，${articleLabel}${
                                            isToday ? '，今天' : ''
                                        }${isSelected ? '，已选中' : ''}`}
                                        aria-current={
                                            isToday ? 'date' : undefined
                                        }
                                        aria-pressed={isSelected}
                                        onClick={() => selectDay(day)}
                                    >
                                        {day.date.getDate()}
                                    </button>
                                )
                            })}
                        </div>
                    </>
                )}

                {view === 'years' && (
                    <div className="calendar-picker-grid" aria-label="选择年份">
                        {Array.from({length: 12}, (_, index) => {
                            const year = yearPageStart + index
                            return (
                                <button
                                    type="button"
                                    key={year}
                                    className={`calendar-picker-button ${
                                        year === displayedYear
                                            ? 'is-current-value'
                                            : ''
                                    }`}
                                    aria-label={`选择${year}年`}
                                    onClick={() => {
                                        setPickerYear(year)
                                        setView('months')
                                    }}
                                >
                                    {year}
                                </button>
                            )
                        })}
                    </div>
                )}

                {view === 'months' && (
                    <div className="calendar-picker-grid" aria-label="选择月份">
                        {MONTHS.map((month) => (
                            <button
                                type="button"
                                key={month}
                                className={`calendar-picker-button ${
                                    pickerYear === displayedYear &&
                                    month === displayedMonthIndex + 1
                                        ? 'is-current-value'
                                        : ''
                                }`}
                                aria-label={`选择${pickerYear}年${month}月`}
                                onClick={() => {
                                    setDisplayedMonth(
                                        new Date(pickerYear, month - 1, 1)
                                    )
                                    setView('days')
                                }}
                            >
                                {month}月
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}

export default SidebarCalendar
