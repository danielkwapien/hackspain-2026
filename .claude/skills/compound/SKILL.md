---
name: compound
description: Captura la leccion operativa de una tarea que se cierra y la escribe en
  la seccion Lecciones de AGENTS.md. Usar al cerrar cada tarea del loop, tras el
  veredicto de scorer y adversary.
---
# Compound: interes compuesto de lecciones

Objetivo: que cada tarea cerrada deje al sistema un poco mas listo que antes.
Las lecciones viven en AGENTS.md porque es lo que todos los agentes cargan.

## Protocolo

1. Repasa que paso en la tarea: tickets del adversary, fallos del scorer,
   reintentos del builder, sorpresas del entorno.
2. Preguntate si hay UNA leccion operativa reutilizable. Cuenta como leccion:
   - Un patron de fallo del modelo (p. ej. "el builder tiende a editar ficheros
     de otra feature cuando comparten componente").
   - Una convencion descubierta del stack o del repo.
   - Un comando concreto que hay que usar (o evitar) y por que.
3. Si hay leccion: añadela como UNA linea nueva al final de la seccion
   "## Lecciones" de AGENTS.md. Formato: guion, frase imperativa, concreta y
   accionable. Sin fecha, sin firma, sin emojis.
4. Si no hay leccion clara: NO escribas nada. Una leccion vaga ("tener cuidado
   con los tests") contamina el fichero que todos cargan.

## Reglas

- Solo tocas AGENTS.md y solo su seccion "## Lecciones". Nada mas.
- Nunca creas ficheros nuevos: ni notas, ni docs, ni resumenes aparte.
- Una linea por tarea como maximo. Si hay dos lecciones, elige la que mas
  dinero ahorra la proxima vez.
- No dupliques: si la leccion ya esta en la lista, no la repitas ni la
  parafrasees. Si la matiza, edita esa linea en su lugar.
- Las lecciones son del sistema, no del incidente: escribe la regla general,
  no la anecdota ("usar corepack pnpm --filter", no "ayer fallo un cd").
