import { ArrowLeftIcon, EyeClosedIcon, EyeOpenIcon, MoonIcon, SunIcon, } from '@radix-ui/react-icons'
import { DarkThemeRegular } from '@fluentui/react-icons'
import { useState } from 'react'

import { SettingsUpdateSection } from '@/features/updater'
import { cn } from '@/shared/lib'
import { Button, Input, Label } from '@/shared/ui'
import { tauriDesktopAdapter } from '@/shared/platform/desktop'
import type { ApiKeySaveStatus, Appearance } from './model'

interface SettingsPageProps {
    appearance: Appearance
    disabled: boolean
    onAppearanceChange: (appearance: Appearance) => void
    onBack: () => void | Promise<void>
    onBlur: () => void
    onChange: (value: string) => void
    saveStatus: ApiKeySaveStatus
    value: string
}

const saveStatusCopy: Record<ApiKeySaveStatus, string> = {
    idle: '',
    saving: '正在保存…',
    saved: '已保存',
    error: '保存失败，请重试',
}

export default function SettingsPage({
    appearance,
    disabled,
    onAppearanceChange,
    onBack,
    onBlur,
    onChange,
    saveStatus,
    value,
}: SettingsPageProps) {
    const [showApiKey, setShowApiKey] = useState(false)

    return (
        <div className="settings-page flex flex-col">
            <header className="settings-page-header">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="settings-back-button"
                    aria-label="返回编辑器"
                    title="返回编辑器"
                    onClick={() => void onBack()}
                >
                    <ArrowLeftIcon />
                </Button>
                <div>
                    <h1>设置</h1>
                    <p>Essay Editor 本地设置</p>
                </div>
            </header>

            <section
                className="settings-section"
                aria-labelledby="api-key-heading"
            >
                <div className="settings-section-copy">
                    <Label id="api-key-heading" htmlFor="api-key">
                        API Key
                    </Label>
                    <p>
                        在 Essay 个人设置的“API 设置”中启用 API 并获取 API Key。
                    </p>
                </div>

                <div className="api-key-field">
                    <Input
                        id="api-key"
                        type={showApiKey ? 'text' : 'password'}
                        value={value}
                        disabled={disabled}
                        placeholder="输入 API Key"
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => onChange(event.target.value)}
                        onBlur={onBlur}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                        title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                        onClick={() => setShowApiKey((visible) => !visible)}
                    >
                        {showApiKey ? <EyeClosedIcon /> : <EyeOpenIcon />}
                    </Button>
                </div>

                <p
                    className={cn(
                        'api-key-save-status',
                        saveStatus === 'error' && 'is-error'
                    )}
                    aria-live="polite"
                >
                    {saveStatusCopy[saveStatus]}
                </p>
            </section>

            <section
                className="settings-section appearance-section"
                aria-labelledby="appearance-heading"
            >
                <div className="settings-section-copy">
                    <h2 id="appearance-heading">外观</h2>
                    <p>选择应用和窗口标题栏的显示方式。</p>
                </div>

                <div
                    className="appearance-options"
                    role="radiogroup"
                    aria-labelledby="appearance-heading"
                >
                    {(
                        [
                            ['light', '浅色', '始终使用浅色外观', <SunIcon />],
                            ['dark', '暗色', '始终使用暗色外观', <MoonIcon />],
                            ['system', '跟随系统', '根据系统设置自动切换', <DarkThemeRegular />],
                        ] as const
                    ).map(([option, label, description, icon]) => (
                        <label
                            key={option}
                            className={cn(
                                'appearance-option',
                                appearance === option && 'is-selected'
                            )}
                        >
                            <input
                                type="radio"
                                name="appearance"
                                value={option}
                                checked={appearance === option}
                                disabled={disabled}
                                onChange={() => onAppearanceChange(option)}
                            />
                            <span className="appearance-option-copy">
                                {icon && <span className="appearance-option-icon">{icon}</span>}
                                <span>{label}</span>
                                <small>{description}</small>
                            </span>
                        </label>
                    ))}
                </div>
            </section>

            <SettingsUpdateSection />
            <div className="grow"></div>
            <div className='mt-6'>
                <button className='text-muted-foreground text-sm font-serif font-medium' onClick={() => tauriDesktopAdapter.openExternal('https://www.essay.ink')}>Essay</button>
                <p className='text-[11px] text-muted-foreground'>文字，在此自由流淌</p>
            </div>
        </div>
    )
}
