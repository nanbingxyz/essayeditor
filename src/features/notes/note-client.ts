import {desktopHttpClient, type HttpClient} from '@/shared/platform/http'

export const NOTE_PAGE_SIZE = 20

export interface NoteFolder {
    id: string
    name: string
}

export interface NoteComment {
    id: number
    content: string
    createdAt: string
}

export interface Note {
    id: string
    content: string
    createdAt: string
    folder: NoteFolder | null
    comments: NoteComment[]
}

export interface NotePage {
    data: Note[]
    meta: {
        page: number
        limit: number
        hasMore: boolean
    }
}

export interface NoteClient {
    create: (
        content: string,
        folderId: string | null,
        accessToken: string,
        signal?: AbortSignal
    ) => Promise<string>
    list: (
        page: number,
        accessToken: string,
        signal?: AbortSignal
    ) => Promise<NotePage>
    listFolders: (
        accessToken: string,
        signal?: AbortSignal
    ) => Promise<NoteFolder[]>
    remove: (
        noteId: string,
        accessToken: string,
        signal?: AbortSignal
    ) => Promise<void>
    update: (
        noteId: string,
        content: string,
        folderId: string | null,
        accessToken: string,
        signal?: AbortSignal
    ) => Promise<void>
}

interface NoteClientOptions {
    baseUrl: string
    httpClient?: HttpClient
}

export class NoteClientError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'NoteClientError'
    }
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text) as unknown
    } catch {
        return null
    }
}

function readErrorMessage(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
        return null
    }
    const {error, message} = payload as {
        error?: unknown
        message?: unknown
    }
    const value = typeof error === 'string' ? error : message
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseFolder(value: unknown): NoteFolder | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const {id, name} = value as {id?: unknown; name?: unknown}
    if (
        typeof id !== 'string' ||
        !id.trim() ||
        typeof name !== 'string' ||
        !name.trim()
    ) {
        return null
    }
    return {id: id.trim(), name: name.trim()}
}

function parseComment(value: unknown): NoteComment | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const candidate = value as {
        id?: unknown
        content?: unknown
        created_at?: unknown
        createdAt?: unknown
    }
    const createdAt = candidate.created_at ?? candidate.createdAt
    if (
        typeof candidate.id !== 'number' ||
        !Number.isInteger(candidate.id) ||
        typeof candidate.content !== 'string' ||
        typeof createdAt !== 'string' ||
        !createdAt
    ) {
        return null
    }
    return {
        id: candidate.id,
        content: candidate.content,
        createdAt,
    }
}

function parseNote(value: unknown): Note | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const candidate = value as {
        id?: unknown
        content?: unknown
        created_at?: unknown
        createdAt?: unknown
        folder?: unknown
        comments?: unknown
    }
    const createdAt = candidate.created_at ?? candidate.createdAt
    const folder = candidate.folder === null ? null : parseFolder(candidate.folder)
    if (
        typeof candidate.id !== 'string' ||
        !candidate.id.trim() ||
        typeof candidate.content !== 'string' ||
        typeof createdAt !== 'string' ||
        !createdAt ||
        (candidate.folder !== null && !folder) ||
        !Array.isArray(candidate.comments)
    ) {
        return null
    }
    const comments: NoteComment[] = []
    for (const value of candidate.comments) {
        const comment = parseComment(value)
        if (!comment) {
            return null
        }
        comments.push(comment)
    }
    return {
        id: candidate.id.trim(),
        content: candidate.content,
        createdAt,
        folder,
        comments,
    }
}

function parseFolders(payload: unknown): NoteFolder[] | null {
    if (!Array.isArray(payload)) {
        return null
    }
    const folders: NoteFolder[] = []
    for (const value of payload) {
        const folder = parseFolder(value)
        if (!folder) {
            return null
        }
        folders.push(folder)
    }
    return folders
}

