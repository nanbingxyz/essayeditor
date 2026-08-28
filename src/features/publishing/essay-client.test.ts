import {describe, expect, it, vi} from 'vitest'

import {createEssayClient, EssayPublishError} from './essay-client'

function response(body: string, status = 200) {
    return new Response(body, {status})
}

describe('EssayClient', () => {
    it('publishes content with the expected request', async () => {
        const httpClient = vi.fn(async () => response('{"id":"essay-id"}'))
        const client = createEssayClient({
            baseUrl: 'https://api.essay.ink///',
            httpClient,
        })

        await expect(
            client.publish('content', 8, true, 'token')
        ).resolves.toEqual({
            id: 'essay-id',
        })
        expect(httpClient).toHaveBeenCalledWith(
            'https://api.essay.ink/essays',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    content: 'content',
                    theme_id: 8,
                    is_private: true,
                }),
                headers: expect.objectContaining({
                    Authorization: 'Bearer token',
                }),
            })
        )
    })

    it('preserves a server-provided error message', async () => {
        const client = createEssayClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () =>
                response('{"error":"invalid token"}', 401),
        })

        await expect(
            client.publish('content', null, false, 'token')
        ).rejects.toThrow('invalid token')
    })

    it('normalizes network, non-JSON, and invalid success responses', async () => {
        const networkClient = createEssayClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => {
                throw new Error('offline')
            },
        })
        const invalidErrorClient = createEssayClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => response('bad gateway', 502),
        })
        const invalidSuccessClient = createEssayClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => response('{"id":""}'),
        })

        await expect(networkClient.publish('', null, false, '')).rejects.toEqual(
            expect.any(EssayPublishError)
        )
        await expect(invalidErrorClient.publish('', null, false, '')).rejects.toThrow(
            '请检查网络或 API Key 是否正确'
        )
        await expect(invalidSuccessClient.publish('', null, false, '')).rejects.toThrow(
            '服务器返回了无效的文章信息'
        )
    })
})
