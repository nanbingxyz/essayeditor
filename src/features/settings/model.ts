export type Appearance = 'light' | 'dark' | 'system'

export type ApiKeySaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export type LlmActionStatus = 'idle' | 'loading' | 'success' | 'error'

export interface LlmSettings {
    apiKey: string
    baseUrl: string
    model: string
    reasoningEnabled: boolean
    verified: boolean
}

export const defaultLlmSettings: LlmSettings = {
    apiKey: '',
    baseUrl: '',
    model: '',
    reasoningEnabled: true,
    verified: false,
}

export interface SettingsSnapshot {
    accessToken: string
    appearance: Appearance
    llm: LlmSettings
}
