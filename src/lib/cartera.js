/* Cálculo de la cartera a partir de los hechos del contrato (docs/contrato.md).

   Es la MISMA aritmética que las hojas Posiciones y Resultados de la planilla
   (backend/Code.gs, buildPosiciones): costo promedio de todas las compras,
   G/P realizada = ventas − acciones vendidas × costo promedio. Si cambias una
   fórmula aquí, el dashboard y la hoja dejan de cuadrar. Se validó contra el
   libro real el 2026-09-27 (hito 0001); tests/cartera.test.mjs fija los casos.

   Sin DOM ni red: corre igual en el navegador y en Node. */

// Por debajo de esto una tenencia es residuo de fracciones (0,0001 acciones),
// no una posición. Es el mismo umbral que usa la hoja.
export const RESIDUO = 0.001

const TIPOS_ACCION = new Set(['compra', 'venta', 'dividendo'])

export function calcularCartera(datos) {
  const precios = new Map((datos.precios || []).map((p) => [p.ticker, p]))
  const porTicker = new Map()

  for (const m of datos.movimientos || []) {
    if (!TIPOS_ACCION.has(m.tipo) || !m.ticker || m.ticker === 'USD') continue
    let p = porTicker.get(m.ticker)
    if (!p) {
      p = { ticker: m.ticker, activo: m.activo, comprado: 0, invertido: 0, vendido: 0, ventas: 0, dividendos: 0, primera: m.fecha, ultima: m.fecha }
      porTicker.set(m.ticker, p)
    }
    const cant = m.cantidad || 0
    const usd = m.usd || 0
    if (m.tipo === 'compra') { p.comprado += cant; p.invertido += usd }
    if (m.tipo === 'venta') { p.vendido += cant; p.ventas += usd }
    if (m.tipo === 'dividendo') p.dividendos += usd
    if (m.fecha < p.primera) p.primera = m.fecha
    if (m.fecha > p.ultima) p.ultima = m.fecha
  }

  const posiciones = [...porTicker.values()]
    .sort((a, b) => (a.ticker < b.ticker ? -1 : 1))
    .map((p) => {
      const pr = precios.get(p.ticker)
      const bruto = p.comprado - p.vendido
      const tenencia = Math.abs(bruto) < RESIDUO ? 0 : bruto
      const costoProm = p.comprado > 0 ? p.invertido / p.comprado : 0
      const precio = pr && typeof pr.precio === 'number' ? pr.precio : null
      const abierta = tenencia > RESIDUO
      const valor = precio !== null ? tenencia * precio : null
      // Ventas − costo promedio de lo vendido. Con residuos de fracción (vendiste
      // 1,9999 de 2) no se carga todo el costo a la venta.
      const gpRealizada = p.ventas - p.vendido * costoProm
      const gpNoRealizada = abierta && precio !== null ? valor - tenencia * costoProm : 0
      return {
        ...p,
        nombre: (pr && pr.nombre && pr.nombre !== p.ticker ? pr.nombre : '') || p.activo || p.ticker,
        tenencia,
        costoProm,
        precio,
        cambioDia: pr && typeof pr.cambioDia === 'number' ? pr.cambioDia : null,
        abierta,
        valor,
        gpRealizada,
        gpNoRealizada,
        resultado: gpRealizada + gpNoRealizada + p.dividendos,
      }
    })

  const suma = (campo, lista = posiciones) => lista.reduce((s, p) => s + (typeof p[campo] === 'number' ? p[campo] : 0), 0)
  const abiertas = posiciones.filter((p) => p.abierta)
  const valorCartera = suma('valor', abiertas)
  for (const p of abiertas) p.peso = valorCartera > 0 && p.valor !== null ? p.valor / valorCartera : null

  const comisionesClp = (datos.movimientos || []).reduce((s, m) => s + (m.comisionClp || 0), 0)
  const resultado = suma('resultado')
  const dolar = datos.dolar && typeof datos.dolar.clp === 'number' ? datos.dolar.clp : null

  return {
    posiciones,
    abiertas: abiertas.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)),
    cerradas: posiciones.filter((p) => !p.abierta),
    totales: {
      invertido: suma('invertido'),
      ventas: suma('ventas'),
      dividendos: suma('dividendos'),
      valorCartera,
      gpRealizada: suma('gpRealizada'),
      gpNoRealizada: suma('gpNoRealizada'),
      resultado,
      comisionesClp,
      dolar,
      resultadoClp: dolar !== null ? resultado * dolar : null,
    },
    dividendosPorMes: dividendosPorMes(datos.movimientos || []),
    flujoDolares: flujoDolares(datos.movimientos || []),
  }
}

/* Serie mensual continua: los meses sin dividendo van en 0, no se saltan
   (un hueco en el eje del tiempo esconde que ese mes no hubo nada). */
export function dividendosPorMes(movimientos) {
  const meses = new Map()
  for (const m of movimientos) {
    if (m.tipo !== 'dividendo') continue
    const k = m.fecha.slice(0, 7)
    meses.set(k, (meses.get(k) || 0) + (m.usd || 0))
  }
  if (!meses.size) return []
  const claves = [...meses.keys()].sort()
  const out = []
  let [a, mes] = claves[0].split('-').map(Number)
  const [aFin, mesFin] = claves[claves.length - 1].split('-').map(Number)
  while (a < aFin || (a === aFin && mes <= mesFin)) {
    const k = `${a}-${String(mes).padStart(2, '0')}`
    out.push({ mes: k, usd: meses.get(k) || 0 })
    mes++
    if (mes > 12) { mes = 1; a++ }
  }
  return out
}

export function flujoDolares(movimientos) {
  const f = { comprados: 0, vendidos: 0, clpPagados: 0, clpRecibidos: 0 }
  for (const m of movimientos) {
    if (m.tipo === 'compraUsd') { f.comprados += m.usd || 0; f.clpPagados += m.clp || 0 }
    if (m.tipo === 'ventaUsd') { f.vendidos += m.usd || 0; f.clpRecibidos += m.clp || 0 }
  }
  return f
}