function parseNotePage(payload: unknown): NotePage | null {
    if (!payload || typeof payload !== 'object') {
        return null
    }
    const {data, meta} = payload as {data?: unknown; meta?: unknown}
    if (!Array.isArray(data) || !meta || typeof meta !== 'object') {
        return null
    }
    const candidateMeta = meta as {
        page?: unknown
        limit?: unknown
        hasMore?: unknown
        has_more?: unknown
    }
    const hasMore = candidateMeta.hasMore ?? candidateMeta.has_more
    if (
        !Number.isInteger(candidateMeta.page) ||
        (candidateMeta.page as number) < 1 ||
        !Number.isInteger(candidateMeta.limit) ||
        (candidateMeta.limit as number) < 1 ||
        typeof hasMore !== 'boolean'
    ) {
        return null
    }
    const notes: Note[] = []
    for (const value of data) {
        const note = parseNote(value)
        if (!note) {
            return null
        }
        notes.push(note)
    }
    return {
        data: notes,
        meta: {
            page: candidateMeta.page as number,
            limit: candidateMeta.limit as number,
            hasMore,
        },
    }
}

export function createNoteClient({
    baseUrl,
    httpClient = desktopHttpClient,
}: NoteClientOptions): NoteClient {
    const root = baseUrl.replace(/\/+$/, '')
    const notesUrl = `${root}/notes`
    const foldersUrl = `${root}/note-folders`

    const request = async (
        url: string,
        accessToken: string,
        init: RequestInit,
        fallbackMessage: string
    ) => {
        try {
            return await httpClient(url, {
                ...init,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    ...init.headers,
                },
            })
        } catch (error) {
            if (init.signal?.aborted) {
                throw error
            }
            throw new NoteClientError(fallbackMessage)
        }
    }

    const assertSuccess = async (
        response: Response,
        expectedStatus: number,
        fallbackMessage: string
    ) => {
        if (response.status === expectedStatus) {
            return ''
        }
        const body = await response.text().catch(() => '')
        throw new NoteClientError(
            readErrorMessage(parseJson(body)) ?? fallbackMessage
        )
    }

    return {
        create: async (content, folderId, accessToken, signal) => {
            const response = await request(
                notesUrl,
                accessToken,
                {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({content, folder_id: folderId}),
                    signal,
                },
                '网络连接失败，请稍后重试'
            )
            if (response.status !== 201) {
                await assertSuccess(response, 201, '创建笔记失败，请稍后重试')
            }
            const payload = parseJson(await response.text().catch(() => ''))
            const id =
                payload && typeof payload === 'object'
                    ? (payload as {id?: unknown}).id
                    : null
            if (typeof id !== 'string' || !id.trim()) {
                throw new NoteClientError('服务器返回了无效的笔记信息')
            }
            return id.trim()
        },
        list: async (page, accessToken, signal) => {
            const query = new URLSearchParams({
                page: String(page),
                limit: String(NOTE_PAGE_SIZE),
            })
            const response = await request(
                `${notesUrl}?${query}`,
                accessToken,
                {method: 'GET', signal},
                '网络连接失败，请稍后重试'
            )
            const body = await response.text().catch(() => '')
            const payload = parseJson(body)
            if (!response.ok) {
                throw new NoteClientError(
                    readErrorMessage(payload) ?? '无法加载笔记，请稍后重试'
                )
            }
            const pageResult = parseNotePage(payload)
            if (!pageResult) {
                throw new NoteClientError('服务器返回了无效的笔记列表')
            }
            return pageResult
        },
        listFolders: async (accessToken, signal) => {
            const response = await request(
                foldersUrl,
                accessToken,
                {method: 'GET', signal},
                '网络连接失败，请稍后重试'
            )
            const body = await response.text().catch(() => '')
            const payload = parseJson(body)
            if (!response.ok) {
                throw new NoteClientError(
                    readErrorMessage(payload) ?? '无法加载笔记文件夹'
                )
            }
            const folders = parseFolders(payload)
            if (!folders) {
                throw new NoteClientError('服务器返回了无效的文件夹列表')
            }
            return folders
        },
        remove: async (noteId, accessToken, signal) => {
            const response = await request(
                `${notesUrl}/${encodeURIComponent(noteId)}`,
                accessToken,
                {method: 'DELETE', signal},
                '网络连接失败，请稍后重试'
            )
            await assertSuccess(response, 204, '删除笔记失败，请稍后重试')
        },
        update: async (
            noteId,
            content,
            folderId,
            accessToken,
            signal
        ) => {
            const response = await request(
                `${notesUrl}/${encodeURIComponent(noteId)}`,
                accessToken,
                {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({content, folderId}),
                    signal,
                },
                '网络连接失败，请稍后重试'
            )
            await assertSuccess(response, 204, '更新笔记失败，请稍后重试')
        },
    }
}
