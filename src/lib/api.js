import { API_URL } from '../config.js'

/* Cliente del backend (backend/Api.gs).

   POST con Content-Type text/plain: así la petición es "simple" y el
   navegador no lanza un preflight OPTIONS, que Apps Script no contesta.
   La clave va en el CUERPO, nunca en la URL: las URL quedan en historiales,
   registros de proxys y en el Referer.

   Dónde se guarda la clave lo elige quien entra: sessionStorage (se borra al
   cerrar la pestaña) o localStorage («recordar en este dispositivo»). Ninguno
   es inmune a un XSS; por eso la otra mitad de la defensa es que no lo haya:
   escape en dom.js y CSP estricta. */

const CLAVE = 'ga_clave'
export const hayBackend = () => Boolean(API_URL)

export const clave = {
  get() {
    try { return sessionStorage.getItem(CLAVE) || localStorage.getItem(CLAVE) } catch { return null }
  },
  set(valor, recordar) {
    try {
      clave.borrar()
      ;(recordar ? localStorage : sessionStorage).setItem(CLAVE, valor)
    } catch { /* modo privado: vale solo para esta carga */ }
  },
  borrar() {
    try { sessionStorage.removeItem(CLAVE); localStorage.removeItem(CLAVE) } catch { /* nada */ }
  },
}

export class ErrorApi extends Error {
  constructor(msg, { claveMala = false } = {}) { super(msg); this.claveMala = claveMala }
}

export async function cartera(valorClave) {
  if (!API_URL) throw new ErrorApi('El backend no está configurado (src/config.js)')
  let r
  try {
    r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'cartera', clave: valorClave }),
      redirect: 'follow',
      credentials: 'omit',
    })
  } catch {
    throw new ErrorApi('Sin conexión con el servidor')
  }
  let j
  try { j = await r.json() } catch { throw new ErrorApi('Respuesta no válida del servidor') }
  if (!j.ok) throw new ErrorApi(j.error || 'Error', { claveMala: j.sesion === false })
  return j
}
