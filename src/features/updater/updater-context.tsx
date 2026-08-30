import {info} from '@tauri-apps/plugin-log'
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'

import {
    tauriUpdaterService,
    type AvailableUpdate,
    type UpdaterService,
} from './updater-service'

export type UpdaterStatus =
    | 'idle'
    | 'checking'
    | 'upToDate'
    | 'available'
    | 'downloading'
    | 'readyToRestart'
    | 'error'

export type UpdateSource = 'automatic' | 'manual'

interface UpdaterContextValue {
    availableVersion?: string
    checkForUpdates: (source?: UpdateSource) => Promise<void>
    currentVersion: string
    downloadAndInstall: () => Promise<void>
    downloadedBytes: number
    errorMessage?: string
    progress?: number
    restart: () => Promise<void>
    status: UpdaterStatus
    totalBytes: number
    updateSource?: UpdateSource
}

interface UpdaterProviderProps {
    autoCheck?: boolean
    children: ReactNode
    service?: UpdaterService
}

const UpdaterContext = createContext<UpdaterContextValue | null>(null)

export function calculateProgress(downloadedBytes: number, totalBytes: number) {
    return totalBytes > 0
        ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
        : undefined
}

export function UpdaterProvider({
    autoCheck = true,
    children,
    service = tauriUpdaterService,
}: UpdaterProviderProps) {
    const [availableUpdate, setAvailableUpdate] =
        useState<AvailableUpdate>()
    const [currentVersion, setCurrentVersion] = useState('获取中…')
    const [downloadedBytes, setDownloadedBytes] = useState(0)
    const [errorMessage, setErrorMessage] = useState<string>()
    const [status, setStatus] = useState<UpdaterStatus>('idle')
    const [totalBytes, setTotalBytes] = useState(0)
    const [updateSource, setUpdateSource] = useState<UpdateSource>()
    const automaticCheckStarted = useRef(false)
    const busy = useRef(false)

    const installUpdate = useCallback(async (update: AvailableUpdate) => {
        let downloaded = 0
        setDownloadedBytes(0)
        setErrorMessage(undefined)
        setStatus('downloading')
        setTotalBytes(0)

        try {
            await update.downloadAndInstall((event) => {
                switch (event.event) {
                    case 'Started':
                        setTotalBytes(event.data.contentLength ?? 0)
                        break
                    case 'Progress':
                        downloaded += event.data.chunkLength
                        setDownloadedBytes(downloaded)
                        break
                    case 'Finished':
                        void info('update download finished').catch(
                            () => undefined
                        )
                        break
                }
            })
            setStatus('readyToRestart')
        } catch {
            setErrorMessage('更新失败，请检查网络后重试')
            setStatus('error')
        }
    }, [])

    const checkForUpdates = useCallback(
        async (source: UpdateSource = 'manual') => {
            if (busy.current) {
                return
            }

            busy.current = true
            setUpdateSource(source)
            setErrorMessage(undefined)
            setStatus('checking')

            try {
                const update = await service.check()
                setAvailableUpdate(update ?? undefined)

                if (!update) {
                    setStatus('upToDate')
                    return
                }

                void info(
                    `found update ${update.version} from ${
                        update.date ?? 'unknown date'
                    } with notes ${update.body ?? ''}`
                ).catch(() => undefined)
                if (source === 'automatic') {
                    await installUpdate(update)
                } else {
                    setStatus('available')
                }
            } catch {
                setAvailableUpdate(undefined)
                setErrorMessage('无法检查更新，请检查网络后重试')
                setStatus('error')
            } finally {
                busy.current = false
            }
        },
        [installUpdate, service]
    )

    useEffect(() => {
        let cancelled = false

        void service
            .getVersion()
            .then((version) => {
                if (!cancelled) {
                    setCurrentVersion(
                        typeof version === 'string' && version
                            ? version
                            : '暂不可用'
                    )
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setCurrentVersion('暂不可用')
                }
            })

        if (autoCheck && !automaticCheckStarted.current) {
            automaticCheckStarted.current = true
            void checkForUpdates('automatic')
        }

        return () => {
            cancelled = true
        }
    }, [autoCheck, checkForUpdates, service])

    const downloadAndInstall = useCallback(async () => {
        if (!availableUpdate || busy.current) {
            return
        }

        busy.current = true
        try {
            await installUpdate(availableUpdate)
        } finally {
            busy.current = false
        }
    }, [availableUpdate, installUpdate])

    const restart = useCallback(async () => {
        setErrorMessage(undefined)
        try {
            await service.relaunch()
        } catch {
            setErrorMessage('无法重启应用，请重试')
        }
    }, [service])

    return (
        <UpdaterContext.Provider
            value={{
                availableVersion: availableUpdate?.version,
                checkForUpdates,
                currentVersion,
                downloadAndInstall,
                downloadedBytes,
                errorMessage,
                progress: calculateProgress(downloadedBytes, totalBytes),
                restart,
                status,
                totalBytes,
                updateSource,
            }}
        >
            {children}
        </UpdaterContext.Provider>
    )
}

export function useUpdater() {
    const context = useContext(UpdaterContext)

    if (!context) {
        throw new Error('useUpdater must be used within an UpdaterProvider')
    }

    return context
}
