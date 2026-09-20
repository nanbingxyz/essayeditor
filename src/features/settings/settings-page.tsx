import { Popover } from '@base-ui/react/popover'
import {
    ArrowLeftIcon,
    EyeClosedIcon,
    EyeOpenIcon,
    MoonIcon,
    OpenInNewWindowIcon,
    QuestionMarkCircledIcon,
    ReloadIcon,
    SunIcon,
} from '@radix-ui/react-icons'
import { DarkThemeRegular } from '@fluentui/react-icons'
import { useState } from 'react'

import { SettingsUpdateSection } from '@/features/updater'
import { cn } from '@/shared/lib'
import { Button, Input, Label } from '@/shared/ui'
import { tauriDesktopAdapter } from '@/shared/platform/desktop'
import type {
    ApiKeySaveStatus,
    Appearance,
    LlmActionStatus,
    LlmSettings,
} from './model'

interface SettingsPageProps {
    appearance: Appearance
    disabled: boolean
    llm: LlmSettings
    llmSaveStatus: ApiKeySaveStatus
    modelError: string
    models: string[]
    modelStatus: LlmActionStatus
    onAppearanceChange: (appearance: Appearance) => void
    onBack: () => void | Promise<void>
    onBlur: () => void
    onChange: (value: string) => void
    onDiscoverModels: () => void
    onLlmApiKeyChange: (value: string) => void
    onLlmBaseUrlChange: (value: string) => void
    onLlmBlur: () => void
    onLlmModelChange: (value: string) => void
    onTestLlm: () => void
    saveStatus: ApiKeySaveStatus
    testError: string
    testStatus: LlmActionStatus
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
    llm,
    llmSaveStatus,
    modelError,
    models,
    modelStatus,
    onAppearanceChange,
    onBack,
    onBlur,
    onChange,
    onDiscoverModels,
    onLlmApiKeyChange,
    onLlmBaseUrlChange,
    onLlmBlur,
    onLlmModelChange,
    onTestLlm,
    saveStatus,
    testError,
    testStatus,
    value,
}: SettingsPageProps) {
    const [showApiKey, setShowApiKey] = useState(false)
    const [showLlmApiKey, setShowLlmApiKey] = useState(false)

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
                    <div className="api-key-description">
                        <p>
                            在 Essay 个人设置的“API 设置”中启用 API 并获取 API Key。
                        </p>
                        <Popover.Root>
                            <Popover.Trigger
                                className="api-key-help-trigger"
                                aria-label="查看 API Key 获取方式"
                                openOnHover
                                delay={150}
                                closeDelay={150}
                            >
                                <QuestionMarkCircledIcon />
                            </Popover.Trigger>
                            <Popover.Portal>
                                <Popover.Positioner
                                    className="api-key-help-positioner"
                                    side="bottom"
                                    align="start"
                                    sideOffset={8}
                                >
                                    <Popover.Popup className="api-key-help-popover">
                                        <img
                                            src="/apikey_help.jpg"
                                            alt="Essay API 设置页面中启用 API 并获取 API Key 的位置"
                                        />
                                        <Button
                                            type="button"
                                            className="api-key-help-link"
                                            onClick={() =>
                                                void tauriDesktopAdapter.openExternal(
                                                    'https://www.essay.ink/i/settings/api'
                                                )
                                            }
                                        >
                                            前往 API 设置
                                            <OpenInNewWindowIcon />
                                        </Button>
                                    </Popover.Popup>
                                </Popover.Positioner>
                            </Popover.Portal>
                        </Popover.Root>
                    </div>
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
                className="settings-section llm-settings-section"
                aria-labelledby="llm-settings-heading"
            >
                <div className="settings-section-copy">
                    <h2 id="llm-settings-heading">大模型</h2>
                    <p>
                        配置兼容 OpenAI API 的服务。Base URL 通常以 /v1
                        结尾。
                    </p>
                </div>

                <div className="llm-settings-fields">
                    <Label htmlFor="llm-base-url">Base URL</Label>
                    <Input
                        id="llm-base-url"
                        value={llm.baseUrl}
                        disabled={disabled}
                        placeholder="https://api.openai.com/v1"
                        spellCheck={false}
                        onChange={(event) =>
                            onLlmBaseUrlChange(event.target.value)
                        }
                        onBlur={onLlmBlur}
                    />

                    <Label htmlFor="llm-api-key">API Key</Label>
                    <div className="api-key-field">
                        <Input
                            id="llm-api-key"
                            type={showLlmApiKey ? 'text' : 'password'}
                            value={llm.apiKey}
                            disabled={disabled}
                            placeholder="输入大模型 API Key"
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) =>
                                onLlmApiKeyChange(event.target.value)
                            }
                            onBlur={onLlmBlur}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={disabled}
                            aria-label={
                                showLlmApiKey
                                    ? '隐藏大模型 API Key'
                                    : '显示大模型 API Key'
                            }
                            onClick={() =>
                                setShowLlmApiKey((visible) => !visible)
                            }
                        >
                            {showLlmApiKey ? (
                                <EyeClosedIcon />
                            ) : (
                                <EyeOpenIcon />
                            )}
                        </Button>
                    </div>

                    <div className="llm-model-heading">
                        <Label htmlFor="llm-model">模型</Label>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={disabled || modelStatus === 'loading'}
                            onClick={onDiscoverModels}
                        >
                            <ReloadIcon
                                className={
                                    modelStatus === 'loading'
                                        ? 'animate-spin'
                                        : undefined
                                }
                            />
                            获取模型
                        </Button>
                    </div>
                    {models.length > 0 ? (
                        <select
                            id="llm-model"
                            value={llm.model}
                            disabled={disabled}
                            onChange={(event) =>
                                onLlmModelChange(event.target.value)
                            }
                        >
                            {models.map((model) => (
                                <option key={model} value={model}>
                                    {model}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <Input
                            id="llm-model"
                            value={llm.model}
                            disabled={disabled}
                            placeholder="手动填写模型名称"
                            spellCheck={false}
                            onChange={(event) =>
                                onLlmModelChange(event.target.value)
                            }
                        />
                    )}

                    {modelStatus === 'error' && (
                        <p className="llm-inline-status is-error">
                            {modelError}
                        </p>
                    )}
                    <div className="llm-test-row">
                        <Button
                            type="button"
                            disabled={
                                disabled || testStatus === 'loading'
                            }
                            onClick={onTestLlm}
                        >
                            {testStatus === 'loading'
                                ? '正在测试…'
                                : '测试连接'}
                        </Button>
                        <span
                            className={cn(
                                'llm-inline-status',
                                testStatus === 'error' && 'is-error',
                                testStatus === 'success' && 'is-success'
                            )}
                            aria-live="polite"
                        >
                            {testStatus === 'success'
                                ? '配置正确'
                                : testStatus === 'error'
                                  ? testError
                                  : saveStatusCopy[llmSaveStatus]}
                        </span>
                    </div>
                </div>
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
