import {
    desktopHttpClient,
    type HttpClient,
} from '@/shared/platform/http'

export class EssayPublishError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'EssayPublishError'
    }
}

export interface EssayClient {
    publish: (
        content: string,
        themeId: number | null,
        accessToken: string
    ) => Promise<{id: string}>
}

interface EssayClientOptions {
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

function readEssayId(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
        return null
    }
    const id = (payload as {id?: unknown}).id
    return typeof id === 'string' && id.trim() ? id : null
}

export function createEssayClient(
    {
        baseUrl,
        httpClient = desktopHttpClient,
    }: EssayClientOptions
): EssayClient {
    const essaysUrl = `${baseUrl.replace(/\/+$/, '')}/essays`

    return {
        publish: async (content, themeId, accessToken) => {
            let response: Response
            try {
                response = await httpClient(essaysUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({content, theme_id: themeId}),
                })
            } catch {
                throw new EssayPublishError('网络连接失败，请稍后重试')
            }

            const body = await response.text().catch(() => '')
            const payload = parseJson(body)

            if (!response.ok) {
                throw new EssayPublishError(
                    readErrorMessage(payload) ??
                        '请检查网络或 API Key 是否正确'
                )
            }

            const id = readEssayId(payload)
            if (!id) {
                throw new EssayPublishError('服务器返回了无效的文章信息')
            }

            return {id}
        },
    }
}
