import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Progress,
} from '@/shared/ui'

import {useUpdater} from './updater-context'

export default function Updater() {
    const updater = useUpdater()
    const downloading = updater.status === 'downloading'
    const readyToRestart = updater.status === 'readyToRestart'

    return (
        <Dialog
            open={updater.promptOpen}
            onOpenChange={downloading ? undefined : updater.setPromptOpen}
        >
            <DialogContent
                className="sm:max-w-md"
                showCloseButton={!downloading}
            >
                <DialogHeader>
                    <DialogTitle>更新提示</DialogTitle>
                    <DialogDescription aria-live="polite">
                        {downloading
                            ? '正在下载并安装更新…'
                            : updater.errorMessage
                              ? updater.errorMessage
                              : readyToRestart
                                ? '更新已安装，重启应用后即可使用新版本。'
                                : `发现新版本 ${updater.availableVersion ?? ''}，是否更新？`}
                    </DialogDescription>
                </DialogHeader>
                {downloading && (
                    <div className="space-y-2 py-4">
                        <Progress
                            value={updater.progress}
                            aria-label="更新下载进度"
                        />
                        <p className="text-right text-xs text-muted-foreground">
                            {updater.progress === undefined
                                ? '正在下载…'
                                : `${updater.progress}%`}
                        </p>
                    </div>
                )}
                <DialogFooter className="sm:justify-start">
                    {readyToRestart ? (
                        <Button onClick={() => void updater.restart()}>
                            重启应用
                        </Button>
                    ) : updater.status === 'error' &&
                      updater.availableVersion ? (
                        <Button
                            onClick={() => void updater.downloadAndInstall()}
                        >
                            重试更新
                        </Button>
                    ) : !downloading ? (
                        <Button
                            onClick={() => void updater.downloadAndInstall()}
                        >
                            下载更新
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
