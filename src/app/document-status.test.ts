import {describe, expect, it} from 'vitest'

import {getPublishedDocumentStatus} from './document-status'

describe('getPublishedDocumentStatus', () => {
    it('uses the hydrated list status while the selected draft is loading', () => {
        expect(
            getPublishedDocumentStatus({
                baselineContent: 'next published article',
                currentContent: 'previous local edit',
                draftReady: false,
                hasKnownLocalChanges: false,
            })
        ).toBe('published')

        expect(
            getPublishedDocumentStatus({
                baselineContent: 'next published article',
                currentContent: 'previous published article',
                draftReady: false,
                hasKnownLocalChanges: true,
            })
        ).toBe('modified')
    })

    it('compares restored content after the selected draft is ready', () => {
        expect(
            getPublishedDocumentStatus({
                baselineContent: 'published article',
                currentContent: 'published article',
                draftReady: true,
                hasKnownLocalChanges: true,
            })
        ).toBe('published')

        expect(
            getPublishedDocumentStatus({
                baselineContent: 'published article',
                currentContent: 'local edit',
                draftReady: true,
                hasKnownLocalChanges: false,
            })
        ).toBe('modified')
    })
})
