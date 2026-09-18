---
name: goal-writer
description: Convierte la descripcion de una feature en un spec re-entrable y su
  check ejecutable. Usar cuando hay que escribir features/<id>/spec.md y
  evals/checks/<id>.sh para una feature nueva de la cola.
---
# Goal-writer: de descripcion a spec + check

Objetivo: producir los dos artefactos que hacen loopeable una feature: el spec
re-entrable y el check que decide pass/fail sin opinion humana.

## El spec

1. Usa la plantilla docs/templates/spec-feature.md TAL CUAL: rellena sus huecos,
   no reinventes su estructura ni añadas secciones.
2. Escribe en features/<id>/spec.md, donde <id> es el nombre del directorio de
   la feature.
3. Frontmatter obligatorio: feature, depends_on, parallel, conflicts_with,
   lane (contenido | amplio | cerrado) y max_attempts: 3.
4. Los escenarios de la seccion 2 son DADO/CUANDO/ENTONCES verificables por
   maquina. Si un escenario no se puede verificar con un comando, no es un
   escenario: reescribelo o muevelo a fuera de alcance.
5. La seccion 3 (fuera de alcance) es la lista que el adversario usa para
   rechazar diffs: se explicita, no se sobreentiende.

## El check

1. Escribe evals/checks/<id>.sh: bash, ejecutable, 3-6 lineas de cuerpo.
2. Usa SOLO primitivas de evals/checks/lib.sh: route_ok, text_visible, api_json,
   flow, web_test, api_test, py_test. Si necesitas otra primitiva, no la inventes
   dentro del check: reporta que falta en lib.sh y para.
3. Mapeo 1:1: cada escenario de la seccion 2 del spec corresponde a UNA linea
   del check, en el mismo orden. Un escenario sin linea o una linea sin
   escenario es un check invalido.
4. Esqueleto:
   #!/usr/bin/env bash
   source "$(dirname "$0")/lib.sh"
   web_test src/features/<id>
   api_json /api/<ruta> '.items | length > 0'
   route_ok /otra-ruta 200

## Reglas

- Lane cerrado (migraciones, borrados, auth, pagos, prod) no se encola: se
  declara y se devuelve al humano.
- El check nace para fallar sobre main (red-first): no lo escribas verde
  buscando el texto que ya existe. En backend el test que falla ES el check rojo.
- No toques TASKQUEUE.md: encolar es de queue-build.
