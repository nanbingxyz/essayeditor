import {fetch as tauriFetch} from '@tauri-apps/plugin-http'

export type HttpClient = (
    input: string | URL | Request,
    init?: RequestInit
) => Promise<Response>

export const desktopHttpClient: HttpClient = tauriFetch
