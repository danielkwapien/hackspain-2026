---
name: queue-build
description: Construye o actualiza TASKQUEUE.md con las features listas
  (spec + mock aprobado + check en rojo) y valida las restricciones de la cola
  nocturna. Imprime el comando /goal listo para pegar.
disable-model-invocation: true
---
# Queue-build: encolar lo que esta listo

TASKQUEUE.md es single-writer (orquestador del loop + Gate); esta skill actua como
brazo del Gate en sesion interactiva.

## Protocolo

1. Recorre features/: una feature es encolable si tiene spec.md completo, mock
   app.html aprobado por un humano y check validado en rojo sobre main.
2. Escribe o actualiza TASKQUEUE.md con el formato de su cabecera (tabla
   con columnas #, Feature, Spec, Estado, Dueño, Int., PR). Filas nuevas entran
   en estado todo, dueño vacio, Int. 0.
3. No toques filas en building, review, done o stopped: son del loop o del Gate.

## Cola nocturna

Si el usuario pide validar la cola para la noche, ademas:
1. Frontier plana: ninguna fila encolada puede depender (depends_on) de otra
   fila encolada. Dependencias solo hacia features ya en done.
2. Maximo 6 filas.
3. Ordenadas por valor de demo (lo que mas luce en el pitch, primero).
Si la cola no cumple, RECHAZALA con la lista de filas problematicas y no
imprimas el comando /goal.

## Salida

Termina imprimiendo el comando listo para pegar:

/goal Use the queue-run skill against TASKQUEUE.md. Each pass, post the queue table and the verifier results for the row you worked. Met when no row is todo or building. If a row is stopped, say which and why.
