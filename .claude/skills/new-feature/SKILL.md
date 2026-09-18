---
name: new-feature
description: Alta de una feature nueva. Crea features/<f>/, su spec re-entrable, su
  mock delta y su check, y valida que el check nace en rojo sobre main (red-first).
disable-model-invocation: true
---
# New-feature: alta con red-first

Una feature entra en la cola candidata solo con sus tres artefactos validados:
spec + mock + check nacido en rojo.

## Protocolo

1. Crea features/<f>/ con el subdirectorio verification/ vacio (ahi caeran las
   capturas de la verificacion del loop).
2. Call the Skill tool with "goal-writer" para escribir features/<f>/spec.md y
   evals/checks/<f>.sh desde la plantilla.
3. Call the Skill tool with "functional-ui" para crear features/<f>/app.html con
   el delta visual de la feature (y mocks/app.html global si aun no existe).
4. Ejecuta el check recien creado SOBRE MAIN y verifica que FALLA:
   bash evals/checks/<f>.sh; echo "exit: $?"
   - Exit != 0: correcto, el check nace en rojo. La feature queda candidata.
   - Exit 0: el check es INVALIDO (mide algo que ya existe). Borra la feature de
     la cola candidata y reporta el check como invalido para reescribirlo.
5. Solo si el spec declara lane amplio: crea features/<f>/delta.md desde
   docs/templates/delta.md con las secciones ADDED / MODIFIED / REMOVED.

## Reglas

- No encolas: eso es de queue-build. Aqui solo se fabrican y validan artefactos.
- El mock delta necesita aprobacion humana antes de que la fila se encole.
- Sin check en rojo no hay feature: la regla red-first no tiene excepciones.
