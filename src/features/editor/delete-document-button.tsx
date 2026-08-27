import {Delete16Regular} from '@fluentui/react-icons'
import {ShadowInnerIcon} from '@radix-ui/react-icons'
import {useState} from 'react'

import {
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/shared/ui'

interface DeleteDocumentButtonProps {
    deleting: boolean
    disabled: boolean
    onDelete: () => Promise<boolean>
    published: boolean
}

export default function DeleteDocumentButton({
    deleting,
    disabled,
    onDelete,
    published,
}: DeleteDocumentButtonProps) {
    const [open, setOpen] = useState(false)

    const confirmDelete = async () => {
        if (await onDelete()) {
            setOpen(false)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={deleting ? undefined : setOpen}
        >
            <button
                type="button"
                className="editor-delete-button"
                aria-label="删除文章"
                title="删除"
                disabled={disabled || deleting}
                onClick={() => setOpen(true)}
            >
                <Delete16Regular />
            </button>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {published ? '删除已发布文章？' : '删除本地草稿？'}
                    </DialogTitle>
                    <DialogDescription>
                        {published
                            ? '此操作不可撤销，网站上的文章数据和本地未发布修改将一并删除。是否继续？'
                            : '此操作不可撤销，删除后无法恢复该草稿。是否继续？'}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={deleting}
                        >
                            取消
                        </Button>
                    </DialogClose>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={deleting}
                        onClick={() => void confirmDelete()}
                    >
                        {deleting && (
                            <ShadowInnerIcon className="mr-2 animate-spin" />
                        )}
                        确认删除
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
