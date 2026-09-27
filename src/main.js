import './styles/tokens.css'
import './styles/app.css'
import { protegerMarco } from './lib/marco.js'
import { html, pintar, $, aviso } from './lib/dom.js'
import { hayBackend, clave, cartera as pedirCartera, ErrorApi } from './lib/api.js'
import { calcularCartera } from './lib/cartera.js'
import { datosDemo } from './demo.js'
import { barras, divergentes, columnas, aplicarMedidas, activarTooltip } from './lib/graficos.js'
import { fUsd, fUsdSigno, fClp, fClpSigno, fNum, fAcciones, fPct, fPctSigno, fFecha, fFechaHora, fMes, dir } from './lib/formato.js'

protegerMarco()

const app = $('#app')
const estado = { modo: 'demo', datos: null, filtro: 'todos', verTodos: false }

const TIPOS = {
  compra: 'Compra',
  venta: 'Venta',
  dividendo: 'Dividendo',
  compraUsd: 'Compra de dólares',
  ventaUsd: 'Venta de dólares',
}
const FILTROS = [
  ['todos', 'Todos'],
  ['compra', 'Compras'],
  ['venta', 'Ventas'],
  ['dividendo', 'Dividendos'],
  ['dolares', 'Dólares'],
]
const FILAS_INICIALES = 20

/* ===== arranque ===== */

async function iniciar() {
  activarTooltip(document.body, $('#tip'))
  conectarAcceso()
  const guardada = hayBackend() ? clave.get() : null
  if (guardada) await cargarReal(guardada)
  else mostrar('demo', datosDemo())
}

async function cargarReal(valor) {
  pintarEstado('cargando')
  try {
    mostrar('real', await pedirCartera(valor))
    return true
  } catch (e) {
    if (e instanceof ErrorApi && e.claveMala) clave.borrar()
    if (!estado.datos) mostrar('demo', datosDemo())
    else pintarEstado()
    aviso(e.message || 'No se pudieron cargar tus datos', 'error')
    return false
  }
}

function mostrar(modo, datos) {
  estado.modo = modo
  estado.datos = datos
  estado.calculo = calcularCartera(datos)
  pintarEstado()
  pintarTodo()
}

/* ===== cabecera y acceso ===== */

function pintarEstado(cargando) {
  const d = estado.datos
  const chip = $('#estado')
  if (cargando) chip.textContent = 'Cargando tus datos…'
  else if (estado.modo === 'demo') chip.textContent = 'Datos de demostración'
  else chip.textContent = `Tus datos · hoja actualizada ${fFechaHora(d.ultimaEjecucion || d.generado.slice(0, 19))}`
  chip.dataset.modo = cargando ? 'cargando' : estado.modo

  const boton = $('#btn-acceso')
  boton.hidden = !hayBackend()
  boton.textContent = estado.modo === 'real' ? 'Salir' : 'Entrar con clave'
}

function conectarAcceso() {
  const dlg = $('#dlg-clave')
  const form = $('#form-clave')
  const error = $('#clave-error')

  $('#btn-acceso').addEventListener('click', () => {
    if (estado.modo === 'real') {
      clave.borrar()
      mostrar('demo', datosDemo())
      aviso('Sesión cerrada en este dispositivo')
      return
    }
    error.hidden = true
    form.reset()
    dlg.showModal()
  })
  $('#btn-cancelar').addEventListener('click', () => dlg.close())

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const valor = form.clave.value.trim()
    if (valor.length < 32) {
      error.textContent = 'La clave tiene 64 caracteres. Cópiala completa desde el menú de la hoja.'
      error.hidden = false
      return
    }
    const enviar = form.querySelector('[type=submit]')
    enviar.disabled = true
    try {
      const datos = await pedirCartera(valor)
      clave.set(valor, form.recordar.checked)
      dlg.close()
      mostrar('real', datos)
    } catch (err) {
      error.textContent = err.message || 'No se pudo entrar'
      error.hidden = false
    } finally {
      enviar.disabled = false
    }
  })
}

/* ===== secciones ===== */

