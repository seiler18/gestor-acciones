/* Verificador previo al build (va dentro de `npm run build`, así que un
   fallo rompe el deploy en vez de llegar a producción).

   Comprueba lo que Vite no ve:
   1. Colores literales fuera de tokens.css y duraciones literales.
   2. Atributos style="" en el marcado: la CSP los bloquea.
   3. Secretos que no deben llegar al repo público.
   4. Datos de la cartera real: el repo es público y la clave solo protege la
      API, no lo que esté escrito en el código. La semilla de Code.gs debe ir
      vacía y no puede aparecer un correo ni una clave de 64 hex. */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const fallos = []
const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const rel = (f) => relative(raiz, f).replaceAll('\\', '/')

function archivos(dir, ext) {
  if (!existsSync(dir)) return []
  const out = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...archivos(p, ext))
    else if (ext.includes(extname(n))) out.push(p)
  }
  return out
}

// 1
for (const f of archivos(join(raiz, 'src/styles'), ['.css'])) {
  if (f.endsWith('tokens.css')) continue
  readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    const s = l.replace(/\/\*.*?\*\//g, '')
    if (/#[0-9a-fA-F]{3,8}\b/.test(s) || /rgba?\(/.test(s)) fallos.push(`${rel(f)}:${i + 1} color literal: ${l.trim()}`)
    if (/(transition|animation)[^;]*\b\d+m?s\b/.test(s)) fallos.push(`${rel(f)}:${i + 1} duración literal: ${l.trim()}`)
  })
}

// 2
for (const f of [...archivos(join(raiz, 'src'), ['.js']), join(raiz, 'index.html')]) {
  readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    if (/<[a-z][^>]*\sstyle="/.test(l)) fallos.push(`${rel(f)}:${i + 1} atributo style="" (lo bloquea la CSP)`)
  })
}

// 3 y 4
const fuentes = [
  ...archivos(join(raiz, 'src'), ['.js', '.css']),
  // Las copias *_Original.gs están en .gitignore: son el script real con su historial, nunca van al repo.
  ...archivos(join(raiz, 'backend'), ['.gs', '.json', '.md']).filter((f) => !/_Original.gs$/.test(f)),
  ...archivos(join(raiz, 'docs'), ['.md']),
  ...archivos(join(raiz, 'tests'), ['.mjs', '.js', '.json']),
  join(raiz, 'index.html'),
].filter(existsSync)
const SECRETOS = [/gh[opsu]_[A-Za-z0-9]{30,}/, /AIza[0-9A-Za-z_-]{35}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b[0-9a-f]{64}\b/]
const CORREO = /[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo|icloud|opciones)\.[a-z.]+/i
for (const f of fuentes) {
  const t = readFileSync(f, 'utf8')
  if (SECRETOS.some((r) => r.test(t))) fallos.push(`${rel(f)}: posible secreto o clave en el código`)
  if (CORREO.test(t)) fallos.push(`${rel(f)}: dirección de correo personal en el código`)
}

const code = readFileSync(join(raiz, 'backend/Code.gs'), 'utf8')
if (!/^var MOVIMIENTOS = \[\];$/m.test(code)) fallos.push('backend/Code.gs: MOVIMIENTOS debe ir vacío (historial real = dato personal)')
if (!/^var WATCHLIST = \[\];$/m.test(code)) fallos.push('backend/Code.gs: WATCHLIST debe ir vacío')

if (fallos.length) {
  console.error(`✗ ${fallos.length} problema(s):\n  ` + fallos.join('\n  '))
  process.exit(1)
}
console.log(`✓ check: estilos, CSP, secretos y datos personales en orden (${fuentes.length} archivos)`)
