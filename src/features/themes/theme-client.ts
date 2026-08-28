import {desktopHttpClient, type HttpClient} from '@/shared/platform/http'

export interface Theme {
    id: number
    name: string
    slug: string
    brief: string
}

export interface ThemeClient {
    list: (accessToken: string, signal?: AbortSignal) => Promise<Theme[]>
}

interface ThemeClientOptions {
    baseUrl: string
    httpClient?: HttpClient
}

export class ThemeError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ThemeError'
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

function readThemes(payload: unknown): Theme[] | null {
    if (!Array.isArray(payload)) {
        return null
    }

    const themes: Theme[] = []
    const ids = new Set<number>()
    for (const value of payload) {
        if (!value || typeof value !== 'object') {
            return null
        }
        const {id, name, slug, brief} = value as Record<string, unknown>
        if (
            typeof id !== 'number' ||
            !Number.isFinite(id) ||
            !Number.isInteger(id) ||
            ids.has(id) ||
            typeof name !== 'string' ||
            typeof slug !== 'string' ||
            typeof brief !== 'string'
        ) {
            return null
        }
        ids.add(id)
        themes.push({id, name, slug, brief})
    }
    return themes
}

export function createThemeClient({
    baseUrl,
    httpClient = desktopHttpClient,
}: ThemeClientOptions): ThemeClient {
    const themesUrl = `${baseUrl.replace(/\/+$/, '')}/themes`

    return {
        list: async (accessToken, signal) => {
            let response: Response
            try {
                response = await httpClient(themesUrl, {
                    method: 'GET',
                    headers: {Authorization: `Bearer ${accessToken}`},
                    signal,
                })
            } catch (error) {
                if (signal?.aborted) {
                    throw error
                }
                throw new ThemeError('网络连接失败，请稍后重试')
            }

            const body = await response.text().catch(() => '')
            const payload = parseJson(body)
            if (!response.ok) {
                throw new ThemeError(
                    readErrorMessage(payload) ?? '无法加载频道，请稍后重试'
                )
            }

            const themes = readThemes(payload)
            if (!themes) {
                throw new ThemeError('服务器返回了无效的频道列表')
            }
            return themes
        },
    }
}
