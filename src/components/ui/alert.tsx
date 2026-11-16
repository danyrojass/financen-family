import * as React from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

const variants = {
  info: {
    className: 'border-primary/25 bg-primary/5 text-foreground',
    icon: <Info className="size-4 text-primary" />,
  },
  success: {
    className: 'border-success/25 bg-success/5 text-foreground',
    icon: <CircleCheck className="size-4 text-success" />,
  },
  warning: {
    className: 'border-warning/30 bg-warning/5 text-foreground',
    icon: <TriangleAlert className="size-4 text-warning" />,
  },
  danger: {
    className: 'border-destructive/30 bg-destructive/5 text-foreground',
    icon: <CircleAlert className="size-4 text-destructive" />,
  },
}

export function Alert({
  variant = 'info',
  title,
  children,
  className,
  action,
}: {
  variant?: keyof typeof variants
  title?: React.ReactNode
  children?: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  const config = variants[variant]
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border p-3 text-sm', config.className, className)}
    >
      <div className="mt-0.5 shrink-0">{config.icon}</div>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
      </div>
      {action}
    </div>
  )
}
