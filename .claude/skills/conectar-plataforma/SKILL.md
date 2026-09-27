---
name: conectar-plataforma
description: Leer la cartera desde otra plataforma (un Excel con Power Query, otra página, un script) o reemplazar la hoja de Google por otro backend, sin reescribir el dashboard. Úsala cuando pidan "verlo en Excel", "otro dashboard", "cambiar de backend", "sacar la hoja de Google".
---

# Conectar otra plataforma

La costura es `docs/contrato.md`: el backend entrega **hechos** y quien
muestra **calcula**. Hay dos direcciones.

## A. Otro consumidor lee la misma API

### Excel (Power Query)

Solo lectura: el Excel se refresca desde la hoja; no la reemplaza.

*Datos → Obtener datos → Desde otras fuentes → Consulta en blanco →
Editor avanzado*:

```powerquery
let
    Url   = "https://script.google.com/macros/s/<ID>/exec",
    Clave = Excel.CurrentWorkbook(){[Name="Clave"]}[Content]{0}[Column1],
    Resp  = Json.Document(Web.Contents(Url, [
                Headers = [#"Content-Type" = "text/plain;charset=utf-8"],
                Content = Text.ToBinary("{""accion"":""cartera"",""clave"":""" & Clave & """}")
            ])),
    Movs  = Table.FromRecords(Resp[movimientos])
in
    Movs
```

Repite con `Resp[precios]` y `Resp[alertas]`. Las posiciones se arman con una
tabla dinámica sobre Movimientos (suma de `cantidad` y `usd` por `ticker` y
`tipo`) y la aritmética de `src/lib/cartera.js` en columnas calculadas:
costo promedio = invertido / comprado; G/P realizada = ventas − vendido ×
costo promedio.

Avisos:
- La clave queda **dentro del .xlsx** (una celda con nombre `Clave`). Ese
  archivo no va nunca a un repo ni a una carpeta compartida.
- **Sin probar todavía** (2026-09-27): Apps Script responde un 302 a
  `script.googleusercontent.com`. Si Power Query no sigue la redirección de un
  POST, la alternativa es un `GET` con la clave en la URL, que **no** se hace:
  deja la clave en registros. En ese caso, registra un hito con lo que pasó
  antes de inventar otra vía.

### Otra página o script

Copia `src/lib/api.js` (POST `text/plain`, clave en el cuerpo) y
`src/lib/cartera.js` (cálculo puro, sin DOM). No hay lista de orígenes que
mantener: Apps Script responde a cualquiera y el control es la clave. Lo que
sí hay que ajustar es la CSP de la página nueva (`connect-src`).

## B. Otro backend sirve el mismo JSON

Para dejar la hoja de Google (otra planilla, una base de datos, un JSON
estático cifrado…):

1. Implementa `POST {accion:"cartera", clave}` → forma exacta de
   `docs/contrato.md`, con los mismos controles (hash de la clave, freno,
   nada de identificadores del buzón).
2. Reutiliza `tests/api.test.mjs` como especificación: cada prueba describe
   algo que el backend nuevo debe cumplir.
3. Cambia `API_URL` en `src/config.js` y `connect-src` en `vite.config.js`.
4. El lector de correos (`Code.gs`, `parsearCorreo_`) es lo único que hay que
   portar de verdad: las expresiones regulares que leen los correos de
   Fintual.

Cierra con la skill `registrar-hito`: qué plataforma, qué funcionó, qué no.
