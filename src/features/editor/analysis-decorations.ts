import {
    StateEffect,
    StateField,
    type EditorState,
    type Extension,
} from '@codemirror/state'
import {
    Decoration,
    type DecorationSet,
    EditorView,
    hoverTooltip,
    ViewPlugin,
} from '@codemirror/view'

import type {AnalysisIssue} from '@/features/analysis/model'

const setAnalysisIssues = StateEffect.define<AnalysisIssue[]>()
const dismissAnalysisIssue = StateEffect.define<string>()

interface AnalysisFieldState {
    decorations: DecorationSet
    issues: AnalysisIssue[]
}

function isIssueActive(
    view: EditorView,
    issue: AnalysisIssue
) {
    return (
        !issue.dismissed &&
        issue.from >= 0 &&
        issue.to <= view.state.doc.length &&
        view.state.doc.sliceString(issue.from, issue.to) === issue.quote
    )
}

function buildDecorations(
    state: EditorState,
    issues: AnalysisIssue[]
): DecorationSet {
    const groups = new Map<string, AnalysisIssue[]>()
    for (const issue of issues) {
        if (
            issue.dismissed ||
            issue.from < 0 ||
            issue.to > state.doc.length ||
            issue.from === issue.to ||
            state.doc.sliceString(issue.from, issue.to) !== issue.quote
        ) {
            continue
        }
        const key = `${issue.from}:${issue.to}`
        const group = groups.get(key) ?? []
        group.push(issue)
        groups.set(key, group)
    }

    const ranges = [...groups.values()]
        .map((group) => {
            const first = group[0]
            const severity = group.some(
                (issue) => issue.severity === 'hard'
            )
                ? 'hard'
                : 'style'
            return Decoration.mark({
                class: `cm-analysis-issue cm-analysis-${severity}`,
            }).range(first.from, first.to)
        })
        .sort((left, right) => left.from - right.from || left.to - right.to)
    return Decoration.set(ranges)
}

const analysisIssueField = StateField.define<AnalysisFieldState>({
    create: () => ({
        decorations: Decoration.none,
        issues: [],
    }),
    update(value, transaction) {
        const issues = value.issues
        let next = transaction.docChanged
            ? issues.map((issue) => ({
                  ...issue,
                  from: transaction.changes.mapPos(issue.from, -1),
                  to: transaction.changes.mapPos(issue.to, 1),
              }))
            : issues
        for (const effect of transaction.effects) {
            if (effect.is(setAnalysisIssues)) {
                next = effect.value
            } else if (effect.is(dismissAnalysisIssue)) {
                next = next.filter((issue) => issue.id !== effect.value)
            }
        }
        return {
            decorations: buildDecorations(transaction.state, next),
            issues: next,
        }
    },
    provide: (field) =>
        EditorView.decorations.from(
            field,
            (value) => value.decorations
        ),
})

function createTooltip(view: EditorView, pos: number) {
    const issues = view.state
        .field(analysisIssueField)
        .issues
        .filter(
            (issue) =>
                isIssueActive(view, issue) &&
                pos >= issue.from &&
                pos <= issue.to
        )
    if (!issues.length) {
        return null
    }
    const from = Math.min(...issues.map((issue) => issue.from))
    const to = Math.max(...issues.map((issue) => issue.to))
    return {
        pos: from,
        end: to,
        above: true,
        create() {
            const dom = document.createElement('div')
            dom.className = 'cm-analysis-tooltip'
            dom.setAttribute('role', 'dialog')
            dom.setAttribute('aria-label', '写作分析问题')
            const list = document.createElement('ul')
            for (const issue of issues) {
                const item = document.createElement('li')
                const header = document.createElement('div')
                header.className = 'cm-analysis-tooltip-header'
                const badge = document.createElement('span')
                badge.className = `cm-analysis-badge is-${issue.severity}`
                badge.textContent =
                    issue.severity === 'hard' ? '硬伤' : '风格'
                const category = document.createElement('span')
                category.className = 'cm-analysis-category'
                // category.textContent = issue.category
                const remove = document.createElement('button')
                remove.type = 'button'
                remove.textContent = '删除'
                remove.setAttribute('aria-label', `删除问题 ${issue.category}`)
                remove.addEventListener('mousedown', (event) =>
                    event.preventDefault()
                )
                remove.addEventListener('click', () => {
                    dismissEditorAnalysisIssue(view, issue.id)
                })
                header.append(badge, category, remove)
                const message = document.createElement('p')
                message.textContent = issue.message
                item.append(header, message)
                if (issue.suggestion) {
                    const suggestion = document.createElement('p')
                    suggestion.className = 'cm-analysis-suggestion'
                    suggestion.textContent = issue.suggestion
                    item.append(suggestion)
                }
                list.append(item)
            }
            dom.append(list)
            return {dom}
        },
    }
}

export function setEditorAnalysisIssues(
    view: EditorView,
    issues: AnalysisIssue[]
) {
    view.dispatch({effects: setAnalysisIssues.of(issues)})
}

export function dismissEditorAnalysisIssue(
    view: EditorView,
    issueId: string
) {
    view.dispatch({effects: dismissAnalysisIssue.of(issueId)})
}

export function analysisDecorations(
    onChange: (issues: AnalysisIssue[]) => void
): Extension {
    return [
        analysisIssueField,
        hoverTooltip(createTooltip, {hoverTime: 150}),
        ViewPlugin.fromClass(
            class {
                update(update: {
                    docChanged: boolean
                    startState: EditorView['state']
                    state: EditorView['state']
                }) {
                    const before = update.startState.field(
                        analysisIssueField
                    ).issues
                    const after = update.state.field(
                        analysisIssueField
                    ).issues
                    if (
                        before !== after &&
                        (update.docChanged || after.length < before.length)
                    ) {
                        onChange(after)
                    }
                }
            }
        ),
    ]
}
