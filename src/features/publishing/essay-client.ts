import {
    desktopHttpClient,
    type HttpClient,
} from '@/shared/platform/http'

const ESSAY_API_URL = 'https://api.essay.ink/essays'

export class EssayPublishError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'EssayPublishError'
    }
}

export interface EssayClient {
    publish: (content: string, accessToken: string) => Promise<{id: string}>
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
    httpClient: HttpClient = desktopHttpClient
): EssayClient {
    return {
        publish: async (content, accessToken) => {
            let response: Response
            try {
                response = await httpClient(ESSAY_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({content}),
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
