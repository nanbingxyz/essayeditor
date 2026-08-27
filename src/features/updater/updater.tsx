import {info} from '@tauri-apps/plugin-log'
import {useEffect, useState} from 'react'

import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Progress,
    useToast,
} from '@/shared/ui'

import {
    tauriUpdaterService,
    type AvailableUpdate,
    type UpdaterService,
} from './updater-service'

interface UpdaterProps {
    service?: UpdaterService
}

export function calculateProgress(downloadedBytes: number, totalBytes: number) {
    return totalBytes > 0
        ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
        : undefined
}

export default function Updater({service = tauriUpdaterService}: UpdaterProps) {
    const {toast} = useToast()
    const [open, setOpen] = useState(false)
    const [update, setUpdate] = useState<AvailableUpdate>()
    const [loading, setLoading] = useState(false)
    const [totalBytes, setTotalBytes] = useState(0)
    const [downloadedBytes, setDownloadedBytes] = useState(0)

    useEffect(() => {
        let cancelled = false

        void service
            .check()
            .then((availableUpdate) => {
                if (cancelled || !availableUpdate) {
                    return
                }
                void info(
                    `found update ${availableUpdate.version} from ${
                        availableUpdate.date ?? 'unknown date'
                    } with notes ${availableUpdate.body ?? ''}`
                ).catch(() => undefined)
                setUpdate(availableUpdate)
                setOpen(true)
            })
            .catch(() => {
                if (!cancelled) {
                    toast({
                        title: '无法检查更新',
                        description: '你仍可以继续使用当前版本',
                        variant: 'destructive',
                    })
                }
            })

        return () => {
            cancelled = true
        }
    }, [service, toast])

    const handleUpdate = async () => {
        if (!update || loading) {
            return
        }

        let downloaded = 0
        setLoading(true)
        setDownloadedBytes(0)
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
            await service.relaunch()
        } catch {
            setLoading(false)
            toast({
                title: '更新失败',
                description: '请检查网络后重试',
                variant: 'destructive',
            })
        }
    }

    const progress = calculateProgress(downloadedBytes, totalBytes)

    return (
        <Dialog open={open} onOpenChange={loading ? undefined : setOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>更新提示</DialogTitle>
                    <DialogDescription>
                        {loading
                            ? '正在更新中…，更新完成后将自动重启'
                            : `发现新版本 ${update?.version ?? ''}，是否更新？`}
                    </DialogDescription>
                </DialogHeader>
                {loading && (
                    <div className="py-4">
                        <Progress value={progress} />
                    </div>
                )}
                <DialogFooter className="sm:justify-start">
                    {!loading && (
                        <Button onClick={() => void handleUpdate()}>
                            下载更新
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
