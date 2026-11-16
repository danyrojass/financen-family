import { cn, initials } from '@/lib/utils'

export function Avatar({
  name,
  src,
  className,
}: {
  name: string
  src?: string | null
  className?: string
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        className={cn('size-9 shrink-0 rounded-full border border-border object-cover', className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

export function AvatarStack({
  people,
  max = 3,
}: {
  people: Array<{ uid: string; displayName: string; photoURL: string | null }>
  max?: number
}) {
  const visible = people.slice(0, max)
  const remaining = people.length - visible.length
  return (
    <div className="flex -space-x-2">
      {visible.map((person) => (
        <Avatar
          key={person.uid}
          name={person.displayName}
          src={person.photoURL}
          className="size-7 ring-2 ring-card"
        />
      ))}
      {remaining > 0 ? (
        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
          +{remaining}
        </span>
      ) : null}
    </div>
  )
}
