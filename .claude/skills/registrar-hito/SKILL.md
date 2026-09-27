---
name: registrar-hito
description: Dejar constancia en .claude/hitos/ de un cambio relevante del Gestor de acciones (backend, contrato, dashboard, una plataforma nueva). Úsala al terminar un trabajo con sustancia o cuando pidan "registra esto", "anota el hito" o pregunten "¿en qué estábamos?".
---

# Registrar un hito

Los hitos son la memoria: **qué** se hizo, **cuándo** y sobre todo **por qué**.
`CLAUDE.md` dice cómo se trabaja hoy; los hitos, cómo se llegó hasta aquí.
**Un hito no se edita ni se borra**: si una decisión cambió, se escribe otro
que referencia al anterior.

## Cuándo sí / cuándo no

Sí: cambios del contrato, del backend en la hoja, del cálculo, una plataforma
nueva conectada, decisiones con alternativas descartadas. No: typos, ajustes
de color, lo que `git log` ya cuenta igual de bien. Si dudas: ¿le serviría a
alguien que retome esto en seis meses?

## Cómo

1. `ls .claude/hitos/` → siguiente número de cuatro dígitos:
   `0002-slug-en-kebab-case.md`, sin acentos ni mayúsculas en el nombre del archivo
   (GitHub distingue mayúsculas).
2. Escribir con estas secciones (todas; «Ninguna» si no aplica):

```markdown
# NNNN — Título corto y concreto

- **Fecha:** YYYY-MM-DD
- **Estado:** completado | en curso | revertido
- **Commits:** `hash`  (o "pendiente de commit")

## Contexto
## Qué se hizo
## Decisiones y alternativas descartadas
## Consecuencias
## Pendiente
```

3. Una línea en `.claude/hitos/README.md`, **la más reciente arriba**, con el
   nombre de archivo copiado con `ls`.
4. Si cambió cómo se trabaja, actualiza `CLAUDE.md`; si cambió un
   procedimiento, la skill correspondiente.

## Regla propia de este repo

**Sin montos, cantidades ni tickers de la cartera real.** El repo es público.
«La validación cuadró al centavo con los totales de la hoja» sí; «el total
realizado es US$ …» no. Español, pasado, fechas absolutas.

Sin firma ni atribución al modelo (regla de `../CLAUDE.md`).
