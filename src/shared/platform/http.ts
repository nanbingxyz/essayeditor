import {fetch as tauriFetch} from '@tauri-apps/plugin-http'

export interface HttpClientOptions extends RequestInit {
    connectTimeout?: number
    maxRedirections?: number
}

export type HttpClient = (
    input: string | URL | Request,
    init?: HttpClientOptions
) => Promise<Response>

export const desktopHttpClient: HttpClient = tauriFetch
