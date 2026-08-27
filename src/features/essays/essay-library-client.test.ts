import {describe, expect, it, vi} from 'vitest'

import {
    createEssayLibraryClient,
    EssayLibraryError,
} from './essay-library-client'

function response(body = '', status = 200) {
    return new Response(body, {status})
}

describe('EssayLibraryClient', () => {
    it('loads a dated page for the current user', async () => {
        const httpClient = vi.fn(async () =>
            response(JSON.stringify([{id: 7, content: '# Hello'}]))
        )
        const client = createEssayLibraryClient({
            baseUrl: 'https://api.essay.ink///',
            httpClient,
        })
        const signal = new AbortController().signal

        await expect(
            client.list({
                accessToken: 'token',
                date: '2026-08-27',
                page: 2,
                signal,
                userId: 'user id',
            })
        ).resolves.toEqual([{id: '7', content: '# Hello'}])
        expect(httpClient).toHaveBeenCalledWith(
            'https://api.essay.ink/essays?page=2&uid=user+id&date=2026-08-27',
            {
                method: 'GET',
                headers: {Authorization: 'Bearer token'},
                signal,
            }
        )
    })

    it('updates only the content of an encoded essay id', async () => {
        const httpClient = vi.fn(
            async () => new Response(null, {status: 204})
        )
        const client = createEssayLibraryClient({
            baseUrl: 'https://api.essay.ink',
            httpClient,
        })

        await client.update('essay/id', 'updated', 'token')
        expect(httpClient).toHaveBeenCalledWith(
            'https://api.essay.ink/essays/essay%2Fid',
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify({content: 'updated'}),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer token',
                },
            })
        )
    })

    it('deletes an encoded essay id with authorization', async () => {
        const httpClient = vi.fn(
            async () => new Response(null, {status: 204})
        )
        const client = createEssayLibraryClient({
            baseUrl: 'https://api.essay.ink',
            httpClient,
        })
        const signal = new AbortController().signal

        await client.remove('essay/id', 'token', signal)
        expect(httpClient).toHaveBeenCalledWith(
            'https://api.essay.ink/essays/essay%2Fid',
            {
                method: 'DELETE',
                headers: {Authorization: 'Bearer token'},
                signal,
            }
        )
    })

    it('normalizes delete failures', async () => {
        const serverErrorClient = createEssayLibraryClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => response('{"error":"denied"}', 403),
        })
        const networkClient = createEssayLibraryClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => {
                throw new Error('offline')
            },
        })

        await expect(
            serverErrorClient.remove('essay', 'token')
        ).rejects.toThrow('denied')
        await expect(
            networkClient.remove('essay', 'token')
        ).rejects.toEqual(expect.any(EssayLibraryError))
    })

    it('rejects malformed lists and normalizes request failures', async () => {
        const malformedClient = createEssayLibraryClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => response('[{"id":"missing-content"}]'),
        })
        const serverErrorClient = createEssayLibraryClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => response('{"error":"denied"}', 403),
        })
        const networkClient = createEssayLibraryClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => {
                throw new Error('offline')
            },
        })

        await expect(
            malformedClient.list({
                accessToken: 'token',
                page: 1,
                userId: 'user',
            })
        ).rejects.toThrow('服务器返回了无效的文章列表')
        await expect(
            serverErrorClient.list({
                accessToken: 'token',
                page: 1,
                userId: 'user',
            })
        ).rejects.toThrow('denied')
        await expect(
            networkClient.list({
                accessToken: 'token',
                page: 1,
                userId: 'user',
            })
        ).rejects.toEqual(expect.any(EssayLibraryError))
    })
})