function pintarTodo() {
  const c = estado.calculo
  pintar(app, html`
    ${estado.modo === 'demo' ? avisoDemo() : ''}
    ${resumen(c)}
    ${carteraActual(c)}
    ${resultadoPorActivo(c)}
    ${dividendos(c)}
    <div class="dos-col">
      ${alertas(estado.datos.alertas || [])}
      ${dolares(c)}
    </div>
    ${movimientos()}
  `)
  aplicarMedidas(app)
  pintarColumnasDividendos()
  conectarMovimientos()
}

function avisoDemo() {
  return html`<p class="banda-demo">
    Estás viendo una <b>cartera de ejemplo</b> con montos inventados.
    ${hayBackend() ? 'Entra con tu clave para ver la tuya.' : 'El backend todavía no está conectado (src/config.js).'}
  </p>`
}

function tile(etiqueta, valor, nota = '', clase = '') {
  return html`<div class="tile">
    <p class="tile-etq">${etiqueta}</p>
    <p class="tile-val ${clase}">${valor}</p>
    ${nota ? html`<p class="tile-nota">${nota}</p>` : ''}
  </div>`
}

function resumen(c) {
  const t = c.totales
  return html`<section class="resumen" aria-labelledby="h-resumen">
    <div class="hero">
      <h2 id="h-resumen" class="hero-etq">Resultado total de la cartera</h2>
      <p class="hero-cifra ${dir(t.resultado)}">${fUsdSigno(t.resultado)}</p>
      <p class="hero-sub">
        ${t.resultadoClp !== null ? html`≈ ${fClpSigno(t.resultadoClp)} al dólar de hoy · ` : ''}
        realizado ${fUsdSigno(t.gpRealizada)} · no realizado ${fUsdSigno(t.gpNoRealizada)} · dividendos ${fUsd(t.dividendos)}
      </p>
    </div>
    <div class="tiles">
      ${tile('Valor de la cartera hoy', fUsd(t.valorCartera), `${c.abiertas.length} posición${c.abiertas.length === 1 ? '' : 'es'} abierta${c.abiertas.length === 1 ? '' : 's'}`)}
      ${tile('Invertido en acciones', fUsd(t.invertido), 'suma de todas las compras')}
      ${tile('Recibido por ventas', fUsd(t.ventas))}
      ${tile('Dividendos acumulados', fUsd(t.dividendos))}
      ${tile('Dólar hoy', t.dolar !== null ? `$${fNum(t.dolar)}` : '—', 'CLP por USD')}
      ${tile('Comisiones pagadas', fClp(t.comisionesClp), 'en compra y venta de dólares')}
    </div>
  </section>`
}

function carteraActual(c) {
  if (!c.abiertas.length) {
    return html`<section class="panel"><h2>Cartera actual</h2><p class="vacio">No hay posiciones abiertas.</p></section>`
  }
  const filas = c.abiertas.map((p) => ({
    etiqueta: p.ticker,
    detalle: p.nombre,
    valor: p.valor ?? 0,
    texto: html`${fUsd(p.valor)} <small>${fPct(p.peso)}</small>`,
    tip: `${p.ticker}: ${fUsd(p.valor)} (${fPct(p.peso)} de la cartera)`,
  }))
  return html`<section class="panel" aria-labelledby="h-cartera">
    <header class="panel-cab">
      <h2 id="h-cartera">Cartera actual</h2>
      <p>Valor de cada posición abierta al precio de hoy, en USD</p>
    </header>
    ${barras(filas)}
    <div class="tabla-envoltura">
      <table>
        <thead><tr>
          <th scope="col">Activo</th><th scope="col" class="num">Acciones</th><th scope="col" class="num">Costo prom.</th>
          <th scope="col" class="num">Precio hoy</th><th scope="col" class="num">Cambio hoy</th><th scope="col" class="num">Valor</th>
          <th scope="col" class="num">G/P no realizada</th>
        </tr></thead>
        <tbody>
          ${c.abiertas.map((p) => html`<tr>
            <th scope="row"><b>${p.ticker}</b> <small>${p.nombre}</small></th>
            <td class="num">${fAcciones(p.tenencia)}</td>
            <td class="num">${fUsd(p.costoProm)}</td>
            <td class="num">${fUsd(p.precio)}</td>
            <td class="num ${dir(p.cambioDia)}">${fPctSigno(p.cambioDia)}</td>
            <td class="num">${fUsd(p.valor)}</td>
            <td class="num ${dir(p.gpNoRealizada)}">${fUsdSigno(p.gpNoRealizada)} <small>${p.costoProm ? fPctSigno(p.gpNoRealizada / (p.tenencia * p.costoProm)) : ''}</small></td>
          </tr>`)}
        </tbody>
      </table>
    </div>
  </section>`
}

