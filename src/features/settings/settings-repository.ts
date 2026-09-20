import {
    loadTauriStore,
    type StoreLoader,
} from '@/shared/platform/store'

import type {Appearance, LlmSettings, SettingsSnapshot} from './model'
import {defaultLlmSettings} from './model'

const SETTINGS_STORE_PATH = 'store.bin'
const ACCESS_TOKEN_KEY = 'accessToken'
const APPEARANCE_KEY = 'appearance'
const LLM_SETTINGS_KEY = 'llmSettings'

export interface SettingsRepository {
    load: () => Promise<SettingsSnapshot>
    saveAccessToken: (accessToken: string) => Promise<void>
    saveAppearance: (appearance: Appearance) => Promise<void>
    saveLlmSettings: (settings: LlmSettings) => Promise<void>
}

function normalizeAppearance(value: unknown): Appearance {
    return value === 'light' || value === 'dark' ? value : 'system'
}

function parseLlmSettings(value: unknown): LlmSettings {
    if (typeof value !== 'object' || value === null) {
        return {...defaultLlmSettings}
    }
    const candidate = value as Record<string, unknown>
    return {
        apiKey:
            typeof candidate.apiKey === 'string'
                ? candidate.apiKey.trim()
                : '',
        baseUrl:
            typeof candidate.baseUrl === 'string'
                ? candidate.baseUrl.trim().replace(/\/+$/, '')
                : '',
        model:
            typeof candidate.model === 'string'
                ? candidate.model.trim()
                : '',
        reasoningEnabled: candidate.reasoningEnabled !== false,
        verified: candidate.verified === true,
    }
}

export function createSettingsRepository(
    loadStore: StoreLoader = loadTauriStore
): SettingsRepository {
    let storePromise: ReturnType<StoreLoader> | undefined
    const getStore = () => {
        storePromise ??= loadStore(SETTINGS_STORE_PATH)
        return storePromise
    }

    return {
        load: async () => {
            const store = await getStore()
            const [accessToken, appearance, llmSettings] = await Promise.all([
                store.get<unknown>(ACCESS_TOKEN_KEY),
                store.get<unknown>(APPEARANCE_KEY),
                store.get<unknown>(LLM_SETTINGS_KEY),
            ])

            return {
                accessToken:
                    typeof accessToken === 'string' ? accessToken.trim() : '',
                appearance: normalizeAppearance(appearance),
                llm: parseLlmSettings(llmSettings),
            }
        },
        saveAccessToken: async (accessToken) => {
            const store = await getStore()
            await store.set(ACCESS_TOKEN_KEY, accessToken)
            await store.save()
        },
        saveAppearance: async (appearance) => {
            const store = await getStore()
            await store.set(APPEARANCE_KEY, appearance)
            await store.save()
        },
        saveLlmSettings: async (settings) => {
            const store = await getStore()
            await store.set(LLM_SETTINGS_KEY, {
                apiKey: settings.apiKey.trim(),
                baseUrl: settings.baseUrl.trim().replace(/\/+$/, ''),
                model: settings.model.trim(),
                reasoningEnabled: settings.reasoningEnabled,
                verified: settings.verified,
            } satisfies LlmSettings)
            await store.save()
        },
    }
}
