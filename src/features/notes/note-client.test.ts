import {describe, expect, it, vi} from 'vitest'

import {createNoteClient, NoteClientError} from './note-client'

function response(body = '', status = 200) {
    return new Response(status === 204 ? null : body, {status})
}

describe('NoteClient', () => {
    it('loads a page and normalizes folders, comments, and timestamps', async () => {
        const httpClient = vi.fn(async () =>
            response(
                JSON.stringify({
                    meta: {page: 2, limit: 20, hasMore: true},
                    data: [
                        {
                            id: 'note-1',
                            content: '# Note',
                            created_at: '2026-08-28T08:00:00Z',
                            folder: {id: 'folder-1', name: 'Work'},
                            comments: [
                                {
                                    id: 7,
                                    content: 'Remember this',
                                    created_at: '2026-08-28T09:00:00Z',
                                },
                            ],
                        },
                    ],
                })
            )
        )
        const client = createNoteClient({
            baseUrl: 'https://api.essay.ink///',
            httpClient,
        })

        await expect(client.list(2, 'token')).resolves.toEqual({
            meta: {page: 2, limit: 20, hasMore: true},
            data: [
                {
                    id: 'note-1',
                    content: '# Note',
                    createdAt: '2026-08-28T08:00:00Z',
                    folder: {id: 'folder-1', name: 'Work'},
                    comments: [
                        {
                            id: 7,
                            content: 'Remember this',
                            createdAt: '2026-08-28T09:00:00Z',
                        },
                    ],
                },
            ],
        })
        expect(httpClient).toHaveBeenCalledWith(
            'https://api.essay.ink/notes?page=2&limit=20',
            {
                method: 'GET',
                headers: {Authorization: 'Bearer token'},
                signal: undefined,
            }
        )
    })

    it('loads note folders', async () => {
        const client = createNoteClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () =>
                response('[{"id":"one","name":"Folder one"}]'),
        })

        await expect(client.listFolders('token')).resolves.toEqual([
            {id: 'one', name: 'Folder one'},
        ])
    })

    it('uses the required create and update folder field names', async () => {
        const httpClient = vi
            .fn()
            .mockResolvedValueOnce(response('{"id":"created"}', 201))
            .mockResolvedValueOnce(response('', 204))
            .mockResolvedValueOnce(response('', 204))
        const client = createNoteClient({
            baseUrl: 'https://api.essay.ink',
            httpClient,
        })

        await expect(
            client.create('new note', null, 'token')
        ).resolves.toBe('created')
        await client.update('note/id', 'updated', 'folder', 'token')
        await client.remove('note/id', 'token')

        expect(httpClient.mock.calls[0][1]).toEqual(
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({content: 'new note', folder_id: null}),
            })
        )
        expect(httpClient.mock.calls[1]).toEqual([
            'https://api.essay.ink/notes/note%2Fid',
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify({
                    content: 'updated',
                    folderId: 'folder',
                }),
            }),
        ])
        expect(httpClient.mock.calls[2]).toEqual([
            'https://api.essay.ink/notes/note%2Fid',
            expect.objectContaining({method: 'DELETE'}),
        ])
    })

    it('rejects malformed data and normalizes request errors', async () => {
        const malformed = createNoteClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () =>
                response('{"meta":{"page":1,"limit":20,"hasMore":false},"data":[{"id":"bad"}]}'),
        })
        const offline = createNoteClient({
            baseUrl: 'https://api.essay.ink',
            httpClient: async () => {
                throw new Error('offline')
            },
        })

        await expect(malformed.list(1, 'token')).rejects.toThrow(
            '服务器返回了无效的笔记列表'
        )
        await expect(offline.listFolders('token')).rejects.toEqual(
            expect.any(NoteClientError)
        )
    })
})
