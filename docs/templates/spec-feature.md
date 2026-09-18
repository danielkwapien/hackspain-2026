---
feature: <id = nombre del directorio>
depends_on: []
parallel: true
conflicts_with: []
lane: contenido            # contenido | amplio | cerrado
verify: evals/checks/<id>.sh
max_attempts: 3
---
# Spec: <id>

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("<id>: <item>") y termina la pasada.

## 1. Objetivo
<una frase: que existe cuando esto esta done>

## 2. Comportamiento (escenarios verificables)
- DADO ... CUANDO ... ENTONCES ...   # cada escenario mapea a UNA linea del check

## 3. Fuera de alcance
<lo que NO se toca — el adversario rechaza diffs que lo toquen>

## 4. Verificacion
- [ ] bash evals/smoke.sh          → exit 0
- [ ] bash evals/checks/<id>.sh    → exit 0   # nacio en rojo sobre main
- [ ] captura de <pantalla> coincide con features/<id>/app.html

Esta seccion puede incluir lineas web_test / api_test / py_test: en backend y en
logica de front, el test va primero y el test que FALLA es el check rojo. Escribe
la linea del test antes que el codigo, no despues.

## 5. Prioridades (de arriba abajo)
1. ...
