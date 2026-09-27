# Contrato de datos — v1

Es la costura entre el backend y cualquier dashboard. El backend entrega
**hechos** (lo que pasó y lo que vale hoy); los cálculos (posiciones, costo
promedio, G/P) los hace quien muestra, con la aritmética de
`src/lib/cartera.js`.

Por eso cambiar de plataforma es servir este JSON desde otro lado (otra hoja,
un Excel, una base de datos) o leerlo desde otro lado (Power Query, otra web),
sin tocar la lógica.

## Pedirlo

```
POST <URL /exec de la aplicación web>
Content-Type: text/plain;charset=utf-8

{"accion": "cartera", "clave": "<64 caracteres hex>"}
```

- `text/plain` a propósito: con `application/json` el navegador manda un
  preflight OPTIONS que Apps Script no contesta.
- La clave va en el cuerpo, nunca en la URL.
- `GET` a la misma URL solo responde `{"ok":true,"servicio":"gestor-acciones","version":1}`.

Errores: `{"ok": false, "error": "…"}`. Con `"sesion": false` la clave es
incorrecta (o no hay ninguna generada). Tras 10 fallos en un minuto responde
«Demasiados intentos» a todos, incluida la clave correcta, hasta el minuto
siguiente.

## Respuesta

```jsonc
{
  "ok": true,
  "version": 1,                       // sube si cambia la forma
  "generado": "2026-09-27T12:00:00.000Z",   // ISO con huso: cuándo se armó la respuesta
  "zona": "America/Santiago",         // huso de la hoja; las fechas de abajo son locales a él
  "moneda": "USD",
  "dolar": { "clp": 950.0,  "actualizado": "2026-09-27T08:59:03" },   // o null
  "precios": [
    { "ticker": "VOO", "nombre": "Vanguard S&P 500 ETF",
      "precio": 600.0,                // USD; null si la hoja no lo consiguió
      "cambioDia": 0.0048,            // fracción: 0.0048 = +0,48 %; null si falta
      "actualizado": "2026-09-27T08:59:03" }
  ],
  "movimientos": [                    // orden cronológico
    { "fecha": "2026-06-03",          // aaaa-mm-dd, local a `zona`
      "tipo": "compra",               // compra | venta | dividendo | compraUsd | ventaUsd
      "activo": "Vanguard S&P 500 ETF",
      "ticker": "VOO",                // "USD" en compraUsd/ventaUsd
      "cantidad": 0.2,                // acciones; en USD, los dólares; null en dividendo
      "usd": 120.0,                 // monto en USD (compra, venta, dividendo o dólares cambiados)
      "clp": null,                    // solo compraUsd/ventaUsd
      "tipoCambio": null,             // solo compraUsd/ventaUsd
      "comisionClp": null,            // solo compraUsd/ventaUsd (estimada por la hoja: usd × 4)
      "fuente": "Correo Gmail" }
  ],
  "alertas": [                        // las 30 más recientes, la última primero
    { "fecha": "2026-09-27T08:59:43", "tipo": "1 señal(es)", "detalle": "🟢 VENDER? …" }
  ],
  "umbrales": { "ventaPct": 5, "caidaPct": 3 },
  "ultimaEjecucion": "2026-09-27T08:59:43"   // última corrida del trigger de la hoja
}
```

## Lo que no sale, a propósito

- El **ID del correo de Gmail** (columna K de Movimientos): identifica tu buzón
  y el dashboard no lo necesita.
- El **email de alertas** de la hoja Configuración.
- Las hojas derivadas (Posiciones, Resultados, Dashboard): son cálculos, no
  hechos.

## Cambiar el contrato

1. Cambia `backend/Api.gs` y sube `API_VERSION` si el cambio no es solo un
   campo nuevo opcional.
2. Actualiza este documento y `src/demo.js` (la demo debe tener la misma forma;
   lo comprueba `tests/contrato.test.mjs`).
3. `npm test`, y redespliega el backend (skill `desplegar-backend`).
