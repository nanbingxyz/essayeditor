import {desktopHttpClient, type HttpClient} from '@/shared/platform/http'

const PAGE_SIZE = 20

export interface EssayListItem {
    id: string
    content: string
    isPrivate?: boolean
    themeSlug: string | null
}

export interface EssayListQuery {
    accessToken: string
    date?: string | null
    page: number
    signal?: AbortSignal
    userId: string
}

export interface EssayLibraryClient {
    list: (query: EssayListQuery) => Promise<EssayListItem[]>
    remove: (
        essayId: string,
        accessToken: string,
        signal?: AbortSignal
    ) => Promise<void>
    update: (
        essayId: string,
        content: string,
        themeId: number | null,
        isPrivate: boolean,
        accessToken: string,
        signal?: AbortSignal
    ) => Promise<void>
}

interface EssayLibraryClientOptions {
    baseUrl: string
    httpClient?: HttpClient
}

export class EssayLibraryError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'EssayLibraryError'
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

    const error = (payload as {error?: unknown}).error
    return typeof error === 'string' && error.trim() ? error : null
}

function readEssayList(payload: unknown): EssayListItem[] | null {
    if (!Array.isArray(payload)) {
        return null
    }

    const essays: EssayListItem[] = []
    for (const value of payload) {
        if (!value || typeof value !== 'object') {
            return null
        }

        const {
            id,
            content,
            is_private: snakeCaseIsPrivate,
            isPrivate: camelCaseIsPrivate,
            theme_slug: snakeCaseThemeSlug,
            themeSlug: camelCaseThemeSlug,
        } = value as {
            id?: unknown
            content?: unknown
            is_private?: unknown
            isPrivate?: unknown
            theme_slug?: unknown
            themeSlug?: unknown
        }
        const themeSlug =
            snakeCaseThemeSlug === undefined
                ? camelCaseThemeSlug
                : snakeCaseThemeSlug
        const isPrivate =
            snakeCaseIsPrivate === undefined
                ? camelCaseIsPrivate
                : snakeCaseIsPrivate
        if (
            typeof id !== 'string' ||
            !id.trim() ||
            typeof content !== 'string' ||
            !(
                isPrivate === undefined ||
                typeof isPrivate === 'boolean'
            ) ||
            !(
                themeSlug === undefined ||
                themeSlug === null ||
                (typeof themeSlug === 'string' && themeSlug.trim())
            )
        ) {
            return null
        }

        essays.push({
            id: id.trim(),
            content,
            isPrivate: isPrivate === true,
            themeSlug:
                typeof themeSlug === 'string' ? themeSlug.trim() : null,
        })
    }
    return essays
}

export function createEssayLibraryClient({
    baseUrl,
    httpClient = desktopHttpClient,
}: EssayLibraryClientOptions): EssayLibraryClient {
    const essaysUrl = `${baseUrl.replace(/\/+$/, '')}/essays`

    return {
        list: async ({accessToken, date, page, signal, userId}) => {
            const query = new URLSearchParams({
                page: String(page),
                uid: userId,
            })
            if (date) {
                query.set('date', date)
            }

            let response: Response
            try {
                response = await httpClient(`${essaysUrl}?${query}`, {
                    method: 'GET',
                    headers: {Authorization: `Bearer ${accessToken}`},
                    signal,
                })
            } catch (error) {
                if (signal?.aborted) {
                    throw error
                }
                throw new EssayLibraryError('网络连接失败，请稍后重试')
            }

            const body = await response.text().catch(() => '')
            const payload = parseJson(body)
            if (!response.ok) {
                throw new EssayLibraryError(
                    readErrorMessage(payload) ?? '无法加载文章，请稍后重试'
                )
            }

            const essays = readEssayList(payload)
            if (!essays) {
                throw new EssayLibraryError('服务器返回了无效的文章列表')
            }
            return essays
        },
        remove: async (essayId, accessToken, signal) => {
            let response: Response
            try {
                response = await httpClient(
                    `${essaysUrl}/${encodeURIComponent(essayId)}`,
                    {
                        method: 'DELETE',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                        signal,
                    }
                )
            } catch (error) {
                if (signal?.aborted) {
                    throw error
                }
                throw new EssayLibraryError('网络连接失败，请稍后重试')
            }

            if (!response.ok) {
                const body = await response.text().catch(() => '')
                throw new EssayLibraryError(
                    readErrorMessage(parseJson(body)) ??
                        '删除失败，请稍后重试'
                )
            }
        },
        update: async (
            essayId,
            content,
            themeId,
            isPrivate,
            accessToken,
            signal
        ) => {
            let response: Response
            try {
                response = await httpClient(
                    `${essaysUrl}/${encodeURIComponent(essayId)}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`,
                        },
                        body: JSON.stringify({
                            content,
                            theme_id: themeId,
                            is_private: isPrivate,
                        }),
                        signal,
                    }
                )
            } catch (error) {
                if (signal?.aborted) {
                    throw error
                }
                throw new EssayLibraryError('网络连接失败，请稍后重试')
            }

            if (!response.ok) {
                const body = await response.text().catch(() => '')
                throw new EssayLibraryError(
                    readErrorMessage(parseJson(body)) ??
                        '更新失败，请稍后重试'
                )
            }
        },
    }
}

export {PAGE_SIZE}
