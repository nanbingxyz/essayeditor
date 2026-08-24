import {ArrowLeftIcon, EyeClosedIcon, EyeOpenIcon} from '@radix-ui/react-icons'
import {useState} from 'react'

import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {cn} from '@/lib/utils'

export type ApiKeySaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface SettingsPageProps {
    value: string
    saveStatus: ApiKeySaveStatus
    disabled: boolean
    onChange: (value: string) => void
    onBlur: () => void
    onBack: () => void | Promise<void>
}

const saveStatusCopy: Record<ApiKeySaveStatus, string> = {
    idle: '',
    saving: '正在保存…',
    saved: '已保存',
    error: '保存失败，请重试',
}

export default function SettingsPage({
    value,
    saveStatus,
    disabled,
    onChange,
    onBlur,
    onBack,
}: SettingsPageProps) {
    const [showApiKey, setShowApiKey] = useState(false)

    return (
        <div className="settings-page">
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
                    <p>管理 EssayEditor 的本地设置</p>
                </div>
            </header>

            <section className="settings-section" aria-labelledby="api-key-heading">
                <div className="settings-section-copy">
                    <Label id="api-key-heading" htmlFor="api-key">
                        API Key
                    </Label>
                    <p>
                        在 Essay 个人设置的“API 设置”中启用 API 并获取 API Key。
                        输入内容会自动保存在当前设备。
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
        </div>
    )
}
