import {
    loadTauriStore,
    type StoreLoader,
} from '@/shared/platform/store'

import {
    analysisCategories,
    type AnalysisCategory,
    type AnalysisIssue,
    type AnalysisSnapshot,
} from './model'

const ANALYSIS_STORE_PATH = 'analysis.bin'
const ANALYSIS_KEY_PREFIX = 'analysis:'
const categorySet = new Set<string>(analysisCategories)

export interface AnalysisRepository {
    clear: (documentKey: string) => Promise<void>
    load: (documentKey: string) => Promise<AnalysisSnapshot | null>
    move: (
        fromDocumentKey: string,
        toDocumentKey: string,
        expectedContentFingerprint?: string
    ) => Promise<void>
    save: (snapshot: AnalysisSnapshot) => Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isCategory(value: unknown): value is AnalysisCategory {
    return typeof value === 'string' && categorySet.has(value)
}

function parseIssue(value: unknown): AnalysisIssue | null {
    if (!isRecord(value)) {
        return null
    }
    const {
        category,
        dismissed,
        from,
        id,
        message,
        quote,
        severity,
        suggestion,
        to,
    } = value
    if (
        !isCategory(category) ||
        typeof dismissed !== 'boolean' ||
        typeof from !== 'number' ||
        !Number.isInteger(from) ||
        from < 0 ||
        typeof to !== 'number' ||
        !Number.isInteger(to) ||
        to < from ||
        typeof id !== 'string' ||
        !id ||
        typeof message !== 'string' ||
        !message ||
        typeof quote !== 'string' ||
        !quote ||
        (severity !== 'hard' && severity !== 'style') ||
        !(
            suggestion === undefined ||
            (typeof suggestion === 'string' && suggestion)
        )
    ) {
        return null
    }
    if (
        (severity === 'hard' && typeof suggestion !== 'string') ||
        (severity === 'style' && suggestion !== undefined) ||
        ((category.startsWith('1.') || category.startsWith('2.')) &&
            severity !== 'hard') ||
        (category.startsWith('4.') && severity !== 'style')
    ) {
        return null
    }
    return {
        category,
        dismissed,
        from,
        id,
        message,
        quote,
        severity,
        ...(typeof suggestion === 'string' ? {suggestion} : {}),
        to,
    }
}

export function parseAnalysisSnapshot(
    value: unknown
): AnalysisSnapshot | null {
    if (!isRecord(value)) {
        return null
    }
    const {
        checklistVersion,
        contentFingerprint,
        documentKey,
        issues,
        updatedAt,
        version,
    } = value
    if (
        version !== 1 ||
        typeof checklistVersion !== 'number' ||
        !Number.isInteger(checklistVersion) ||
        typeof contentFingerprint !== 'string' ||
        typeof documentKey !== 'string' ||
        !documentKey ||
        !Array.isArray(issues) ||
        typeof updatedAt !== 'number' ||
        !Number.isFinite(updatedAt)
    ) {
        return null
    }
    const parsedIssues = issues.map(parseIssue)
    if (parsedIssues.some((issue) => issue === null)) {
        return null
    }
    return {
        checklistVersion,
        contentFingerprint,
        documentKey,
        issues: parsedIssues.filter(
            (issue): issue is AnalysisIssue => issue !== null
        ),
        updatedAt,
        version,
    }
}

export function createAnalysisRepository(
    loadStore: StoreLoader = loadTauriStore
): AnalysisRepository {
    let storePromise: ReturnType<StoreLoader> | undefined
    let mutationQueue: Promise<void> = Promise.resolve()
    const getStore = () => {
        storePromise ??= loadStore(ANALYSIS_STORE_PATH)
        return storePromise
    }
    const getKey = (documentKey: string) =>
        `${ANALYSIS_KEY_PREFIX}${documentKey}`
    const enqueue = <T,>(mutation: () => Promise<T>) => {
        const result = mutationQueue.then(mutation)
        mutationQueue = result.then(
            () => undefined,
            () => undefined
        )
        return result
    }

    return {
        clear: (documentKey) =>
            enqueue(async () => {
                const store = await getStore()
                await store.delete(getKey(documentKey))
                await store.save()
            }),
        load: async (documentKey) => {
            await mutationQueue
            const store = await getStore()
            return parseAnalysisSnapshot(
                await store.get<unknown>(getKey(documentKey))
            )
        },
        move: (
            fromDocumentKey,
            toDocumentKey,
            expectedContentFingerprint
        ) =>
            enqueue(async () => {
                const store = await getStore()
                const snapshot = parseAnalysisSnapshot(
                    await store.get<unknown>(getKey(fromDocumentKey))
                )
                if (!snapshot) {
                    return
                }
                if (
                    expectedContentFingerprint === undefined ||
                    snapshot.contentFingerprint ===
                        expectedContentFingerprint
                ) {
                    await store.set(getKey(toDocumentKey), {
                        ...snapshot,
                        documentKey: toDocumentKey,
                    } satisfies AnalysisSnapshot)
                }
                await store.delete(getKey(fromDocumentKey))
                await store.save()
            }),
        save: (snapshot) =>
            enqueue(async () => {
                const store = await getStore()
                await store.set(getKey(snapshot.documentKey), snapshot)
                await store.save()
            }),
    }
}
