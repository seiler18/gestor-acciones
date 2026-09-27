# Gestor de acciones — cómo se trabaja aquí

Dashboard web (GitHub Pages, `seiler18/gestor-acciones`) de una cartera de
acciones de Fintual. El backend es la hoja de Google **«Fintual - Monitoreo en
vivo»** (cuenta `seiler18`), que lee los correos de Fintual con Apps Script.
Proyecto **nivel A**. Arquitectura y decisiones: `README.md`. Seguridad:
`SECURITY.md`.

## Mapa

| Qué | Dónde |
|---|---|
| Lector de correos, precios, hojas derivadas, alertas | `backend/Code.gs` (vive pegado en la hoja) |
| API de solo lectura + clave | `backend/Api.gs` |
| El JSON entre los dos lados | `docs/contrato.md` |
| Cálculo de posiciones y G/P | `src/lib/cartera.js` — **misma aritmética que la hoja** |
| Pantalla | `src/main.js` (secciones), `src/lib/graficos.js` (barras y columnas) |
| Aparecer al hacer scroll, cifras que cuentan; tema | `src/lib/movimiento.js`, `src/styles/movimiento.css`; `src/lib/tema.js` |
| Datos de ejemplo sin clave | `src/demo.js` — con la forma exacta del contrato |
| Cliente de la API; URL | `src/lib/api.js`; `src/config.js` |
| CSP | `vite.config.js` (solo en build) |

## Procedimientos y memoria

| Necesitas… | Skill |
|---|---|
| Llevar un cambio de `Code.gs`/`Api.gs` a la hoja, o la API no conecta | `desplegar-backend` |
| Publicar la página | `desplegar` |
| Leer la cartera desde otra plataforma (Excel, otra web) o cambiar de backend | `conectar-plataforma` |
| Dejar constancia de lo hecho | `registrar-hito` |

Qué se hizo antes y por qué: `.claude/hitos/` (empieza por su `README.md`).

## Reglas

1. **Ni un dato de la cartera real en el repo.** Es público: la clave protege
   la API, no el código. Semilla de `Code.gs` vacía, sin exportaciones
   (`*.xlsx`, `*.csv`, `contrato*.json`), sin montos reales en pruebas ni en
   hitos. `npm run check` vigila lo que puede; el resto es criterio. Para
   validar contra datos reales, trabaja en el scratchpad, no en `tests/`.
2. **El backend entrega hechos; el front calcula.** No agregues a `Api.gs`
   totales ni posiciones: rompe el contrato para cualquier otra plataforma.
3. **`cartera.js` y `buildPosiciones` (Code.gs) calculan igual.** G/P realizada
   = ventas − acciones vendidas × costo promedio. Si cambias una, cambia la
   otra, o el dashboard y la hoja dejan de cuadrar.
4. **El contrato cambia en cuatro sitios a la vez:** `Api.gs`,
   `docs/contrato.md`, `src/demo.js`, pruebas. `tests/contrato.test.mjs`
   atrapa la demo desalineada.
5. **Texto de la hoja = no confiable.** Se pinta con `html\`\`` (escapa);
   tooltips con `textContent`. Sin `style="..."` en el marcado: la CSP lo
   bloquea. Los largos de barra van por `data-w` → CSSOM.
6. Colores, tamaños y duraciones solo como tokens (`src/styles/tokens.css`).
   Paleta de datos de la skill `dataviz`; si cambias un color de serie, pasa
   su validador.
7. Tras cambiar `Code.gs`/`Api.gs`: **Nueva versión** de la misma
   implementación, nunca «Nueva implementación» (cambia la URL).

## Verificación

`npm test` (cálculo, `Api.gs` en Node con Apps Script simulado, contrato de la
demo) y `npm run build && npm run preview`. Capturas sin navegador interactivo:
`chrome.exe --headless=new --screenshot=… --window-size=1280,3200 <url>`, pero
**congela las animaciones**: las secciones salen sin revelar. Para ver la
página terminada o probar clics, `playwright-core` en el scratchpad con el
Chrome instalado (`executablePath`), bajando la página antes de capturar. Chrome
headless no baja de ~500 px de ancho, así que una captura a 390 px sale cortada
aunque la página esté bien. Pasa `--blink-settings=preferredColorScheme=1`
para el tema claro. El backend real solo se prueba desplegado.
