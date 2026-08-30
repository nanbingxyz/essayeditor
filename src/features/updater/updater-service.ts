import {getVersion} from '@tauri-apps/api/app'
import {relaunch} from '@tauri-apps/plugin-process'
import {check, type DownloadEvent} from '@tauri-apps/plugin-updater'

export interface AvailableUpdate {
    body?: string
    date?: string
    downloadAndInstall: (
        onEvent?: (event: DownloadEvent) => void
    ) => Promise<void>
    version: string
}

export interface UpdaterService {
    check: () => Promise<AvailableUpdate | null>
    getVersion: () => Promise<string>
    relaunch: () => Promise<void>
}

export const tauriUpdaterService: UpdaterService = {
    check,
    getVersion,
    relaunch,
}
