import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase()
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Codigo de invitacion: alta entropia, apto para URL. */
export function generateInviteCode(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('')
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function safeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}
