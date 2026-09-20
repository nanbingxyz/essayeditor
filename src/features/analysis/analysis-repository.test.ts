import {describe, expect, it, vi} from 'vitest'

import type {KeyValueStore} from '@/shared/platform/store'

import {
    createAnalysisRepository,
    parseAnalysisSnapshot,
} from './analysis-repository'
import type {AnalysisSnapshot} from './model'

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

const snapshot: AnalysisSnapshot = {
    checklistVersion: 1,
    contentFingerprint: '4:abcd',
    documentKey: 'local:first',
    issues: [
        {
            category: '1.1',
            dismissed: false,
            from: 0,
            id: 'issue-1',
            message: '同音字误用',
            quote: '安祥',
            severity: 'hard',
            suggestion: '“安祥”应该是“安详”',
            to: 2,
        },
    ],
    updatedAt: 100,
    version: 1,
}

describe('AnalysisRepository', () => {
    it('saves, loads, moves, and clears per-document analysis', async () => {
        const values: Record<string, unknown> = {}
        const store = createStore(values)
        const repository = createAnalysisRepository(async () => store)

        await repository.save(snapshot)
        await expect(repository.load('local:first')).resolves.toEqual(
            snapshot
        )

        await repository.move('local:first', 'essay:published')
        await expect(repository.load('local:first')).resolves.toBeNull()
        await expect(repository.load('essay:published')).resolves.toEqual({
            ...snapshot,
            documentKey: 'essay:published',
        })

        await repository.clear('essay:published')
        await expect(
            repository.load('essay:published')
        ).resolves.toBeNull()
    })

    it('rejects malformed persisted data', () => {
        expect(
            parseAnalysisSnapshot({
                ...snapshot,
                issues: [{...snapshot.issues[0], severity: 'unknown'}],
            })
        ).toBeNull()
    })
})
