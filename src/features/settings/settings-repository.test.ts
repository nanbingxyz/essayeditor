import {describe, expect, it, vi} from 'vitest'

import type {KeyValueStore} from '@/shared/platform/store'

import {createSettingsRepository} from './settings-repository'

function createStore(values: Record<string, unknown>): KeyValueStore {
    return {
        delete: vi.fn(async (key) => delete values[key]),
        get: async <T,>(key: string) => values[key] as T | undefined,
        save: vi.fn(async () => undefined),
        set: vi.fn(async (key, value) => {
            values[key] = value
        }),
    }
}

describe('SettingsRepository', () => {
    it('normalizes loaded settings and invalid appearances', async () => {
        const repository = createSettingsRepository(async () =>
            createStore({
                accessToken: '  token  ',
                appearance: 'sepia',
                llmSettings: {
                    apiKey: ' llm-key ',
                    baseUrl: ' https://example.com/v1/ ',
                    model: ' model-a ',
                    verified: true,
                },
            })
        )

        await expect(repository.load()).resolves.toEqual({
            accessToken: 'token',
            appearance: 'system',
            llm: {
                apiKey: 'llm-key',
                baseUrl: 'https://example.com/v1',
                model: 'model-a',
                reasoningEnabled: true,
                verified: true,
            },
        })
    })

    it('persists setting changes explicitly', async () => {
        const store = createStore({})
        const repository = createSettingsRepository(async () => store)

        await repository.saveAccessToken('token')
        await repository.saveAppearance('dark')
        await repository.saveLlmSettings({
            apiKey: ' llm-key ',
            baseUrl: 'https://example.com/v1/',
            model: ' model ',
            reasoningEnabled: false,
            verified: true,
        })

        expect(store.set).toHaveBeenNthCalledWith(1, 'accessToken', 'token')
        expect(store.set).toHaveBeenNthCalledWith(2, 'appearance', 'dark')
        expect(store.set).toHaveBeenNthCalledWith(3, 'llmSettings', {
            apiKey: 'llm-key',
            baseUrl: 'https://example.com/v1',
            model: 'model',
            reasoningEnabled: false,
            verified: true,
        })
        expect(store.save).toHaveBeenCalledTimes(3)
    })
})
