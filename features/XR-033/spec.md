---
feature: XR-033
depends_on: [XR-032]
parallel: true
conflicts_with: []
lane: amplio
verify: evals/checks/XR-033.sh
max_attempts: 3
---
# Spec: XR-033

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo.
2. Arregla el item rojo prioritario de la seccion 5.
3. Re-ejecuta la verificacion; scorer y adversary independientes dan el veredicto.
4. Commit de ficheros concretos: `XR-033: <item>` en ingles.

## 1. Objetivo
Publicar en MotherDuck el motor mensual real por grupo Y sociedad fuera de HTTP y servirlo en la UI existente: historia real con nulos legitimos, narrativa, cinco perspectivas separadas, cinco rangos 1M/3M/6M/1A/Total con unidad compartida y los campos baratos publicados (value_fmt, op_in_12m con moneda explicita y neteo de grupo, strength_flags observables); preservando el contrato v2, el modelo embat-layered-v1, `score=min(level,cap)` y la baseline de evaluacion sin recalibrar.

## 2. Comportamiento (escenarios verificables)
- DADO el resultado temporal de ambas unidades CUANDO se publica en una transaccion ENTONCES hay una fila por entidad y mes (grupo y sociedad), con catalogo en unidades corregidas (pesos en puntos porcentuales) y pesos efectivos normalizados, warmup coherente con el regimen, metadatos y huella del origen, nulos preservados, meses sin actividad omitidos y reejecucion idempotente; una fuente que rompe `score=min(level,cap)` se rechaza antes de reemplazar y no se etiqueta el score de un grupo como si se hubiese calculado para una sociedad.
- DADAS las tablas derivadas publicadas CUANDO se consultan las rutas v2 reales ENTONCES se sirven los dos granos (grupo y sociedad), timeline, señales, detalles, alertas, catalogo y frames desde tablas precalculadas, sin calcular finanzas en HTTP; los campos baratos (value_fmt, op_in_12m con moneda y neteo de grupo, strength_flags observables) viajan en las respuestas sin recalcularse, los nulos se conservan (warmup y meses sin soporte con score nulo, nunca cero) y sin base valida la respuesta es 503 source_unavailable, sin mocks ni baseline estatico; `score=min(level,cap)` usa level despues de penalizacion/ajustes, sin doble descuento.
- DADA una entidad temporal CUANDO se abre su ficha ENTONCES la historia real se pinta con los nulos publicados degradados a «—»/«No aplica» (nunca ceros ficticios) y con narrativa, cinco perspectivas separadas con direccion/confianza/evidencia y los cinco rangos 1M/3M/6M/1A/Total con unidad compartida; la ficha estatica conserva su hoja de snapshot y una entidad sin score suficiente no rompe la UI.

## 3. Fuera de alcance
- No editar TASKQUEUE.md ni datasets originales. Builders no editan evals/.
- No ejecutar scoring ni leer CSV en HTTP, ni sustituir MotherDuck por mocks silenciosamente.
- No cambiar nombres/formas/semantica de los campos v2 existentes. Bloques nuevos de KPIs/diagnostico son extensiones aditivas; lo ausente sigue null.
- No atribuir el score consolidado a filiales como calculo individual; reutilizar el mismo motor en batch para el drill-down si se necesita serie por sociedad.
- No rebautizar silenciosamente el modelo de main: el pipeline actual es embat-layered-v1. Registrar version/parametros reales en metadatos. La referencia de ENGINE-CONNECTION a embat-temporal-v1 precede ese refactor.
- No desactivar/revertir modificadores del motor actual sin evaluacion; publicar su traza y perspectivas separadas. Gate confirmo preservar semantica de level de APIv2.
- No instalar dependencias fuera de las listadas en ENGINE-CONNECTION10.1 y manifests existentes sin consultar.
- QA breve por peticion del usuario; no auditorias visuales intensivas ni computer use desde la sesion principal.
- La banda de perspectiva/forecast queda fuera de esta tanda: no se implementa ni se inventan forecasts; con outlook/base ausentes la grafica degrada sin ella (lo ausente sigue null).
- Fuera las nuevas formulas de bache/recuperacion y la recalibracion del score: evaluate.py informa M1-M4 (M5 se comprueba aparte, core/tests/test_isolation.py) y el PSI medido (0.3492) no se corrige ni se declara <0.1 en esta tanda.
- Del bloque de KPIs solo entran los campos baratos (value_fmt por unidad/precision, op_in_12m por entidad/mes con moneda explicita y neteo de grupo, strength_flags solo con condiciones observables); el resto de señales objetivo y los KPIs amplios del plan antiguo no se inventan.
- No se anaden tests ni baterias nuevas al check: la verificacion es el check existente (tres comandos) mas el smoke HTTP del orquestador.

## 4. Verificacion
- [ ] `API_URL=http://localhost:8796 BASE_URL=http://localhost:4176 bash evals/smoke.sh` -> exit0.
- [ ] `API_URL=http://localhost:8796 BASE_URL=http://localhost:4176 bash evals/checks/XR-033.sh` -> exit0; nacio rojo sobre 66a2dec antes de codigo.
- [ ] Publicacion real: engine_exports+count/hash y smoke HTTP real (/meta con embat-layered-v1, 24 meses y snapshots_only:false; timeline de ambos granos; value_fmt en los valores de señal, op_in_12m y strength_flags); logs en features/XR-033/verification.

## 5. Prioridades (de arriba abajo)
1. Baseline calculada sobre 66a2dec: 250x24 filas, 249 con score; conservar scores_embat.json y evaluation.json en plans/XR-033/baseline con SHA256SUMS; no se sobrescribe en esta tanda.
2. Fase1: ampliar serializacion mensual sin cambiar score, publicar tablas derivadas transaccionales e idempotentes de ambas unidades (catalogo en unidades reales, pesos efectivos, warmup coherente); congelar contrato interno para API.
3. Fase2: API lee tablas derivadas, integra v2 y elimina estado snapshot-only para motor temporal; verificar API real antes de la UI.
4. Conexion completa, prioridad panel Empresa: campos baratos en batch (value_fmt por unidad y precision, op_in_12m por entidad/mes con moneda y neteo de grupo, strength_flags solo observables) y frontal temporal (nulos sin ceros ficticios, cinco rangos 1M/3M/6M/1A/Total con unidad compartida, narrativa y cinco perspectivas con direccion/confianza/evidencia).
5. Cierre: republicar solo si cambian los artefactos (hash, conteos, identidad) y smoke HTTP real; banda perspectiva/forecast, bache/recuperacion, recalibracion (PSI) y M1-M5 quedan fuera de esta tanda.
6. Publicar PR y merge directo autorizados por el usuario en el chat; commits en ingles sin co-author. Mantener evidencia proporcional.
