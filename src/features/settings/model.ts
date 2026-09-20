export type Appearance = 'light' | 'dark' | 'system'

export type ApiKeySaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export type LlmActionStatus = 'idle' | 'loading' | 'success' | 'error'

export interface LlmSettings {
    apiKey: string
    baseUrl: string
    model: string
    verified: boolean
}

export interface SettingsSnapshot {
    accessToken: string
    appearance: Appearance
    llm: LlmSettings
}