function resultadoPorActivo(c) {
  const lista = [...c.posiciones].sort((a, b) => b.resultado - a.resultado)
  const filas = lista.map((p) => ({
    etiqueta: p.ticker,
    detalle: p.abierta ? 'abierta' : '',
    valor: p.resultado,
    clase: dir(p.resultado),
    texto: fUsdSigno(p.resultado),
    tip: `${p.ticker} · ${p.nombre}: realizado ${fUsdSigno(p.gpRealizada)}, no realizado ${fUsdSigno(p.gpNoRealizada)}, dividendos ${fUsd(p.dividendos)}`,
  }))
  return html`<section class="panel" aria-labelledby="h-resultado">
    <header class="panel-cab">
      <h2 id="h-resultado">Resultado por activo</h2>
      <p>Ganancia o pérdida realizada + no realizada + dividendos, en USD, de todo lo que has tenido</p>
      <ul class="leyenda" aria-label="Leyenda">
        <li><span class="muestra barra-pos"></span>Ganancia</li>
        <li><span class="muestra barra-neg"></span>Pérdida</li>
      </ul>
    </header>
    ${divergentes(filas)}
  </section>`
}

function dividendos(c) {
  const serie = c.dividendosPorMes
  if (!serie.length) return ''
  const total = serie.reduce((s, d) => s + d.usd, 0)
  return html`<section class="panel" aria-labelledby="h-div">
    <header class="panel-cab">
      <h2 id="h-div">Dividendos por mes</h2>
      <p>${fUsd(total)} en ${serie.length} meses · los meses sin dividendo cuentan como cero</p>
    </header>
    <div class="grafico" id="graf-div"></div>
  </section>`
}

/* El SVG se dibuja al ancho real del contenedor: con un viewBox fijo, el
   navegador escala también el texto y el eje queda enorme en escritorio y
   diminuto en móvil. */
function pintarColumnasDividendos() {
  const cont = $('#graf-div')
  if (!cont) return
  const serie = estado.calculo.dividendosPorMes
  const max = serie.reduce((m, d, i) => (d.usd > serie[m].usd ? i : m), 0)
  pintar(cont, columnas(
    serie.map((d) => ({ etiqueta: fMes(d.mes), valor: d.usd, tip: `${fMes(d.mes)}: ${fUsd(d.usd)}` })),
    { formato: fUsd, destacar: max, ancho: Math.max(280, Math.round(cont.clientWidth)) },
  ))
}

let esperaResize
window.addEventListener('resize', () => {
  clearTimeout(esperaResize)
  esperaResize = setTimeout(pintarColumnasDividendos, 150)
})

const CLASE_ALERTA = [
  [/señal/i, 'senal', 'Señal'],
  [/importaci/i, 'info', 'Importación'],
  [/auto-mapa/i, 'info', 'Activo nuevo'],
  [/revisar/i, 'revisar', 'Revisar'],
]

function alertas(lista) {
  return html`<section class="panel" aria-labelledby="h-alertas">
    <header class="panel-cab">
      <h2 id="h-alertas">Alertas recientes</h2>
      <p>Las escribe la hoja cada vez que corre (umbrales en su pestaña Configuración)</p>
    </header>
    ${lista.length
      ? html`<ol class="alertas">
          ${lista.slice(0, 12).map((a) => {
            const [, clase, nombre] = CLASE_ALERTA.find(([r]) => r.test(a.tipo)) || [null, 'info', a.tipo]
            return html`<li>
              <span class="chip chip-${clase}">${nombre}</span>
              <time>${fFechaHora(a.fecha)}</time>
              <p>${a.detalle}</p>
            </li>`
          })}
        </ol>`
      : html`<p class="vacio">Sin alertas.</p>`}
  </section>`
}

