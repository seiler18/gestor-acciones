// Cálculo de la cartera (src/lib/cartera.js). Casos con números a mano.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCartera, dividendosPorMes } from '../src/lib/cartera.js'

const mov = (fecha, tipo, ticker, cantidad, usd, extra = {}) => ({ fecha, tipo, ticker, activo: ticker, cantidad, usd, clp: null, tipoCambio: null, comisionClp: null, fuente: 't', ...extra })
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`)

test('costo promedio y G/P de una posición abierta con venta parcial', () => {
  const c = calcularCartera({
    precios: [{ ticker: 'VOO', nombre: 'Vanguard S&P 500 ETF', precio: 120 }],
    movimientos: [mov('2026-01-01', 'compra', 'VOO', 1, 100), mov('2026-02-01', 'compra', 'VOO', 1, 110), mov('2026-03-01', 'venta', 'VOO', 0.5, 60), mov('2026-03-10', 'dividendo', 'VOO', null, 1.5)],
  })
  const p = c.posiciones[0]
  cerca(p.costoProm, 105, 'costo promedio')
  cerca(p.tenencia, 1.5, 'tenencia')
  cerca(p.valor, 180, 'valor')
  cerca(p.gpRealizada, 60 - 0.5 * 105, 'realizada')
  cerca(p.gpNoRealizada, 180 - 1.5 * 105, 'no realizada')
  cerca(p.resultado, 7.5 + 22.5 + 1.5, 'resultado')
  assert.equal(p.abierta, true)
  cerca(p.peso, 1, 'peso')
  assert.equal(p.nombre, 'Vanguard S&P 500 ETF')
})

test('un residuo de fracción no es una posición y no carga todo el costo a la venta', () => {
  // Compró 2, vendió 1,9999: queda 0,0001, que es residuo y no posición.
  const c = calcularCartera({ precios: [{ ticker: 'ABC', precio: 21 }], movimientos: [mov('2026-01-01', 'compra', 'ABC', 2, 40), mov('2026-02-01', 'venta', 'ABC', 1.9999, 41)] })
  const p = c.posiciones[0]
  assert.equal(p.tenencia, 0)
  assert.equal(p.abierta, false)
  cerca(p.gpRealizada, 41 - 1.9999 * 20, 'realizada con costo de lo vendido')
  assert.equal(c.abiertas.length, 0)
  assert.equal(c.totales.valorCartera, 0)
})

test('sin precio: valor nulo, no cero inventado, y la G/P no realizada queda en 0', () => {
  const c = calcularCartera({ precios: [{ ticker: 'X', precio: null }], movimientos: [mov('2026-01-01', 'compra', 'X', 2, 20)] })
  assert.equal(c.posiciones[0].valor, null)
  assert.equal(c.posiciones[0].gpNoRealizada, 0)
})

test('los movimientos de dólares no son posiciones, pero sus comisiones suman', () => {
  const c = calcularCartera({
    dolar: { clp: 950 },
    precios: [],
    movimientos: [mov('2026-01-01', 'compraUsd', 'USD', 100, 100, { clp: 93000, comisionClp: 400 }), mov('2026-02-01', 'ventaUsd', 'USD', 50, 50, { clp: 47000, comisionClp: 200 })],
  })
  assert.equal(c.posiciones.length, 0)
  assert.equal(c.totales.comisionesClp, 600)
  assert.deepEqual(c.flujoDolares, { comprados: 100, vendidos: 50, clpPagados: 93000, clpRecibidos: 47000 })
  assert.equal(c.totales.resultadoClp, 0)
})

test('dividendos por mes: serie continua, meses vacíos en cero, cruza el año', () => {
  const s = dividendosPorMes([mov('2025-11-05', 'dividendo', 'A', null, 1), mov('2025-11-20', 'dividendo', 'B', null, 0.5), mov('2026-02-01', 'dividendo', 'A', null, 2)])
  assert.deepEqual(s, [{ mes: '2025-11', usd: 1.5 }, { mes: '2025-12', usd: 0 }, { mes: '2026-01', usd: 0 }, { mes: '2026-02', usd: 2 }])
  assert.deepEqual(dividendosPorMes([]), [])
})

test('totales del resultado = realizada + no realizada + dividendos, en USD y CLP', () => {
  const c = calcularCartera({
    dolar: { clp: 1000 },
    precios: [{ ticker: 'A', precio: 12 }, { ticker: 'B', precio: 5 }],
    movimientos: [mov('2026-01-01', 'compra', 'A', 1, 10), mov('2026-01-01', 'compra', 'B', 2, 12), mov('2026-02-01', 'venta', 'B', 2, 10), mov('2026-03-01', 'dividendo', 'A', null, 0.3)],
  })
  const t = c.totales
  cerca(t.gpRealizada, -2, 'realizada')
  cerca(t.gpNoRealizada, 2, 'no realizada')
  cerca(t.resultado, 0.3, 'resultado')
  cerca(t.resultadoClp, 300, 'CLP')
  assert.deepEqual(c.abiertas.map((p) => p.ticker), ['A'])
  assert.deepEqual(c.cerradas.map((p) => p.ticker), ['B'])
})
