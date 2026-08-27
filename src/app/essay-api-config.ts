const DEFAULT_ESSAY_API_BASE_URL = 'https://api.essay.ink'

export function normalizeEssayApiBaseUrl(value?: string) {
    const configuredValue = value?.trim() || DEFAULT_ESSAY_API_BASE_URL
    return configuredValue.replace(/\/+$/, '')
}

export const essayApiBaseUrl = normalizeEssayApiBaseUrl(
    import.meta.env.VITE_ESSAY_API_BASE_URL
)
