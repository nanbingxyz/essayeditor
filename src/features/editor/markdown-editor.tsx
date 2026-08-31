import {defaultKeymap, history, historyKeymap} from '@codemirror/commands'
import {markdown, markdownLanguage} from '@codemirror/lang-markdown'
import {Compartment, EditorState, Transaction} from '@codemirror/state'
import {
    drawSelection,
    EditorView,
    keymap,
    placeholder as editorPlaceholder,
} from '@codemirror/view'
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
} from 'react'

import {tauriDesktopAdapter} from '@/shared/platform/desktop'

import {
    markdownFormatKeymap,
    markdownLivePreview,
} from './markdown-live-preview'

export interface MarkdownEditorHandle {
    focus: () => void
    getValue: () => string
    requestMeasure: () => void
    setReadOnly: (readOnly: boolean) => void
    setValue: (value: string) => void
}

export interface MarkdownEditorReadyMetrics {
    prepareTransactionDuration: number
    requestMeasureDuration: number
    resetScrollDuration: number
    totalDuration: number
    updateViewDuration: number
}

interface MarkdownEditorProps {
    ariaLabel?: string
    disabled?: boolean
    documentKey?: string
    initialValue?: string
    onChange?: (content: string) => void
    onReady?: (
        documentKey: string,
        metrics?: MarkdownEditorReadyMetrics
    ) => void
    placeholder?: string
    value?: string
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
    (
        {
            ariaLabel = '文章内容',
            disabled = false,
            documentKey = 'default',
            initialValue = '',
            onChange,
            onReady,
            placeholder = '从这里开始...',
            value,
        },
        ref
    ) => {
        const rootRef = useRef<HTMLDivElement>(null)
        const viewRef = useRef<EditorView>()
        const onChangeRef = useRef(onChange)
        const onReadyRef = useRef(onReady)
        const historyCompartmentRef = useRef(new Compartment())
        const readOnlyCompartmentRef = useRef(new Compartment())
        const applyingValueRef = useRef(false)
        const currentDocumentKeyRef = useRef(documentKey)
        const readyFrameRef = useRef<number>()
        const configRef = useRef({ariaLabel, disabled, placeholder})
        const editorValue = value ?? initialValue

        onChangeRef.current = onChange
        onReadyRef.current = onReady
        configRef.current = {ariaLabel, disabled, placeholder}

        const createState = (content: string) => {
            const config = configRef.current
            return EditorState.create({
                doc: content,
                extensions: [
                    historyCompartmentRef.current.of(history()),
                    drawSelection(),
                    EditorView.lineWrapping,
                    markdown({base: markdownLanguage}),
                    editorPlaceholder(config.placeholder),
                    keymap.of([
                        ...markdownFormatKeymap,
                        ...defaultKeymap,
                        ...historyKeymap,
                    ]),
                    markdownLivePreview({
                        openExternal: (url) =>
                            void tauriDesktopAdapter.openExternal(url),
                        revealSyntaxOnInitialSelection: false,
                    }),
                    EditorView.contentAttributes.of({
                        'aria-label': config.ariaLabel,
                        'aria-multiline': 'true',
                    }),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged && !applyingValueRef.current) {
                            onChangeRef.current?.(
                                update.state.doc.toString()
                            )
                        }
                    }),
                    readOnlyCompartmentRef.current.of([
                        EditorState.readOnly.of(config.disabled),
                        EditorView.editable.of(!config.disabled),
                    ]),
                ],
            })
        }

        const reportReady = (
            key: string,
            metrics?: MarkdownEditorReadyMetrics
        ) => {
            if (readyFrameRef.current !== undefined) {
                cancelAnimationFrame(readyFrameRef.current)
            }
            readyFrameRef.current = requestAnimationFrame(() => {
                readyFrameRef.current = undefined
                onReadyRef.current?.(key, metrics)
            })
        }

        const setReadOnly = (readOnly: boolean) => {
            const view = viewRef.current
            if (!view) {
                return
            }

            view.dispatch({
                effects: readOnlyCompartmentRef.current.reconfigure([
                    EditorState.readOnly.of(readOnly),
                    EditorView.editable.of(!readOnly),
                ]),
            })
        }

        useImperativeHandle(
            ref,
            () => ({
                focus: () => viewRef.current?.focus(),
                getValue: () => viewRef.current?.state.doc.toString() ?? '',
                requestMeasure: () => viewRef.current?.requestMeasure(),
                setReadOnly,
                setValue: (nextValue: string) => {
                    const view = viewRef.current
                    if (!view) {
                        return
                    }

                    const currentValue = view.state.doc.toString()
                    if (currentValue === nextValue) {
                        return
                    }

                    view.dispatch({
                        changes: {
                            from: 0,
                            to: view.state.doc.length,
                            insert: nextValue,
                        },
                        selection: {anchor: 0},
                        scrollIntoView: true,
                    })
                },
            }),
            []
        )

        useLayoutEffect(() => {
            const root = rootRef.current
            if (!root) {
                return
            }

            const view = new EditorView({
                parent: root,
                state: createState(editorValue),
            })

            viewRef.current = view
            currentDocumentKeyRef.current = documentKey
            reportReady(documentKey)
            return () => {
                if (readyFrameRef.current !== undefined) {
                    cancelAnimationFrame(readyFrameRef.current)
                }
                view.destroy()
                viewRef.current = undefined
            }
        }, [])

        useLayoutEffect(() => {
            const view = viewRef.current
            if (!view) {
                return
            }

            if (currentDocumentKeyRef.current !== documentKey) {
                const switchStartedAt = performance.now()
                const resetScrollStartedAt = performance.now()
                view.scrollDOM.scrollTop = 0
                view.scrollDOM.scrollLeft = 0
                const resetScrollDuration =
                    performance.now() - resetScrollStartedAt
                applyingValueRef.current = true
                const prepareTransactionStartedAt = performance.now()
                const replaceDocument = view.state.update({
                    annotations: Transaction.addToHistory.of(false),
                    changes: {
                        from: 0,
                        to: view.state.doc.length,
                        insert: editorValue,
                    },
                    effects: historyCompartmentRef.current.reconfigure([]),
                    selection: {anchor: 0},
                })
                const restoreHistory = replaceDocument.state.update({
                    effects: historyCompartmentRef.current.reconfigure(
                        history()
                    ),
                })
                const prepareTransactionDuration =
                    performance.now() - prepareTransactionStartedAt
                const updateViewStartedAt = performance.now()
                view.update([replaceDocument, restoreHistory])
                const updateViewDuration =
                    performance.now() - updateViewStartedAt
                applyingValueRef.current = false
                currentDocumentKeyRef.current = documentKey
                const requestMeasureStartedAt = performance.now()
                view.requestMeasure()
                const requestMeasureDuration =
                    performance.now() - requestMeasureStartedAt
                reportReady(documentKey, {
                    prepareTransactionDuration,
                    requestMeasureDuration,
                    resetScrollDuration,
                    totalDuration: performance.now() - switchStartedAt,
                    updateViewDuration,
                })
                return
            }

            const currentValue = view.state.doc.toString()
            if (currentValue !== editorValue) {
                applyingValueRef.current = true
                view.dispatch({
                    changes: {
                        from: 0,
                        to: view.state.doc.length,
                        insert: editorValue,
                    },
                })
                applyingValueRef.current = false
            }
        }, [documentKey, editorValue])

        useEffect(() => {
            setReadOnly(disabled)
        }, [disabled])

        return <div ref={rootRef} className="markdown-editor" />
    }
)

MarkdownEditor.displayName = 'MarkdownEditor'

export default MarkdownEditor
