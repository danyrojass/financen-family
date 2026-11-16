import * as React from 'react'
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'default' | 'success' | 'error' | 'warning'

interface ToastItem {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (options: { title: string; description?: string; variant?: ToastVariant }) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="size-4" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  error: <XCircle className="size-4 text-destructive" />,
  warning: <TriangleAlert className="size-4 text-warning" />,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const remove = React.useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = React.useCallback<ToastContextValue['toast']>(
    ({ title, description, variant = 'default' }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setItems((current) => [...current.slice(-2), { id, title, description, variant }])
      window.setTimeout(() => remove(id), 5000)
    },
    [remove],
  )

  const value = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-lg animate-in-up',
              item.variant === 'error' && 'border-destructive/40',
              item.variant === 'success' && 'border-success/40',
              item.variant === 'warning' && 'border-warning/40',
            )}
          >
            <div className="mt-0.5 shrink-0">{ICONS[item.variant]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Cerrar notificación"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider')
  return context
}
