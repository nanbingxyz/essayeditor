import {defaultKeymap, history, historyKeymap} from '@codemirror/commands'
import {markdown, markdownLanguage} from '@codemirror/lang-markdown'
import {Compartment, EditorState} from '@codemirror/state'
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

interface MarkdownEditorProps {
    disabled?: boolean
    initialValue?: string
    onChange?: (content: string) => void
    placeholder?: string
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
    (
        {
            disabled = false,
            initialValue = '',
            onChange,
            placeholder = '从这里开始...',
        },
        ref
    ) => {
        const rootRef = useRef<HTMLDivElement>(null)
        const viewRef = useRef<EditorView>()
        const onChangeRef = useRef(onChange)
        const readOnlyCompartmentRef = useRef(new Compartment())

        onChangeRef.current = onChange

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
                setValue: (value: string) => {
                    const view = viewRef.current
                    if (!view) {
                        return
                    }

                    const currentValue = view.state.doc.toString()
                    if (currentValue === value) {
                        return
                    }

                    view.dispatch({
                        changes: {
                            from: 0,
                            to: view.state.doc.length,
                            insert: value,
                        },
                        selection: {anchor: 0},
                        scrollIntoView: true,
                    })
                },
            }),
            []
        )

        useEffect(() => {
            const root = rootRef.current
            if (!root) {
                return
            }

            const view = new EditorView({
                parent: root,
                state: EditorState.create({
                    doc: initialValue,
                    extensions: [
                        history(),
                        drawSelection(),
                        EditorView.lineWrapping,
                        markdown({base: markdownLanguage}),
                        editorPlaceholder(placeholder),
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
                            'aria-label': '文章内容',
                            'aria-multiline': 'true',
                        }),
                        EditorView.updateListener.of((update) => {
                            if (update.docChanged) {
                                onChangeRef.current?.(
                                    update.state.doc.toString()
                                )
                            }
                        }),
                        readOnlyCompartmentRef.current.of([
                            EditorState.readOnly.of(disabled),
                            EditorView.editable.of(!disabled),
                        ]),
                    ],
                }),
            })

            viewRef.current = view
            return () => {
                view.destroy()
                viewRef.current = undefined
            }
        }, [])

        useEffect(() => {
            setReadOnly(disabled)
        }, [disabled])

        return <div ref={rootRef} className="markdown-editor" />
    }
)

MarkdownEditor.displayName = 'MarkdownEditor'

export default MarkdownEditor
