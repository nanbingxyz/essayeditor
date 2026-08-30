import {ShadowInnerIcon} from '@radix-ui/react-icons'

import {useUpdater} from './updater-context'

export default function SidebarUpdateStatus() {
    const updater = useUpdater()

    if (updater.updateSource !== 'automatic' || !updater.availableVersion) {
        return null
    }

    if (updater.status === 'downloading') {
        return (
            <div
                className="sidebar-update-status"
                aria-live="polite"
            >
                <ShadowInnerIcon
                    className="sidebar-update-spinner"
                    aria-hidden="true"
                />
                <span>v{updater.availableVersion} 下载中</span>
            </div>
        )
    }

    if (updater.status === 'readyToRestart') {
        return (
            <button
                type="button"
                className="sidebar-update-status is-action"
                aria-live="polite"
                onClick={() => void updater.restart()}
            >
                重启更新版本
            </button>
        )
    }

    if (updater.status === 'error') {
        return (
            <button
                type="button"
                className="sidebar-update-status is-action is-error"
                aria-live="polite"
                onClick={() => void updater.downloadAndInstall()}
            >
                v{updater.availableVersion} 更新失败 · 重试
            </button>
        )
    }

    return null
}
