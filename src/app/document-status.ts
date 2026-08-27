interface PublishedDocumentStatusOptions {
    baselineContent: string
    currentContent: string
    draftReady: boolean
    hasKnownLocalChanges: boolean
}

export function getPublishedDocumentStatus({
    baselineContent,
    currentContent,
    draftReady,
    hasKnownLocalChanges,
}: PublishedDocumentStatusOptions) {
    if (!draftReady) {
        return hasKnownLocalChanges ? 'modified' : 'published'
    }

    return currentContent === baselineContent ? 'published' : 'modified'
}
