interface PublishedDocumentStatusOptions {
    baselineContent: string
    baselineThemeId: number | null
    currentContent: string
    currentThemeId: number | null
    draftReady: boolean
    hasKnownLocalChanges: boolean
}

export function getPublishedDocumentStatus({
    baselineContent,
    baselineThemeId,
    currentContent,
    currentThemeId,
    draftReady,
    hasKnownLocalChanges,
}: PublishedDocumentStatusOptions) {
    if (!draftReady) {
        return hasKnownLocalChanges ? 'modified' : 'published'
    }

    return currentContent === baselineContent &&
        currentThemeId === baselineThemeId
        ? 'published'
        : 'modified'
}
