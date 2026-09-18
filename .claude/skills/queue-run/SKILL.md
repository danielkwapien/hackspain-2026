---
name: queue-run
description: Motor de la fabrica. Ejecuta UNA pasada del loop sobre
  TASKQUEUE.md con builder, scorer y adversary separados. La invoca el /goal
  en cada pasada; tambien sirve para una pasada manual vigilada.
---
# Queue-run: una pasada del loop

Protocolo de UNA pasada. Al terminarla, la pasada acaba: el /goal decide si hay
siguiente. Nunca encadenes dos filas en una pasada.

## Protocolo

1. Lee TASKQUEUE.md. La frontier son las filas en todo cuyos depends_on
   estan todos en done. Toma la PRIMERA fila de la frontier; si no hay, informa
   y termina la pasada.
2. Marca la fila todo -> building, dueño = loop (eres el orquestador: el unico
   escritor de TASKQUEUE.md junto al Gate).
3. Crea el fichero .loop-on en el worktree de la tarea (activa el gate completo).
4. Lanza el agente builder (isolation: worktree) con el spec de la fila. El
   builder construye; tu no editas codigo.
5. Al terminar el builder, lanza el agente scorer (ejecuta smoke + check y emite
   JSON por criterio) y despues el agente adversary (contexto limpio: diff +
   spec + AGENTS.md).
6. Si scorer o adversary fallan: copia el ticket de 5 campos (UNIT / VERDICT /
   REASON / EVIDENCE / SCOPE) a la fila, incrementa Int., y relanza el builder
   SOLO con el SCOPE del ticket como encargo. Al tercer intento fallido: fila ->
   stopped, y pasa a la siguiente fila de la frontier.
7. Criterio de pase segun modo y lane:
   - De dia, o lane amplio: 2 pasadas limpias CONSECUTIVAS (builder sin cambios
     pendientes, scorer y adversary en verde dos veces seguidas).
   - Marcado nocturno + lane contenido: 1 pasada limpia + CI verde.
8. Si pasa: abre una PR pequeña con las capturas de features/<f>/verification/
   en la descripcion, marca la fila -> review, y Call the Skill tool with
   "compound" para capturar la leccion de la tarea.
9. Escribe en features/NOTES.md una entrada con timestamp y la tabla actual de
   la cola (heartbeat), y termina la pasada.

## Prohibiciones

- NUNCA mergeas. NUNCA marcas done: eso es del Gate al mergear.
- NUNCA tocas filas en review, done o stopped.
- NUNCA editas codigo de la tarea ni evals/: eres orquestador, no builder.

## El /goal literal

/goal Use the queue-run skill against TASKQUEUE.md. Each pass, post the queue table and the verifier results for the row you worked. Met when no row is todo or building. If a row is stopped, say which and why.
