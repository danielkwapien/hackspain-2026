---
name: express
description: Carril express para cambios pequeños y directos (copys, estilos,
  ajustes de una pantalla). Implementa, pasa typecheck y test, y commitea. Sin
  spec, sin cola, sin adversario.
disable-model-invocation: true
---
# Express: el carril sin pipeline

Para retoques que no justifican el pipeline completo. La velocidad es el punto;
la frontera del carril es estricta para que la velocidad no se coma la doctrina.

## Protocolo

1. Evalua el alcance ANTES de tocar nada: lista los ficheros que vas a cambiar.
2. Frontera del carril (cualquiera de estas lo saca de express):
   - Mas de 3 ficheros tocados.
   - Cualquier fichero bajo evals/.
   - TASKQUEUE.md o specs de features.
   - Cualquier cosa de lane cerrado (migraciones, borrados, auth, pagos, prod).
   Si se cruza la frontera: NIEGATE y redirige a /new-feature con una linea
   explicando por que.
3. Implementa el cambio.
4. Verifica: cd app && corepack pnpm typecheck && corepack pnpm test. Rojo =
   arregla o revierte; nunca commitees en rojo.
5. Commit de los ficheros concretos tocados, formato "<área>: <qué>", sin
   co-author y sin emojis.

## Reglas

- Un express = un cambio. Dos peticiones distintas son dos pasadas de express.
- Sin spec, sin cola, sin adversario: ese es el trato, y por eso la frontera
  de arriba no se negocia.
- Si al implementar descubres que el cambio era mas grande de lo que parecia,
  para, revierte lo tocado y redirige a /new-feature.
