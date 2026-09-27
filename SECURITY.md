# Seguridad — Gestor de acciones

Revisión propia al crear el proyecto (2026-09-27), sin auditoría externa. Las
pruebas de `tests/api.test.mjs` fijan los controles del backend.

## Qué se protege y de quién

| Activo | Amenaza |
|---|---|
| Historial de operaciones, montos y posiciones | Cualquiera en internet: el repo y la página son públicos |
| La clave de la API | Quien pueda editar la hoja; un XSS en la página; un historial o un registro de proxy |
| La cuota de Apps Script del dueño | Alguien que golpea la API sin clave (dejaría sin correr al lector de correos) |

## Controles

- **Nada de la cartera en el repo.** La semilla de `Code.gs` va vacía;
  `npm run check` rompe el build si `MOVIMIENTOS`/`WATCHLIST` traen datos, si
  aparece un correo personal o una cadena de 64 hex (forma de la clave).
  `.gitignore` excluye `*.xlsx`, `*.csv` y volcados `contrato*.json`.
- **Clave**: 64 hex aleatorios (dos UUID v4), mostrados una vez en un diálogo
  de la hoja y guardados solo como SHA-256 en las Propiedades del script: un
  editor de la hoja ve la huella, no la clave. No pasa por el registro de
  ejecución. Comparación en tiempo constante. Generar otra invalida la
  anterior.
- **Transporte**: la clave va en el cuerpo del POST, nunca en la URL.
- **Freno**: 10 fallos por minuto bloquean todas las peticiones (incluida la
  correcta) hasta el minuto siguiente. Apps Script no entrega la IP, así que
  no hay freno por origen (mismo razonamiento que VentasMaker, L7).
- **Mínimo expuesto**: la respuesta omite el ID de Gmail de cada correo y el
  email de alertas. `GET` no devuelve datos. Solo lectura: no hay ninguna
  acción que escriba en la hoja.
- **Front**: toda cadena de la hoja se pinta escapada (`src/lib/dom.js`);
  tooltips con `textContent`; CSP sin `unsafe-inline` ni `eval`, `connect-src`
  solo a Google Apps Script; anti-clickjacking por JS; `referrer: no-referrer`.
- **Dónde queda la clave en el navegador**: sessionStorage por defecto;
  localStorage solo si se marca «Recordar en este dispositivo». «Salir» borra
  las dos.
- **CI**: el trabajo que compila no puede escribir; el que publica solo escribe
  en Pages. `npm ci --ignore-scripts`, `npm audit`, acciones fijadas por SHA.

## Riesgos aceptados

1. **Quien edita la hoja controla el backend.** Puede cambiar el código,
   generar una clave nueva o leer los datos directamente. La hoja se comparte
   con nadie.
2. **Un tercero puede agotar el freno** con intentos falsos y dejar al dueño
   fuera un minuto a la vez. Es preferible a que agote la cuota diaria.
3. **Origen compartido `seiler18.github.io`**: el localStorage lo comparten
   todos los repos publicados bajo ese dominio. Un XSS en otro proyecto del
   mismo usuario podría leer una clave «recordada». Por eso recordar es
   opcional y no viene marcado.
