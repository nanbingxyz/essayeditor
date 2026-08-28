interface PublishedDocumentStatusOptions {
    baselineContent: string
    baselineIsPrivate?: boolean
    baselineThemeId: number | null
    currentContent: string
    currentIsPrivate?: boolean
    currentThemeId: number | null
    draftReady: boolean
    hasKnownLocalChanges: boolean
}

export function getPublishedDocumentStatus({
    baselineContent,
    baselineIsPrivate = false,
    baselineThemeId,
    currentContent,
    currentIsPrivate = false,
    currentThemeId,
    draftReady,
    hasKnownLocalChanges,
}: PublishedDocumentStatusOptions) {
    if (!draftReady) {
        return hasKnownLocalChanges ? 'modified' : 'published'
    }

    return currentContent === baselineContent &&
        currentIsPrivate === baselineIsPrivate &&
        currentThemeId === baselineThemeId
        ? 'published'
        : 'modified'
}
