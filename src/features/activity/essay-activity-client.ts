import {
    desktopHttpClient,
    type HttpClient,
} from '@/shared/platform/http'

import type {EssayActivitySnapshot, EssayUser, Heatmap} from './model'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export class EssayActivityError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'EssayActivityError'
    }
}

export interface EssayActivityClient {
    getHeatmap: (
        accessToken: string,
        signal?: AbortSignal
    ) => Promise<EssayActivitySnapshot>
}

interface EssayActivityClientOptions {
    baseUrl: string
    httpClient?: HttpClient
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

function readUser(value: unknown): EssayUser | null {
    if (!value || typeof value !== 'object') {
        return null
    }

    const {id, avatar, displayName} = value as {
        id?: unknown
        avatar?: unknown
        displayName?: unknown
    }
    const normalizedId =
        typeof id === 'string' && id.trim()
            ? id.trim()
            : typeof id === 'number' && Number.isFinite(id)
              ? String(id)
              : null
    if (
        !normalizedId ||
        (avatar != null && typeof avatar !== 'string') ||
        typeof displayName !== 'string' ||
        !displayName.trim()
    ) {
        return null
    }

    return {
        id: normalizedId,
        avatar: typeof avatar === 'string' ? avatar.trim() || null : null,
        displayName: displayName.trim(),
    }
}

function readHeatmap(value: unknown): Heatmap | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }

    const heatmap: Heatmap = {}
    for (const [date, count] of Object.entries(value)) {
        if (
            !DATE_KEY_PATTERN.test(date) ||
            !Number.isInteger(count) ||
            (count as number) < 0
        ) {
            return null
        }
        heatmap[date] = count as number
    }
    return heatmap
}

function readSnapshot(payload: unknown): EssayActivitySnapshot | null {
    if (!payload || typeof payload !== 'object') {
        return null
    }

    const {user, heatmap} = payload as {
        user?: unknown
        heatmap?: unknown
    }
    const parsedUser = readUser(user)
    const parsedHeatmap = readHeatmap(heatmap)
    return parsedUser && parsedHeatmap
        ? {user: parsedUser, heatmap: parsedHeatmap}
        : null
}

export function createEssayActivityClient({
    baseUrl,
    httpClient = desktopHttpClient,
}: EssayActivityClientOptions): EssayActivityClient {
    const heatmapUrl = `${baseUrl.replace(/\/+$/, '')}/heatmap?with_user=true`

    return {
        getHeatmap: async (accessToken, signal) => {
            let response: Response
            try {
                response = await httpClient(heatmapUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                    signal,
                })
            } catch (error) {
                if (signal?.aborted) {
                    throw error
                }
                throw new EssayActivityError('网络连接失败，请稍后重试')
            }

            const body = await response.text().catch(() => '')
            const payload = parseJson(body)

            if (!response.ok) {
                throw new EssayActivityError(
                    readErrorMessage(payload) ??
                        '请检查网络或 API Key 是否正确'
                )
            }

            const snapshot = readSnapshot(payload)
            if (!snapshot) {
                throw new EssayActivityError('服务器返回了无效的用户活动信息')
            }
            return snapshot
        },
    }
}
