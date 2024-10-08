import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Button} from '@/components/ui/button'
import {EyeClosedIcon, EyeOpenIcon, GearIcon} from '@radix-ui/react-icons'
import useStore, {EssayStore} from '@/hooks/use-store'
import {useEffect, useState} from 'react'
import {useToast} from '@/hooks/use-toast'

export default function SettingsDialog() {
    const {toast} = useToast()
    const [inputType, setInputType] = useState('password')
    const [open, setOpen] = useState(false)
    const [accessToken, setAccessToken] = useState('')
    const [store, setStore] = useState<EssayStore>()

    useEffect(() => {
        useStore().then(async (store) => {
            setStore(store)
            const accessToken = await store.getAccessToken()
            setAccessToken(accessToken)
        })
    }, [])

    const onInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        setAccessToken(event.target.value)
    }

    const onSave = async () => {
        store && (await store.saveAccessToken(accessToken))
        toast({
            description: 'Access Token 已保存',
        })
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    onClick={() => setOpen(true)}
                    className="text-primary"
                >
                    <GearIcon />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="sm:justify-start text-left">
                    <DialogTitle>设置</DialogTitle>
                    <DialogDescription>
                        AccessToken 在个人设置中的"API 设置"中可以获取
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center space-x-2">
                    <div className="grid flex-1 gap-2">
                        <Label htmlFor="link" className="sr-only">
                            Access Token
                        </Label>
                        <div className="flex justify-start items-center border rounded">
                            <Input
                                className="outline-none flex-1 border-none shadow-none focus-visible:ring-0"
                                onInput={onInput}
                                placeholder="Your Access Token"
                                value={accessToken}
                                type={inputType}
                            />
                            {inputType === 'password' ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setInputType('text')}
                                >
                                    <EyeOpenIcon />
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setInputType('password')}
                                >
                                    <EyeClosedIcon />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <div className="flex justify-end items-center gap-2">
                        <DialogClose asChild>
                            <Button type="button" variant="ghost">
                                取消
                            </Button>
                        </DialogClose>
                        <Button type="button" onClick={onSave}>
                            保存
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
