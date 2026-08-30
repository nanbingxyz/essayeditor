import {ShadowInnerIcon} from '@radix-ui/react-icons'

import {Button, Progress} from '@/shared/ui'

import {useUpdater} from './updater-context'

export default function SettingsUpdateSection() {
    const updater = useUpdater()
    const checking = updater.status === 'checking'
    const downloading = updater.status === 'downloading'
    const readyToRestart = updater.status === 'readyToRestart'
    const automaticUpdateActive =
        updater.updateSource === 'automatic' &&
        Boolean(updater.availableVersion) &&
        (downloading || readyToRestart || updater.status === 'error')
    const canRetryDownload =
        updater.updateSource === 'manual' &&
        updater.status === 'error' &&
        Boolean(updater.availableVersion)

    const handleAction = () => {
        if (automaticUpdateActive) {
            return
        }

        if (readyToRestart) {
            void updater.restart()
        } else if (updater.status === 'available' || canRetryDownload) {
            void updater.downloadAndInstall()
        } else {
            void updater.checkForUpdates('manual')
        }
    }

    const buttonCopy = automaticUpdateActive
        ? readyToRestart
            ? '已下载'
            : updater.status === 'error'
              ? '更新失败'
              : '正在下载…'
        : checking
        ? '正在检查…'
        : downloading
          ? '正在下载…'
          : readyToRestart
            ? '重启应用'
            : updater.status === 'available'
              ? '更新'
              : canRetryDownload
                ? '重试更新'
                : '检查更新'

    const statusCopy =
        automaticUpdateActive
            ? readyToRestart
                ? '更新已下载，请在侧栏重启'
                : updater.status === 'error'
                  ? '自动更新失败，请在侧栏重试'
                  : `正在自动下载 v${updater.availableVersion}`
            : updater.errorMessage ??
              (updater.status === 'upToDate'
                  ? '已是最新版本'
                  : updater.status === 'available'
                    ? `发现新版本 ${updater.availableVersion}`
                    : readyToRestart
                      ? '更新已安装'
                      : '')

    return (
        <section
            className="settings-section update-section"
            aria-labelledby="update-heading"
        >
            <div className="settings-section-copy">
                <h2 id="update-heading">关于</h2>
                <p>
                    版本{' '}
                    <span className="current-app-version">
                        v{updater.currentVersion}
                    </span>
                </p>
            </div>

            <div className="update-action-row">
                <Button
                    type="button"
                    variant="secondary"
                    className='text-xs'
                    size="sm"
                    disabled={checking || downloading || automaticUpdateActive}
                    onClick={handleAction}
                >
                    {(checking || downloading) && (
                        <ShadowInnerIcon
                            className="mr-2 animate-spin"
                            aria-hidden="true"
                        />
                    )}
                    {buttonCopy}
                </Button>
                <small
                    className={
                        updater.errorMessage ? 'is-error' : undefined
                    }
                    aria-live="polite"
                >
                    {statusCopy}
                </small>
            </div>

            {downloading && updater.updateSource === 'manual' && (
                <div className="update-progress">
                    <Progress
                        value={updater.progress}
                        aria-label="更新下载进度"
                    />
                    <small aria-live="polite">
                        {updater.progress === undefined
                            ? '正在下载…'
                            : `${updater.progress}%`}
                    </small>
                </div>
            )}
        </section>
    )
}
