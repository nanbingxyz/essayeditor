import {describe, expect, it, vi} from 'vitest'

import type {HttpClient} from '@/shared/platform/http'

import {
    createOpenAiCompatibleClient,
    OpenAiCompatibleError,
} from './openai-client'

function jsonResponse(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        headers: {'Content-Type': 'application/json'},
        status,
    })
}

describe('OpenAI-compatible client', () => {
    it('discovers and sorts model ids', async () => {
        const httpClient = vi.fn(async () =>
            jsonResponse({
                data: [{id: 'z-model'}, {id: 'a-model'}, {id: 'a-model'}],
            })
        ) as HttpClient
        const client = createOpenAiCompatibleClient(httpClient)

        await expect(
            client.listModels({
                apiKey: 'secret',
                baseUrl: 'https://example.com/v1/',
            })
        ).resolves.toEqual(['a-model', 'z-model'])
        expect(httpClient).toHaveBeenCalledWith(
            'https://example.com/v1/models',
            expect.objectContaining({
                headers: {Authorization: 'Bearer secret'},
            })
        )
    })

    it('sends chat completions and accepts array content', async () => {
        const httpClient = vi.fn(async () =>
            jsonResponse({
                choices: [
                    {
                        message: {
                            content: [
                                {type: 'text', text: '{"issues":'},
                                {type: 'text', text: '[]}'},
                            ],
                        },
                    },
                ],
            })
        ) as HttpClient
        const client = createOpenAiCompatibleClient(httpClient)

        await expect(
            client.complete(
                {
                    apiKey: 'key',
                    baseUrl: 'https://example.com/v1',
                    model: 'test-model',
                },
                [{role: 'user', content: 'text'}]
            )
        ).resolves.toBe('{"issues":[]}')

        const init = vi.mocked(httpClient).mock.calls[0][1]
        expect(JSON.parse(String(init?.body))).toEqual({
            model: 'test-model',
            messages: [{role: 'user', content: 'text'}],
        })
    })

    it('surfaces provider error messages', async () => {
        const client = createOpenAiCompatibleClient(
            vi.fn(async () =>
                jsonResponse({error: {message: 'invalid model'}}, 400)
            )
        )

        await expect(
            client.testConnection({
                apiKey: 'key',
                baseUrl: 'https://example.com/v1',
                model: 'missing',
            })
        ).rejects.toEqual(
            new OpenAiCompatibleError('invalid model')
        )
    })
})
