import {
    loadTauriStore,
    type StoreLoader,
} from '@/shared/platform/store'

import type {Appearance, SettingsSnapshot} from './model'

const SETTINGS_STORE_PATH = 'store.bin'
const ACCESS_TOKEN_KEY = 'accessToken'
const APPEARANCE_KEY = 'appearance'

export interface SettingsRepository {
    load: () => Promise<SettingsSnapshot>
    saveAccessToken: (accessToken: string) => Promise<void>
    saveAppearance: (appearance: Appearance) => Promise<void>
}

function normalizeAppearance(value: unknown): Appearance {
    return value === 'light' || value === 'dark' ? value : 'system'
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
            const [accessToken, appearance] = await Promise.all([
                store.get<unknown>(ACCESS_TOKEN_KEY),
                store.get<unknown>(APPEARANCE_KEY),
            ])

            return {
                accessToken:
                    typeof accessToken === 'string' ? accessToken.trim() : '',
                appearance: normalizeAppearance(appearance),
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
    }
}
