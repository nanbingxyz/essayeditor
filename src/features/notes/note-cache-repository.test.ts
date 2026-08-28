import {describe, expect, it, vi} from 'vitest'

import type {KeyValueStore} from '@/shared/platform/store'

import {createNoteCacheRepository} from './note-cache-repository'
import type {Note} from './note-client'

function createStore() {
    const values = new Map<string, unknown>()
    const store: KeyValueStore = {
        delete: vi.fn(async (key) => values.delete(key)),
        get: async <T,>(key: string) => values.get(key) as T | undefined,
        save: vi.fn(async () => undefined),
        set: vi.fn(async (key, value) => {
            values.set(key, value)
        }),
    }
    return {store, values}
}

const note: Note = {
    id: 'note',
    content: '# Cached',
    createdAt: '2026-08-28T08:00:00Z',
    folder: {id: 'folder', name: 'Folder'},
    comments: [
        {
            id: 1,
            content: 'Comment',
            createdAt: '2026-08-28T09:00:00Z',
        },
    ],
}

describe('note cache repository', () => {
    it('isolates cached notes by API key fingerprint', async () => {
        const {store, values} = createStore()
        const repository = createNoteCacheRepository({
            fingerprint: async (token) =>
                token === 'secret-a' ? 'account-a' : 'account-b',
            loadStore: async () => store,
        })

        await Promise.all([
            repository.saveFolders(
                'secret-a',
                [{id: 'folder', name: 'Folder'}],
                100
            ),
            repository.saveNotes('secret-a', [note], true, 200),
        ])

        await expect(repository.load('secret-a')).resolves.toEqual({
            folders: [{id: 'folder', name: 'Folder'}],
            foldersFetchedAt: 100,
            notes: [note],
            notesFetchedAt: 200,
            notesHasMore: true,
        })
        await expect(repository.load('secret-b')).resolves.toBeNull()
        expect(JSON.stringify(values.get('noteSnapshots'))).not.toContain(
            'secret-a'
        )
    })

    it('returns defensive copies', async () => {
        const {store} = createStore()
        const repository = createNoteCacheRepository({
            fingerprint: async () => 'account',
            loadStore: async () => store,
        })
        await repository.saveNotes('token', [note], false, 200)
        const first = await repository.load('token')
        first!.notes[0].content = 'mutated'

        await expect(repository.load('token')).resolves.toMatchObject({
            notes: [{content: '# Cached'}],
        })
    })
})
