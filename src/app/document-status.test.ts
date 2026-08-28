import {describe, expect, it} from 'vitest'

import {getPublishedDocumentStatus} from './document-status'

describe('getPublishedDocumentStatus', () => {
    it('uses the hydrated list status while the selected draft is loading', () => {
        expect(
            getPublishedDocumentStatus({
                baselineContent: 'next published article',
                baselineThemeId: null,
                currentContent: 'previous local edit',
                currentThemeId: null,
                draftReady: false,
                hasKnownLocalChanges: false,
            })
        ).toBe('published')

        expect(
            getPublishedDocumentStatus({
                baselineContent: 'next published article',
                baselineThemeId: null,
                currentContent: 'previous published article',
                currentThemeId: null,
                draftReady: false,
                hasKnownLocalChanges: true,
            })
        ).toBe('modified')
    })

    it('compares restored content after the selected draft is ready', () => {
        expect(
            getPublishedDocumentStatus({
                baselineContent: 'published article',
                baselineThemeId: null,
                currentContent: 'published article',
                currentThemeId: null,
                draftReady: true,
                hasKnownLocalChanges: true,
            })
        ).toBe('published')

        expect(
            getPublishedDocumentStatus({
                baselineContent: 'published article',
                baselineThemeId: null,
                currentContent: 'local edit',
                currentThemeId: null,
                draftReady: true,
                hasKnownLocalChanges: false,
            })
        ).toBe('modified')
    })

    it('treats a theme-only change as modified', () => {
        expect(
            getPublishedDocumentStatus({
                baselineContent: 'published article',
                baselineThemeId: 1,
                currentContent: 'published article',
                currentThemeId: 2,
                draftReady: true,
                hasKnownLocalChanges: false,
            })
        ).toBe('modified')
    })
})
