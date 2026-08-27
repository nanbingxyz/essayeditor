import {load} from '@tauri-apps/plugin-store'

export interface KeyValueStore {
    delete: (key: string) => Promise<boolean>
    get: <T>(key: string) => Promise<T | undefined>
    save: () => Promise<void>
    set: (key: string, value: unknown) => Promise<void>
}

export type StoreLoader = (path: string) => Promise<KeyValueStore>

export const loadTauriStore: StoreLoader = (path) => load(path)
