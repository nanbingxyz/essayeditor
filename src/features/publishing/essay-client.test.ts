import {describe, expect, it, vi} from 'vitest'

import {createEssayClient, EssayPublishError} from './essay-client'

function response(body: string, status = 200) {
    return new Response(body, {status})
}

describe('EssayClient', () => {
    it('publishes content with the expected request', async () => {
        const httpClient = vi.fn(async () => response('{"id":"essay-id"}'))
        const client = createEssayClient(httpClient)

        await expect(client.publish('content', 'token')).resolves.toEqual({
            id: 'essay-id',
        })
        expect(httpClient).toHaveBeenCalledWith(
            'https://api.essay.ink/essays',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({content: 'content'}),
                headers: expect.objectContaining({
                    Authorization: 'Bearer token',
                }),
            })
        )
    })

    it('preserves a server-provided error message', async () => {
        const client = createEssayClient(async () =>
            response('{"error":"invalid token"}', 401)
        )

        await expect(client.publish('content', 'token')).rejects.toThrow(
            'invalid token'
        )
    })

    it('normalizes network, non-JSON, and invalid success responses', async () => {
        const networkClient = createEssayClient(async () => {
            throw new Error('offline')
        })
        const invalidErrorClient = createEssayClient(async () =>
            response('bad gateway', 502)
        )
        const invalidSuccessClient = createEssayClient(async () =>
            response('{"id":""}')
        )

        await expect(networkClient.publish('', '')).rejects.toEqual(
            expect.any(EssayPublishError)
        )
        await expect(invalidErrorClient.publish('', '')).rejects.toThrow(
            '请检查网络或 API Key 是否正确'
        )
        await expect(invalidSuccessClient.publish('', '')).rejects.toThrow(
            '服务器返回了无效的文章信息'
        )
    })
})
