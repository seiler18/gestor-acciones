// backend/Api.gs ejecutado en Node con la simulación de tests/simulador.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargarApi, claveNueva } from './simulador.mjs'

const CAB_MOV = ['Fecha', 'Tipo', 'Activo', 'Ticker', 'Cantidad', 'Monto USD', 'Monto CLP', 'Tipo cambio', 'Comision CLP', 'Fuente', 'ID Correo']
function hojas() {
  return {
    Movimientos: [
      CAB_MOV,
      [new Date('2026-06-03T00:00:00Z'), 'Compra acción', 'Vanguard S&P 500 ETF', 'VOO', 0.2, 120, '', '', '', 'PDF', ''],
      ['08/01/2026', 'Venta acción', 'Meta Platforms Inc', 'META', '0,025', '17,5', '', '', '', 'Correo PDF', ''],
      [new Date('2025-12-30T00:00:00Z'), 'Venta USD', 'Dólares (USD)', 'USD', 300, 300, 276000, 920, 1200, 'PDF', ''],
      [new Date('2026-07-15T00:00:00Z'), 'Dividendo', 'Vanguard S&P 500 ETF', 'VOO', '', 0.4, '', '', '', 'Correo Gmail', '18f2c0ffee'],
      ['', '', '', '', '', '', '', '', '', '', ''],
      [new Date('2026-07-16T00:00:00Z'), 'Otro tipo', 'x', 'X', 1, 1, '', '', '', '', ''],
    ],
    Precios: [
      ['Ticker', 'Nombre', 'Precio actual (USD)', 'Cambio % hoy', 'Actualizado'],
      ['VOO', 'Vanguard S&P 500 ETF', 600, 0.004, new Date('2026-09-27T08:59:03Z')],
      ['META', 'Meta Platforms Inc', 'sin dato', '', new Date('2026-09-27T08:59:03Z')],
      ['USDCLP', 'Dólar observado (CLP/USD)', 950, -0.0008, new Date('2026-09-27T08:59:03Z')],
    ],
    Alertas: [['Fecha/Hora', '# Señales / evento', 'Detalle'], ...Array.from({ length: 40 }, (_, i) => [new Date(Date.UTC(2026, 6, 1 + i)), 'IMPORTACIÓN', `alerta ${i}`])],
    'Configuración': [['CONFIGURACIÓN', ''], ['', ''], ['Parámetro', 'Valor'], ['Email para alertas', 'alguien@ejemplo.cl'], ['VENDER…', 5], ['COMPRAR…', 3], ['Trigger cada (horas)', 8], ['Importar correos desde', '04/06/2026'], ['Última ejecución', new Date('2026-09-27T08:59:43Z')], ['Correos leídos (total)', 7]],
  }
}

test('GET solo dice que el servicio existe', () => {
  const r = cargarApi(hojas()).get()
  assert.deepEqual(r, { ok: true, servicio: 'gestor-acciones', version: 1 })
})

test('sin clave generada, nada entra', () => {
  const api = cargarApi(hojas())
  const r = api.post({ accion: 'cartera', clave: 'a'.repeat(64) })
  assert.equal(r.ok, false)
  assert.equal(r.sesion, false)
})

test('la clave se guarda solo como hash y se muestra una vez', () => {
  const api = cargarApi(hojas())
  const clave = claveNueva(api)
  assert.match(clave, /^[0-9a-f]{64}$/)
  const guardado = [...api.props.values()]
  assert.equal(guardado.length, 1)
  assert.notEqual(guardado[0], clave)
  assert.match(guardado[0], /^[0-9a-f]{64}$/)
})

test('clave incorrecta o ausente: sesion false; generar otra invalida la anterior', () => {
  const api = cargarApi(hojas())
  const vieja = claveNueva(api)
  assert.equal(api.post({ accion: 'cartera' }).sesion, false)
  assert.equal(api.post({ accion: 'cartera', clave: vieja.replace(/.$/, (c) => (c === '0' ? '1' : '0')) }).sesion, false)
  const nueva = claveNueva(api)
  assert.equal(api.post({ accion: 'cartera', clave: vieja }).ok, false)
  assert.equal(api.post({ accion: 'cartera', clave: nueva }).ok, true)
})

test('freno: tras 10 fallos en el minuto, ni la clave correcta pasa', () => {
  const api = cargarApi(hojas())
  const clave = claveNueva(api)
  for (let i = 0; i < 10; i++) api.post({ accion: 'cartera', clave: 'x'.repeat(40) })
  const r = api.post({ accion: 'cartera', clave })
  assert.equal(r.ok, false)
  assert.match(r.error, /Demasiados intentos/)
})

test('cuerpo roto o acción desconocida no revientan', () => {
  const api = cargarApi(hojas())
  const clave = claveNueva(api)
  assert.equal(api.G.doPost({ postData: { contents: '{no es json' } }).ok, false)
  assert.equal(api.post({ accion: 'borrarTodo', clave }).error, 'Acción desconocida')
})

test('contrato: hechos normalizados, sin ID de correo ni email', () => {
  const api = cargarApi(hojas())
  const r = api.post({ accion: 'cartera', clave: claveNueva(api) })
  assert.equal(r.ok, true)
  assert.equal(r.version, 1)
  assert.deepEqual(r.dolar, { clp: 950, actualizado: '2026-09-27T08:59:03' })
  assert.deepEqual(r.precios.map((p) => p.ticker), ['VOO', 'META'])
  assert.equal(r.precios[1].precio, null)
  // Filas vacías y tipos desconocidos fuera; orden cronológico; fecha en texto dd/mm/aaaa normalizada.
  assert.deepEqual(r.movimientos.map((m) => [m.fecha, m.tipo]), [['2025-12-30', 'ventaUsd'], ['2026-01-08', 'venta'], ['2026-06-03', 'compra'], ['2026-07-15', 'dividendo']])
  const meta = r.movimientos[1]
  assert.equal(meta.cantidad, 0.025)
  assert.equal(meta.usd, 17.5)
  assert.equal(r.movimientos[3].cantidad, null)
  const texto = JSON.stringify(r)
  assert.ok(!texto.includes('18f2c0ffee'), 'no expone el ID del correo')
  assert.ok(!texto.includes('@'), 'no expone el email de alertas')
  assert.deepEqual(r.umbrales, { ventaPct: 5, caidaPct: 3 })
  assert.equal(r.ultimaEjecucion, '2026-09-27T08:59:43')
  // Alertas: las 30 más recientes, la última primero.
  assert.equal(r.alertas.length, 30)
  assert.equal(r.alertas[0].detalle, 'alerta 39')
})
