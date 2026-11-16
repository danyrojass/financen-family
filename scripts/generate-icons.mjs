/**
 * Genera los iconos de la PWA a partir de un SVG vectorial.
 *
 * Uso: npm run icons
 * Requiere `sharp` (devDependency). Los archivos se escriben en /public.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC_DIR = path.resolve(process.cwd(), 'public')
const BRAND = '#0f766e'
const BRAND_DARK = '#115e59'
const ACCENT = '#fbbf24'

function iconSvg({ maskable = false } = {}) {
  const scale = maskable ? 0.66 : 0.82
  const offset = (512 - 512 * scale) / 2
  const cornerRadius = maskable ? 0 : 112

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Finanzas del Hogar">
  <rect width="512" height="512" rx="${cornerRadius}" fill="${BRAND}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path d="M104 252 L256 128 L408 252" fill="none" stroke="#ecfdf5" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="148" y="238" width="216" height="158" rx="24" fill="${BRAND_DARK}" stroke="#ecfdf5" stroke-width="30"/>
    <rect x="192" y="302" width="26" height="54" rx="9" fill="${ACCENT}"/>
    <rect x="243" y="280" width="26" height="76" rx="9" fill="${ACCENT}"/>
    <rect x="294" y="322" width="26" height="34" rx="9" fill="${ACCENT}"/>
  </g>
</svg>`
}

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true })

  const regularSvg = iconSvg()
  await writeFile(path.join(PUBLIC_DIR, 'favicon.svg'), regularSvg, 'utf8')

  const targets = [
    { file: 'pwa-192x192.png', size: 192, maskable: false },
    { file: 'pwa-512x512.png', size: 512, maskable: false },
    { file: 'pwa-maskable-512x512.png', size: 512, maskable: true },
    { file: 'apple-touch-icon.png', size: 180, maskable: false },
    { file: 'favicon-32x32.png', size: 32, maskable: false },
  ]

  for (const target of targets) {
    const svg = iconSvg({ maskable: target.maskable })
    await sharp(Buffer.from(svg))
      .resize(target.size, target.size)
      .png({ compressionLevel: 9 })
      .toFile(path.join(PUBLIC_DIR, target.file))
    console.log(`generado public/${target.file}`)
  }
}

await main()
