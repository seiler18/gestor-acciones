---
name: desplegar
description: Publicar la página del Gestor de acciones en GitHub Pages y verificar que salió bien. Úsala cuando digan "sube los cambios", "publica", "deploy", o pregunten por qué la página no se actualizó. No cubre el backend de la hoja (eso es desplegar-backend).
---

# Publicar la página

```
git push origin main
   └─> .github/workflows/deploy.yml
         ├─ build (sin permisos de escritura): npm ci --ignore-scripts → npm audit → npm run build (check + vite)
         └─ deploy (solo Pages): publica dist/
```

Tarda unos 2 minutos. En *Settings → Pages* del repo, la fuente debe ser
**GitHub Actions** (una vez, al crear el repo).

## Antes de subir

```bash
npm test
npm run build      # incluye check: si falla aquí, falla en Actions
npm run preview    # http://localhost:4173/gestor-acciones/ — CSP activa, rutas de producción
```

La revisión visual la hace el usuario. Lo que tú puedes comprobar: pruebas,
build, códigos HTTP y capturas con Chrome headless (ver `CLAUDE.md`,
Verificación). Si no lo comprobaste, dilo.

## Subir

```bash
git status
git add <archivos>          # nunca un .xlsx/.csv/contrato*.json: .gitignore los excluye, compruébalo igual
git commit -m "descripción concreta en español"
git push origin main
gh run watch
curl -s -o /dev/null -w "%{http_code}\n" https://seiler18.github.io/gestor-acciones/
```

Commit de una línea, sin `Co-Authored-By` ni firma del modelo (`../CLAUDE.md`).
Hacer push es publicar: confirma con el usuario antes del primero de la sesión.

## Si no se actualiza

- Actions en rojo → `gh run view --log-failed`. Casi siempre es `npm run check`.
- Verde pero se ve lo viejo → caché del navegador (Ctrl+F5); los assets llevan
  hash, `index.html` no.
- 404 en un asset → `base` en `vite.config.js` debe ser `/gestor-acciones/`.
