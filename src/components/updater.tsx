import {check, Update} from '@tauri-apps/plugin-updater'
import {relaunch} from '@tauri-apps/plugin-process'
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import {info} from '@tauri-apps/plugin-log'
import {Button} from './ui/button'
import {DialogHeader, DialogFooter} from './ui/dialog'
import {useEffect, useState} from 'react'
import { Progress } from './ui/progress'

export default function Updater() {
    const [open, setOpen] = useState(false)
    const [update, setUpdate] = useState<Update>()
    const [loading, setLoading] = useState(false)
    const [totalBytes, setTotalBytes] = useState(0)
    const [downloadedBytes, setDownloadedBytes] = useState(0)

    const checkForUpdates = async () => {
        const _update = await check()
        if (_update) {
            info(
                `found update ${_update.version} from ${_update.date} with notes ${_update.body}`
            )
            setUpdate(update)
            return true
        }
        info('no updates found')
        setUpdate(undefined)
        return false
    }

    const handleUpdate = async () => {
        if (update) {
            let downloaded = 0
            let contentLength = 0
            // alternatively we could also call update.download() and update.install() separately
            await update.downloadAndInstall((event) => {
                switch (event.event) {
                    case 'Started':
                        contentLength = event.data.contentLength || 0
                        setLoading(true)
                        setTotalBytes(contentLength)
                        info(
                            `started downloading ${event.data.contentLength} bytes`
                        )
                        break
                    case 'Progress':
                        downloaded += event.data.chunkLength
                        setDownloadedBytes(downloaded)
                        info(`downloaded ${downloaded} from ${contentLength}`)
                        break
                    case 'Finished':
                        info('download finished')
                        break
                }
            })
            info('update installed')
            await relaunch()
        }
    }

    useEffect(() => {
        checkForUpdates().then((hasUpdate) => {
            if (hasUpdate) {
                setOpen(true)
            }
        })
    }, [])

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>更新提示</DialogTitle>
                    <DialogDescription>
                        {loading
                            ? '正在更新中..., 更新完成后将自动重启'
                            : `发现新版本 {update?.version}，是否更新？`}
                    </DialogDescription>
                </DialogHeader>
                {
                  loading && (
                    <div className='py-4'><Progress value={Math.round(downloadedBytes/totalBytes)} /></div>
                  )
                }
                <DialogFooter className="sm:justify-start">
                    {loading ? <span></span> : <Button onClick={handleUpdate}>下载更新</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
