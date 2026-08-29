import {Communication20Regular} from '@fluentui/react-icons'
import {CheckIcon, ChevronDownIcon, Cross2Icon} from '@radix-ui/react-icons'
import {useEffect, useRef, useState} from 'react'

import type {Theme} from './theme-client'

interface ThemeSelectorProps {
    disabled: boolean
    loading: boolean
    onChange: (themeId: number | null) => void
    onOpen: () => void
    ready: boolean
    themes: Theme[]
    unknownSelection?: boolean
    value: number | null
}

export default function ThemeSelector({
    disabled,
    loading,
    onChange,
    onOpen,
    ready,
    themes,
    unknownSelection = false,
    value,
}: ThemeSelectorProps) {
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement>(null)
    const selectedTheme = themes.find((theme) => theme.id === value)
    const selectedLabel =
        value === null
            ? unknownSelection
                ? '未知频道'
                : null
            : (selectedTheme?.name ?? '未知频道')

    useEffect(() => {
        if (!open) {
            return
        }
        const closeOutside = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false)
            }
        }
        document.addEventListener('pointerdown', closeOutside)
        document.addEventListener('keydown', closeOnEscape)
        return () => {
            document.removeEventListener('pointerdown', closeOutside)
            document.removeEventListener('keydown', closeOnEscape)
        }
    }, [open])

    const toggle = () => {
        const nextOpen = !open
        setOpen(nextOpen)
        if (nextOpen) {
            onOpen()
        }
    }

    const select = (themeId: number | null) => {
        onChange(themeId)
        setOpen(false)
    }

    return (
        <div ref={rootRef} className="theme-selector">
            <button
                type="button"
                className={`theme-selector-trigger flex justify-start items-center ${
                    selectedLabel ? 'has-selection' : ''
                }`}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={
                    selectedLabel
                        ? `频道：${selectedLabel}`
                        : '选择频道'
                }
                title={selectedLabel ?? '选择频道'}
                disabled={disabled || !ready}
                onClick={toggle}
            >
                <Communication20Regular aria-hidden="true" />
                {selectedLabel && (
                    <span className="theme-selector-label">
                        {selectedLabel}
                    </span>
                )}
                {selectedLabel && <ChevronDownIcon aria-hidden="true" />}
            </button>

            {open && (
                <div
                    className="theme-selector-menu"
                    role="listbox"
                    aria-label="频道"
                >
                    {loading && themes.length === 0 ? (
                        <div className="theme-selector-state">
                            正在加载频道…
                        </div>
                    ) : themes.length === 0 ? (
                        <div className="theme-selector-state">
                            暂无可用频道
                        </div>
                    ) : (
                        themes.map((theme) => (
                            <button
                                type="button"
                                role="option"
                                aria-selected={theme.id === value}
                                className="theme-selector-item"
                                key={theme.id}
                                title={theme.brief || theme.name}
                                onClick={() => select(theme.id)}
                            >
                                <span>{theme.name}</span>
                                {theme.id === value && (
                                    <CheckIcon aria-hidden="true" />
                                )}
                            </button>
                        ))
                    )}
                    {(value !== null || unknownSelection) && (
                        <>
                            <div className="theme-selector-separator" />
                            <button
                                type="button"
                                className="theme-selector-item is-clear"
                                onClick={() => select(null)}
                            >
                                <span>清除频道</span>
                                <Cross2Icon aria-hidden="true" />
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
