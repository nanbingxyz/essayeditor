import './App.css'
import '@fontsource-variable/noto-serif-sc'
import {fetch} from '@tauri-apps/plugin-http'
import {open} from '@tauri-apps/plugin-shell'
import {useToast} from '@/hooks/use-toast'
import useStore from '@/hooks/use-store'
import {ChangeEvent, useCallback, useEffect, useState} from 'react'

import {debounce, getRelativeTime} from './utils'
import {Button} from './components/ui/button'
import {PaperPlaneIcon, ShadowInnerIcon} from '@radix-ui/react-icons'
import SettingsDialog from './components/settings-dialog'
import {ToastAction} from './components/ui/toast'

function App() {
    const {toast} = useToast()
    const [backTimestamp, setBackTimestamp] = useState(0)
    const [accessToken, setAccessToken] = useState('')
    const [loading, setLoading] = useState(false)
    const [content, setContent] = useState('')

    const restoreBackup = () => {
        const backup = localStorage.getItem('backup')
        if (backup) {
            const {content, timestamp} = JSON.parse(backup)
            setContent(content)
            setBackTimestamp(timestamp)
        }
    }

    const backup = useCallback(
        debounce((content: string) => {
            if (content !== '') {
                const timestamp = Date.now()
                localStorage.setItem(
                    'backup',
                    JSON.stringify({
                        content,
                        timestamp,
                    })
                )
                setBackTimestamp(timestamp)
            }
        }, 1000),
        [debounce]
    )

    const onInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
        setContent(event.target.value)
        backup(event.target.value)
    }

    useEffect(() => {
        useStore().then(async (store) => {
            const accessToken = await store.getAccessToken()
            if (!accessToken) {
                toast({
                    title: '请先设置AccessToken',
                    description: '在左下角的设置中设置AccessToken',
                    variant: 'destructive',
                })
            } else {
                setAccessToken(accessToken)
            }
        })
        restoreBackup()
    }, [])

    const onSubmit = async () => {
        if (!accessToken) {
            toast({
                title: '请先设置AccessToken',
                description: '在左下角的设置中设置AccessToken',
                variant: 'destructive',
            })
            return
        }
        setLoading(true)
        try {
            const resp = await fetch('https://api.essay.ink/essays', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    content,
                }),
            })
            if (resp.ok) {
                localStorage.removeItem('backup')
                const {id} = await resp.json()
                setContent('')
                setBackTimestamp(0)
                toast({
                    title: '文章已发布',
                    description: '你可以点击右侧按钮查看新发布的文章',
                    action: (
                        <ToastAction
                            altText="查看新发布文章"
                            onClick={() =>
                                open(`https://www.essay.ink/essays/${id}`)
                            }
                        >
                            查看
                        </ToastAction>
                    ),
                })
            } else {
                toast({
                    title: '发布失败',
                    description: '请检查网络或AccessToken是否正确',
                    variant: 'destructive',
                })
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 pt-6">
                <textarea
                    placeholder="从这里开始..."
                    disabled={loading}
                    className="text-base border-none w-full h-full resize-none text-primary py-6 px-12"
                    value={content}
                    onChange={onInput}
                ></textarea>
            </div>
            <div className="p-2">
                <div className="flex justify-between items-center ">
                    <div className="flex justify-start items-center">
                        <SettingsDialog />
                        {backTimestamp !== 0 && (
                            <span className="text-xs text-muted-foreground font-bold">
                                last saved{' '}
                                {getRelativeTime(new Date(backTimestamp))}
                            </span>
                        )}
                    </div>
                    <div>
                        <Button onClick={onSubmit} disabled={loading} className='rounded-full mr-2'>
                            {loading ? <ShadowInnerIcon className="animate-spin" />: <PaperPlaneIcon />}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
