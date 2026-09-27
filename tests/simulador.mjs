/* Simulación mínima de Apps Script para ejecutar backend/Api.gs en Node.

   Solo lo que Api.gs usa. Las fechas se formatean en UTC: basta para probar
   la normalización (Date → aaaa-mm-dd) sin depender del huso de la máquina. */
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'

const fuente = fs.readFileSync(new URL('../backend/Api.gs', import.meta.url), 'utf8')

class Hoja {
  constructor(filas) { this.d = filas }
  getLastRow() { return this.d.length }
  getRange(r, c, nr = 1, nc = 1) {
    const d = this.d
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => d[r - 1 + i]?.[c - 1 + j] ?? '')),
      getValue: () => d[r - 1]?.[c - 1] ?? '',
    }
  }
}

const dos = (n) => String(n).padStart(2, '0')
function formatDate(f, _tz, patron) {
  const t = { yyyy: f.getUTCFullYear(), MM: dos(f.getUTCMonth() + 1), dd: dos(f.getUTCDate()), HH: dos(f.getUTCHours()), mm: dos(f.getUTCMinutes()), ss: dos(f.getUTCSeconds()) }
  return patron.replace(/'T'/, 'T').replace(/yyyy|MM|dd|HH|mm|ss/g, (k) => t[k])
}

/* hojas: { Nombre: [[fila1...], ...] } incluida la cabecera, como en la planilla. */
export function cargarApi(hojas, { props = new Map(), cache = new Map() } = {}) {
  let alerta = null
  const ss = {
    getSheetByName: (n) => (hojas[n] ? new Hoja(hojas[n]) : null),
    getSpreadsheetTimeZone: () => 'America/Santiago',
  }
  const G = {
    console: { error() {}, log() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getUi: () => ({ alert: (...a) => { alerta = a }, ButtonSet: { OK: 'OK' } }),
    },
    Utilities: {
      formatDate,
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_alg, texto) => [...crypto.createHash('sha256').update(texto, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
  }
  vm.createContext(G)
  vm.runInContext(fuente, G)
  return {
    G,
    props,
    ultimaAlerta: () => alerta,
    post: (cuerpo) => G.doPost({ postData: { contents: JSON.stringify(cuerpo) } }),
    get: () => G.doGet(),
  }
}

/* Genera una clave como lo hace el menú y la devuelve (la saca del diálogo). */
export function claveNueva(api) {
  api.G.generarClaveApi()
  return api.ultimaAlerta()[1].match(/[0-9a-f]{64}/)[0]
}
