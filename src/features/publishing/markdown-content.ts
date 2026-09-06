import type {Definition, Nodes, Root} from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import {unified} from 'unified'

const markdownParser = unified().use(remarkParse).use(remarkGfm)

function collectDefinitions(root: Root) {
    const definitions = new Map<string, Definition>()

    root.children.forEach((node) => {
        if (node.type === 'definition') {
            definitions.set(node.identifier, node)
        }
    })

    return definitions
}

function hasVisibleText(value: string) {
    const text = value.trim()
    return text.length > 0 && !/^`+$/.test(text)
}

function nodeHasRenderableContent(
    node: Nodes,
    definitions: ReadonlyMap<string, Definition>
): boolean {
    if (node.type === 'image') {
        return node.url.trim().length > 0
    }

    if (node.type === 'imageReference') {
        return (
            definitions.get(node.identifier)?.url.trim().length ?? 0
        ) > 0
    }

    if (
        node.type === 'text' ||
        node.type === 'inlineCode' ||
        node.type === 'code'
    ) {
        return hasVisibleText(node.value)
    }

    return (
        'children' in node &&
        node.children.some((child) =>
            nodeHasRenderableContent(child, definitions)
        )
    )
}

export function hasRenderableMarkdownContent(content: string): boolean {
    const root = markdownParser.parse(content)
    return nodeHasRenderableContent(root, collectDefinitions(root))
}
