import type { Category, CategoryKind } from './models'

export interface SeedCategory {
  name: string
  kind: CategoryKind
  icon: string
  color: string
  parentName?: string
}

/**
 * Categorias iniciales del hogar. Son configuracion (no datos ficticios):
 * el usuario puede renombrarlas, archivarlas o crear subcategorias.
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  // Gastos
  { name: 'Alimentación', kind: 'expense', icon: 'Utensils', color: '#f97316' },
  { name: 'Supermercado', kind: 'expense', icon: 'ShoppingCart', color: '#fb923c' },
  { name: 'Restaurantes', kind: 'expense', icon: 'Coffee', color: '#f59e0b' },
  { name: 'Transporte', kind: 'expense', icon: 'Bus', color: '#3b82f6' },
  { name: 'Combustible', kind: 'expense', icon: 'Fuel', color: '#0ea5e9' },
  { name: 'Vivienda', kind: 'expense', icon: 'Home', color: '#8b5cf6' },
  { name: 'Servicios', kind: 'expense', icon: 'Zap', color: '#6366f1' },
  { name: 'Internet', kind: 'expense', icon: 'Wifi', color: '#818cf8', parentName: 'Servicios' },
  { name: 'Telefonía', kind: 'expense', icon: 'Smartphone', color: '#a5b4fc', parentName: 'Servicios' },
  { name: 'Salud', kind: 'expense', icon: 'HeartPulse', color: '#ef4444' },
  { name: 'Gimnasio', kind: 'expense', icon: 'Dumbbell', color: '#14b8a6' },
  { name: 'Educación', kind: 'expense', icon: 'GraduationCap', color: '#06b6d4' },
  { name: 'Entretenimiento', kind: 'expense', icon: 'Gamepad2', color: '#ec4899' },
  { name: 'Suscripciones', kind: 'expense', icon: 'Repeat', color: '#a855f7' },
  { name: 'Regalos', kind: 'expense', icon: 'Gift', color: '#f43f5e' },
  { name: 'Viajes', kind: 'expense', icon: 'Plane', color: '#10b981' },
  { name: 'Lotería y juegos', kind: 'expense', icon: 'Dices', color: '#eab308' },
  { name: 'Mascotas', kind: 'expense', icon: 'PawPrint', color: '#84cc16' },
  { name: 'Otros', kind: 'expense', icon: 'CircleEllipsis', color: '#94a3b8' },
  // Ingresos
  { name: 'Sueldo', kind: 'income', icon: 'Briefcase', color: '#16a34a' },
  { name: 'Alquiler', kind: 'income', icon: 'Building2', color: '#0d9488' },
  { name: 'Freelance', kind: 'income', icon: 'Laptop', color: '#2563eb' },
  { name: 'Ventas', kind: 'income', icon: 'Store', color: '#7c3aed' },
  { name: 'Intereses', kind: 'income', icon: 'Percent', color: '#0891b2' },
  { name: 'Otros ingresos', kind: 'income', icon: 'Wallet', color: '#64748b' },
]

/** Palabras clave usadas por el interprete de voz. */
export const CATEGORY_KEYWORDS: Array<{ keywords: string[]; categoryHint: string }> = [
  { keywords: ['supermercado', 'super', 'mercado', 'despensa', 'compra del mes'], categoryHint: 'Supermercado' },
  { keywords: ['restaurante', 'cena', 'almuerzo', 'pizzeria', 'hamburgues', 'cafeteria'], categoryHint: 'Restaurantes' },
  { keywords: ['comida', 'alimento', 'almacen', 'verduleria', 'carniceria'], categoryHint: 'Alimentación' },
  { keywords: ['uber', 'taxi', 'colectivo', 'bus', 'transporte', 'pasaje'], categoryHint: 'Transporte' },
  { keywords: ['nafta', 'combustible', 'gasolina', 'diesel', 'petrobras', 'puma'], categoryHint: 'Combustible' },
  { keywords: ['alquiler', 'expensas', 'casa', 'departamento', 'vivienda'], categoryHint: 'Vivienda' },
  { keywords: ['luz', 'ande', 'agua', 'essap', 'servicio', 'basura', 'municipalidad'], categoryHint: 'Servicios' },
  { keywords: ['internet', 'fibra', 'wifi', 'tigo hogar'], categoryHint: 'Internet' },
  { keywords: ['telefono', 'celular', 'telefonia', 'recarga', 'tigo', 'claro', 'personal'], categoryHint: 'Telefonía' },
  { keywords: ['farmacia', 'medico', 'doctor', 'remedio', 'salud', 'clinica', 'hospital'], categoryHint: 'Salud' },
  { keywords: ['gimnasio', 'gym', 'crossfit', 'entrenador'], categoryHint: 'Gimnasio' },
  { keywords: ['colegio', 'universidad', 'curso', 'educacion', 'matricula', 'utiles'], categoryHint: 'Educación' },
  { keywords: ['cine', 'netflix', 'spotify', 'juego', 'entretenimiento', 'salida', 'boliche'], categoryHint: 'Entretenimiento' },
  { keywords: ['suscripcion', 'youtube premium', 'disney', 'hbo', 'max'], categoryHint: 'Suscripciones' },
  { keywords: ['regalo', 'encomienda', 'cumpleaños', 'cumpleanos', 'presente'], categoryHint: 'Regalos' },
  { keywords: ['viaje', 'hotel', 'vuelo', 'vacaciones', 'turismo'], categoryHint: 'Viajes' },
  { keywords: ['loteria', 'quiniela', 'apuesta', 'casino', 'poceada'], categoryHint: 'Lotería y juegos' },
  { keywords: ['mascota', 'perro', 'gato', 'veterinaria', 'balanceado'], categoryHint: 'Mascotas' },
  { keywords: ['sueldo', 'salario', 'aguinaldo'], categoryHint: 'Sueldo' },
  { keywords: ['alquiler cobrado', 'cobre el alquiler', 'renta'], categoryHint: 'Alquiler' },
  { keywords: ['freelance', 'honorarios', 'cliente'], categoryHint: 'Freelance' },
  { keywords: ['venta', 'vendi'], categoryHint: 'Ventas' },
  { keywords: ['interes', 'rendimiento', 'plazo fijo'], categoryHint: 'Intereses' },
]

export const CASH_KEYWORDS = ['efectivo', 'contado', 'cash', 'plata en mano']
export const CARD_KEYWORDS = ['tarjeta', 'credito', 'crédito', 'visa', 'mastercard']
export const USD_KEYWORDS = ['dolar', 'dolares', 'usd', 'verde', 'verdes']
export const PYG_KEYWORDS = ['guarani', 'guaranies', 'gs', 'pyg', 'guaraní', 'guaraníes']

/** Categorias por defecto listas para persistir (sin ids). */
export function seedCategoryDocs(uid: string): Array<Omit<Category, 'id'>> {
  const now = new Date()
  const ids = new Map<string, string>()
  const docs: Array<Omit<Category, 'id'>> = []

  SEED_CATEGORIES.forEach((seed, index) => {
    const id = crypto.randomUUID()
    ids.set(seed.name, id)
    docs.push({
      name: seed.name,
      kind: seed.kind,
      parentId: null,
      color: seed.color,
      icon: seed.icon,
      isArchived: false,
      isSystem: true,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
      updatedBy: uid,
    })
  })

  SEED_CATEGORIES.forEach((seed, index) => {
    if (!seed.parentName) return
    const parentId = ids.get(seed.parentName)
    if (!parentId) return
    const doc = docs[index]
    if (doc) doc.parentId = parentId
  })

  return docs
}
