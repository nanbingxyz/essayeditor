import {describe, expect, it, vi} from 'vitest'

import {
    createEssayActivityClient,
    EssayActivityError,
} from './essay-activity-client'

function response(body: string, status = 200) {
    return new Response(body, {status})
}

describe('EssayActivityClient', () => {
    it('loads the user and heatmap with the expected request', async () => {
        const httpClient = vi.fn(async () =>
            response(
                JSON.stringify({
                    user: {
                        id: 42,
                        avatar: 'https://example.com/avatar.png',
                        displayName: 'Essay User',
                    },
                    heatmap: {
                        '2026-08-26': 2,
                        '2026-08-27': 0,
                    },
                })
            )
        )
        const client = createEssayActivityClient({
            baseUrl: 'https://api.essay.ink///',
            httpClient,
        })
        const signal = new AbortController().signal

        await expect(client.getHeatmap('token', signal)).resolves.toEqual({
            user: {
                id: '42',
                avatar: 'https://example.com/avatar.png',
                displayName: 'Essay User',
            },
            heatmap: {
                '2026-08-26': 2,
                '2026-08-27': 0,
            },
        })
        expect(httpClient).toHaveBeenCalledWith(
            'https://api.essay.ink/heatmap?with_user=true',
            {
                method: 'GET',
                headers: {Authorization: 'Bearer token'},
                signal,
            }
        )
    })

    it('preserves server errors and normalizes network failures', async () => {
        const serverErrorClient = createEssayActivityClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () =>
                response('{"error":"invalid token"}', 401),
        })
        const networkErrorClient = createEssayActivityClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => {
                throw new Error('offline')
            },
        })

        await expect(serverErrorClient.getHeatmap('token')).rejects.toThrow(
            'invalid token'
        )
        await expect(networkErrorClient.getHeatmap('token')).rejects.toEqual(
            expect.any(EssayActivityError)
        )
    })

    it('rejects invalid JSON, user data, date keys, and counts', async () => {
        const payloads = [
            'not-json',
            JSON.stringify({user: {}, heatmap: {}}),
            JSON.stringify({
                user: {id: 'user', avatar: 'avatar', displayName: 'User'},
                heatmap: {'August 27': 1},
            }),
            JSON.stringify({
                user: {id: 'user', avatar: 'avatar', displayName: 'User'},
                heatmap: {'2026-08-27': -1},
            }),
        ]

        for (const payload of payloads) {
            const client = createEssayActivityClient({
                baseUrl: 'https://api.essay.ink',
                httpClient: async () => response(payload),
            })
            await expect(client.getHeatmap('token')).rejects.toThrow(
                '服务器返回了无效的用户活动信息'
            )
        }
    })
})
