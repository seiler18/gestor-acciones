import { defineConfig } from 'vite'

/* Content-Security-Policy: solo en el build. En `npm run dev` Vite inyecta
   estilos y el cliente de recarga en línea, y una CSP estricta los bloquearía.
   GitHub Pages no deja poner cabeceras, así que va como <meta>: cubre todo
   salvo frame-ancestors, que se resuelve en JS (src/lib/marco.js).

   connect-src: Apps Script responde desde script.google.com y redirige a
   script.googleusercontent.com — hacen falta los dos. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function csp() {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml(html) {
      // Justo después del charset, que debe quedar en los primeros bytes.
      return html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`)
    },
  }
}

/* base = "/NOMBRE-DEL-REPO/" porque se publica en seiler18.github.io/gestor-acciones/. */
export default defineConfig({
  base: '/gestor-acciones/',
  plugins: [csp()],
})