function dolares(c) {
  const f = c.flujoDolares
  const prom = (clp, usd) => (usd ? clp / usd : null)
  return html`<section class="panel" aria-labelledby="h-usd">
    <header class="panel-cab">
      <h2 id="h-usd">Cambio de dólares</h2>
      <p>Pesos que pasaron a dólares para invertir, y de vuelta</p>
    </header>
    <dl class="pares">
      <div><dt>Dólares comprados</dt><dd>${fUsd(f.comprados)} <small>por ${fClp(f.clpPagados)} · ${f.comprados ? `$${fNum(prom(f.clpPagados, f.comprados))}/USD` : '—'}</small></dd></div>
      <div><dt>Dólares vendidos</dt><dd>${fUsd(f.vendidos)} <small>por ${fClp(f.clpRecibidos)} · ${f.vendidos ? `$${fNum(prom(f.clpRecibidos, f.vendidos))}/USD` : '—'}</small></dd></div>
      <div><dt>Comisiones</dt><dd>${fClp(c.totales.comisionesClp)}</dd></div>
    </dl>
  </section>`
}

function movimientos() {
  return html`<section class="panel" aria-labelledby="h-mov">
    <header class="panel-cab">
      <h2 id="h-mov">Movimientos</h2>
      <p>Lo que leyó la hoja de tus correos de Fintual, más el historial cargado a mano</p>
    </header>
    <div class="filtros" role="group" aria-label="Filtrar movimientos">
      ${FILTROS.map(([id, nombre]) => html`<button type="button" class="filtro" data-filtro="${id}" aria-pressed="${estado.filtro === id}">${nombre}</button>`)}
    </div>
    <div id="tabla-mov"></div>
  </section>`
}

function pintarMovimientos() {
  const todos = [...(estado.datos.movimientos || [])].reverse()
  const f = estado.filtro
  const lista = todos.filter((m) => f === 'todos' || (f === 'dolares' ? m.ticker === 'USD' : m.tipo === f))
  const visibles = estado.verTodos ? lista : lista.slice(0, FILAS_INICIALES)
  pintar($('#tabla-mov'), html`<div class="tabla-envoltura">
      <table>
        <thead><tr>
          <th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Activo</th>
          <th scope="col" class="num">Cantidad</th><th scope="col" class="num">Monto USD</th><th scope="col" class="num">Monto CLP</th>
        </tr></thead>
        <tbody>
          ${visibles.map((m) => html`<tr>
            <td>${fFecha(m.fecha)}</td>
            <td><span class="tipo tipo-${m.tipo}">${TIPOS[m.tipo] || m.tipo}</span></td>
            <td><b>${m.ticker}</b> <small>${m.ticker === 'USD' ? '' : m.activo}</small></td>
            <td class="num">${m.tipo === 'dividendo' ? '—' : m.ticker === 'USD' ? fUsd(m.cantidad) : fAcciones(m.cantidad)}</td>
            <td class="num">${fUsd(m.usd)}</td>
            <td class="num">${m.clp ? fClp(m.clp) : '—'}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>
    ${lista.length > visibles.length
      ? html`<button type="button" class="mas" id="btn-mas">Mostrar los ${lista.length} movimientos</button>`
      : html`<p class="tabla-pie">${lista.length} movimiento${lista.length === 1 ? '' : 's'}</p>`}`)
}

function conectarMovimientos() {
  pintarMovimientos()
  const sec = $('#h-mov').closest('section')
  sec.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]')
    if (b) {
      estado.filtro = b.dataset.filtro
      estado.verTodos = false
      for (const x of sec.querySelectorAll('[data-filtro]')) x.setAttribute('aria-pressed', String(x === b))
      pintarMovimientos()
    }
    if (e.target.closest('#btn-mas')) {
      estado.verTodos = true
      pintarMovimientos()
    }
  })
}

iniciar()
