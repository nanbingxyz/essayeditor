export const analysisCategories = [
    '1.1',
    '1.2',
    '1.3',
    '1.4',
    '2.1',
    '2.2',
    '2.3',
    '2.4',
    '2.5',
    '2.6',
    '2.7',
    '3.1',
    '3.2',
    '3.3',
    '3.4',
    '3.5',
    '3.6',
    '4.1',
    '4.2',
    '4.3',
    '4.4',
    '4.5',
    '4.6',
] as const

export type AnalysisCategory = (typeof analysisCategories)[number]
export type AnalysisSeverity = 'hard' | 'style'

export interface AnalysisIssue {
    category: AnalysisCategory
    dismissed: boolean
    from: number
    id: string
    message: string
    quote: string
    severity: AnalysisSeverity
    suggestion?: string
    to: number
}

export interface AnalysisSnapshot {
    checklistVersion: number
    contentFingerprint: string
    documentKey: string
    issues: AnalysisIssue[]
    updatedAt: number
    version: 1
}

export interface AnalysisChunk {
    from: number
    id: string
    text: string
}
