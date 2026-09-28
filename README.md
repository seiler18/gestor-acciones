# Gestor de acciones

Dashboard web de una cartera de acciones: posiciones abiertas, resultado por
activo, dividendos por mes, cambio de dólares, alertas y movimientos.

El backend es una **hoja de Google** que lee sola los correos de la corredora
(Fintual): cada hora importa compras, ventas y dividendos y actualiza los
precios; cada 4 horas avisa por correo si algo cruza un umbral. Esta página
lee esa hoja a través de una API de solo lectura en Apps Script.

**En vivo:** https://seiler18.github.io/gestor-acciones/. Sin clave muestra
una cartera de ejemplo con montos inventados.

```
Gmail ─► Apps Script (lector de correos, precios, alertas)
              │ escribe
              ▼
         Hoja de Google ── Api.gs (POST + clave) ──► JSON "contrato v1"
                                                        │
                                   ┌────────────────────┼─────────────────┐
                              esta página          Excel / Power Query   otra plataforma
                         (calcula en el navegador)
```

## Decisiones

- **El backend entrega hechos, no cálculos.** Movimientos, precios, dólar y
  alertas (`docs/contrato.md`). Las posiciones y la G/P se calculan en
  `src/lib/cartera.js`, con la misma aritmética que la hoja (se validó contra
  el libro real al centavo). Otro backend que sirva ese JSON hace funcionar el
  dashboard sin reimplementar nada.
- **Privado con clave, público en demo.** El repo y la página son públicos; la
  cartera no. La API exige una clave de 64 caracteres que la hoja muestra una
  vez y guarda solo como SHA-256. Detalles: `SECURITY.md`.
- **Sin framework ni librería de gráficos.** Vite, JS de módulos, SVG y CSS a
  mano: 8 kB de JS comprimido y una CSP estricta sin `unsafe-inline`.

## Desarrollo

```bash
npm install
npm run dev       # sin API_URL: modo demo
npm test          # cálculo, API (Api.gs en Node con Apps Script simulado) y contrato
npm run build     # incluye npm run check
npm run preview   # como en producción, con la CSP activa
```

Backend: `backend/PASO-A-PASO.md`. Publicación: push a `main` (GitHub Actions).
