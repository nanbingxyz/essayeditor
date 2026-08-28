import {describe, expect, it, vi} from 'vitest'

import {createThemeClient, ThemeError} from './theme-client'

function response(body: string, status = 200) {
    return new Response(body, {status})
}

describe('ThemeClient', () => {
    it('loads numeric theme ids with authorization', async () => {
        const httpClient = vi.fn(async () =>
            response(
                JSON.stringify([
                    {id: 3, name: '技术', slug: 'tech', brief: '技术文章'},
                ])
            )
        )
        const client = createThemeClient({
            baseUrl: 'https://api.essay.ink///',
            httpClient,
        })

        await expect(client.list('token')).resolves.toEqual([
            {id: 3, name: '技术', slug: 'tech', brief: '技术文章'},
        ])
        expect(httpClient).toHaveBeenCalledWith(
            'https://api.essay.ink/themes',
            expect.objectContaining({
                method: 'GET',
                headers: {Authorization: 'Bearer token'},
            })
        )
    })

    it('rejects string ids, duplicates, and malformed responses', async () => {
        const stringId = createThemeClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () =>
                response('[{"id":"3","name":"A","slug":"a","brief":""}]'),
        })
        const duplicate = createThemeClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () =>
                response('[{"id":3,"name":"A","slug":"a","brief":""},{"id":3,"name":"B","slug":"b","brief":""}]'),
        })

        await expect(stringId.list('token')).rejects.toThrow(
            '服务器返回了无效的频道列表'
        )
        await expect(duplicate.list('token')).rejects.toThrow(
            '服务器返回了无效的频道列表'
        )
    })

    it('normalizes network and server failures', async () => {
        const server = createThemeClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => response('{"error":"denied"}', 403),
        })
        const network = createThemeClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => {
                throw new Error('offline')
            },
        })

        await expect(server.list('token')).rejects.toThrow('denied')
        await expect(network.list('token')).rejects.toEqual(
            expect.any(ThemeError)
        )
    })
})
