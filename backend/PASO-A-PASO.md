# Conectar la hoja con el dashboard web — paso a paso

Se hace una vez. Todo ocurre en la hoja **Fintual - Monitoreo en vivo**, con la
cuenta de Google dueña de la hoja. Nadie más necesita (ni debe tener) esa
cuenta.

## 1. Pegar el código

1. Hoja → **Extensiones → Apps Script**.
2. Reemplaza el contenido de `Código.gs` por `backend/Code.gs`
   (Ctrl+A → pegar). Se comparó línea a línea contra el código que corría el
   2026-09-27. Las diferencias están en su cabecera y ninguna toca los datos
   que ya tienes.
3. (Opcional) Guarda antes una copia del código actual fuera del repo. Si la
   guardas dentro, que termine en `_Original.gs` para que `.gitignore` la
   excluya: trae tu historial.
4. Botón **+** junto a «Archivos» → **Secuencia de comandos** → nómbralo `Api`
   y pega `backend/Api.gs`.
5. Ctrl+S.

Copia el texto desde GitHub (`Raw`) o desde el editor de código, **no** desde
un Google Doc: el Doc cambia las comillas y escapa caracteres (así se dañó la
copia de Drive del v4.1).

## 2. Generar la clave

1. Recarga la hoja (F5) para que aparezca el menú nuevo.
2. Menú **Fintual → Generar clave del dashboard web**. La primera vez pide
   autorizar: acepta.
3. Aparece la clave, de 64 caracteres. **Cópiala a tu gestor de contraseñas
   ahora**: no se vuelve a mostrar (la hoja guarda solo su huella SHA-256). Si
   la pierdes, genera otra; la anterior deja de servir en ese momento.

## 3. Publicar la aplicación web

1. En Apps Script: **Implementar → Nueva implementación**.
2. Engranaje → **Aplicación web**.
3. *Ejecutar como*: **Yo**. *Quién tiene acceso*: **Cualquier usuario**.
4. **Implementar** → autoriza → copia la **URL de la aplicación web**
   (termina en `/exec`).

«Cualquier usuario» es lo correcto. Sin la clave, la API solo contesta que
existe. Con «Solo yo», el navegador no podría leerla desde GitHub Pages.

Comprobación: abre la URL `/exec` en el navegador. Debe mostrar
`{"ok":true,"servicio":"gestor-acciones","version":1}`.

## 4. Conectar la página

La URL va en `src/config.js` (`API_URL`). Se sube con un commit y la página se
republica sola. La URL no es un secreto; la clave sí, y nunca va al repo.

## Actualizar después

Tras cambiar `Code.gs` o `Api.gs`: pega el archivo nuevo → Ctrl+S →
**Implementar → Gestionar implementaciones** → la existente → lápiz →
*Versión*: **Nueva versión** → Implementar.

**Nunca «Nueva implementación»** para actualizar: crea otra URL `/exec` y la
página, que tiene la vieja, deja de conectar.
