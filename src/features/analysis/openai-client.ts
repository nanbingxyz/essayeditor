import {
    desktopHttpClient,
    type HttpClient,
} from '@/shared/platform/http'

export interface OpenAiConfig {
    apiKey: string
    baseUrl: string
    model: string
    extra_body?: Record<string, unknown>
}

export function toOpenAiConfig(settings: {
    apiKey: string
    baseUrl: string
    model: string
    reasoningEnabled: boolean
}): OpenAiConfig {
    return {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        extra_body: settings.reasoningEnabled
            ? {
                  thinking: {type: 'enabled'},
                  reasoning_effort: 'medium',
              }
            : {
                  thinking: {type: 'disabled'},
              },
    }
}

export interface ChatMessage {
    content: string
    role: 'system' | 'user'
}

export class OpenAiCompatibleError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'OpenAiCompatibleError'
    }
}

export interface OpenAiCompatibleClient {
    complete: (
        config: OpenAiConfig,
        messages: ChatMessage[],
        signal?: AbortSignal
    ) => Promise<string>
    listModels: (
        config: Pick<OpenAiConfig, 'apiKey' | 'baseUrl'>,
        signal?: AbortSignal
    ) => Promise<string[]>
    testConnection: (
        config: OpenAiConfig,
        signal?: AbortSignal
    ) => Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text) as unknown
    } catch {
        return null
    }
}

function readErrorMessage(payload: unknown) {
    if (!isRecord(payload)) {
        return null
    }
    const error = payload.error
    if (typeof error === 'string' && error.trim()) {
        return error
    }
    if (isRecord(error) && typeof error.message === 'string') {
        return error.message.trim() || null
    }
    return typeof payload.message === 'string'
        ? payload.message.trim() || null
        : null
}

function readMessageContent(payload: unknown) {
    if (!isRecord(payload) || !Array.isArray(payload.choices)) {
        return null
    }
    const firstChoice = payload.choices[0]
    if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
        return null
    }
    const content = firstChoice.message.content
    if (typeof content === 'string') {
        return content
    }
    if (!Array.isArray(content)) {
        return null
    }
    const text = content
        .map((part) =>
            isRecord(part) && typeof part.text === 'string' ? part.text : ''
        )
        .join('')
    return text || null
}

function readModels(payload: unknown) {
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
        return null
    }
    const models = payload.data
        .map((entry) =>
            isRecord(entry) && typeof entry.id === 'string'
                ? entry.id.trim()
                : ''
        )
        .filter(Boolean)
    return [...new Set(models)].sort((left, right) =>
        left.localeCompare(right)
    )
}

function normalizeBaseUrl(baseUrl: string) {
    const normalized = baseUrl.trim().replace(/\/+$/, '')
    let url: URL
    try {
        url = new URL(normalized)
    } catch {
        throw new OpenAiCompatibleError('Base URL 格式不正确')
    }
    if (
        (url.protocol !== 'https:' && url.protocol !== 'http:') ||
        url.username ||
        url.password
    ) {
        throw new OpenAiCompatibleError(
            'Base URL 必须是 HTTP 或 HTTPS 地址，且不能包含账号密码'
        )
    }
    return normalized
}

async function request(
    httpClient: HttpClient,
    url: string,
    init: RequestInit
) {
    let response: Response
    try {
        response = await httpClient(url, init)
    } catch (error) {
        if (
            init.signal?.aborted ||
            (error instanceof DOMException && error.name === 'AbortError')
        ) {
            throw new DOMException('The operation was aborted', 'AbortError')
        }
        throw new OpenAiCompatibleError('网络连接失败，请检查 Base URL')
    }

    const text = await response.text().catch(() => '')
    const payload = parseJson(text)
    if (!response.ok) {
        throw new OpenAiCompatibleError(
            readErrorMessage(payload) ??
                `服务请求失败（HTTP ${response.status}）`
        )
    }
    return payload
}

export function createOpenAiCompatibleClient(
    httpClient: HttpClient = desktopHttpClient
): OpenAiCompatibleClient {
    const requestCompletion = async (
        config: OpenAiConfig,
        messages: ChatMessage[],
        signal?: AbortSignal,
        maxTokens?: number
    ) => {
        const payload = await request(
            httpClient,
            `${normalizeBaseUrl(config.baseUrl)}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify({
                    ...config.extra_body,
                    model: config.model,
                    messages,
                    ...(maxTokens === undefined
                        ? {}
                        : {max_tokens: maxTokens}),
                }),
                signal,
            }
        )
        const content = readMessageContent(payload)
        if (content === null) {
            throw new OpenAiCompatibleError('模型返回了无法识别的内容')
        }
        return content
    }
    const complete: OpenAiCompatibleClient['complete'] = requestCompletion

    return {
        complete,
        listModels: async (config, signal) => {
            const payload = await request(
                httpClient,
                `${normalizeBaseUrl(config.baseUrl)}/models`,
                {
                    headers: {
                        Authorization: `Bearer ${config.apiKey}`,
                    },
                    signal,
                }
            )
            const models = readModels(payload)
            if (!models?.length) {
                throw new OpenAiCompatibleError(
                    '服务商未返回模型列表，请手动填写模型名称'
                )
            }
            return models
        },
        testConnection: async (config, signal) => {
            await requestCompletion(
                config,
                [
                    {
                        role: 'user',
                        content: '只回复 OK。',
                    },
                ],
                signal,
                8
            )
        },
    }
}
