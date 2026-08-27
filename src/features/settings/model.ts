export type Appearance = 'light' | 'dark' | 'system'

export type ApiKeySaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface SettingsSnapshot {
    accessToken: string
    appearance: Appearance
}
