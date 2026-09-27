---
name: desplegar-backend
description: Llevar backend/Code.gs o backend/Api.gs a la hoja «Fintual - Monitoreo en vivo», y diagnosticar cuando la página no conecta con la API. Úsala tras cualquier cambio en backend/, cuando la página diga "Error interno", "Sin conexión", "Clave incorrecta" con una clave buena, o no cargue los datos reales.
---

# Desplegar el backend (Apps Script)

El backend **no se despliega con git**. `backend/` es la fuente; la copia que
corre vive pegada dentro de la hoja, en la cuenta de Google del dueño. Llevarla
allí es un copiar-pegar que hace **el dueño**. Tú no tienes su sesión de Google,
ni debes tenerla.

## Antes de pedir el redespliegue

```bash
npm test
```

En verde, y con prueba nueva en `tests/api.test.mjs` si cambiaste `Api.gs`.
`Code.gs` no tiene pruebas (depende de Gmail, UrlFetch y SpreadsheetApp a
fondo). Como mínimo, `node --check` sobre una copia `.js`, y revisión línea a
línea del diff.

## Pedirlo

Guía completa: `backend/PASO-A-PASO.md`. Lo normal:

1. Hoja → Extensiones → Apps Script → archivo correspondiente → Ctrl+A →
   pegar desde GitHub *Raw* (nunca desde un Google Doc: cambia las comillas y
   escapa `<`, `>`, `#`) → Ctrl+S.
2. **Implementar → Gestionar implementaciones → lápiz → Nueva versión →
   Implementar.** Nunca «Nueva implementación»: cambia la URL `/exec` y la
   página deja de conectar.

Si el cambio solo toca `Code.gs` y no la API, no hace falta nueva versión de la
aplicación web: el trigger usa el código guardado. Sí hace falta si cambió
`Api.gs`.

## Diagnóstico

| Síntoma | Causa probable |
|---|---|
| La URL `/exec` en el navegador no muestra `{"ok":true,"servicio":"gestor-acciones"…}` | No es la URL de la implementación actual, o el acceso no es «Cualquier usuario» |
| «Clave incorrecta» con la clave recién generada | Se copió con espacios o cortada (son 64 hex); o se generó otra después |
| «Demasiados intentos» | 10 fallos en el minuto: espera un minuto |
| «Error interno» | Excepción en `cartera_()`. Apps Script → Ejecuciones → ver el error. Casi siempre una hoja renombrada (`Movimientos`, `Precios`, `Alertas`, `Configuración`) |
| «Sin conexión con el servidor» | CORS por `Content-Type` distinto de `text/plain` en `src/lib/api.js`, o la CSP (`connect-src`) sin `script.googleusercontent.com` |
| Datos viejos | La API lee la hoja tal cual: mira «Última ejecución» en Configuración; si el trigger no corre, menú Fintual → Actualizar y revisar alertas |
