import * as React from 'react'
import { Dialog } from './dialog'
import { Button } from './button'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'destructive',
  loading,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  loading?: boolean
  onConfirm: () => void | Promise<void>
  children?: React.ReactNode
}) {
  const [busy, setBusy] = React.useState(false)

  const handleConfirm = async () => {
    try {
      setBusy(true)
      await onConfirm()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={handleConfirm} loading={busy || loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>}
    </Dialog>
  )
}
