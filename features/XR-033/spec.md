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
Publicar en MotherDuck el motor mensual real fuera de HTTP y servirlo en la UI existente, con KPIs de tesoreria, cinco perspectivas y evaluacion reproducible, preservando el contrato v2 y los nulos legitimos.

## 2. Comportamiento (escenarios verificables)
- DADO el resultado temporal CUANDO se publica en una transaccion ENTONCES hay una fila por entidad y mes, metadatos y huella del origen, nulos preservados y reejecucion idempotente; no se etiqueta el score de un grupo como si se hubiese calculado para una sociedad.
- DADAS tablas precalculadas CUANDO se consultan las rutas v2 ENTONCES se sirven series de mas de20meses, pilares, drivers, señales y grupos sin calcular finanzas en HTTP; la fuente local y el503 sin mocks se conservan y `score=min(level,cap)` usa level despues de penalizacion/ajustes, sin doble descuento.
- DADOS los datos originales CUANDO se calculan KPIs en batch ENTONCES importes/fechas/coberturas cumplen las trampas de ENGINE-CONNECTION7: deuda normalizada, pagos realmente pagados, ventanas as-of, denominadores disponibles y ausencia distinta de cero.
- DADA una entidad temporal CUANDO se abre su ficha ENTONCES muestra historia/pilares con nulos, KPIs en unidades reales y cinco perspectivas separadas con direccion/confianza/evidencia; los grupos sin datos no rompen la UI.
- DADA la referencia guardada CUANDO se modifica la formula ENTONCES evaluate.py compara las metricas con baseline, conserva aislamiento de cohorte y no acepta regresiones; se comprueban techos, regimen, perspectiva e identidad de explicacion.

## 3. Fuera de alcance
- No editar TASKQUEUE.md ni datasets originales. Builders no editan evals/.
- No ejecutar scoring ni leer CSV en HTTP, ni sustituir MotherDuck por mocks silenciosamente.
- No cambiar nombres/formas/semantica de los campos v2 existentes. Bloques nuevos de KPIs/diagnostico son extensiones aditivas; lo ausente sigue null.
- No atribuir el score consolidado a filiales como calculo individual; reutilizar el mismo motor en batch para el drill-down si se necesita serie por sociedad.
- No rebautizar silenciosamente el modelo de main: el pipeline actual es embat-layered-v1. Registrar version/parametros reales en metadatos. La referencia de ENGINE-CONNECTION a embat-temporal-v1 precede ese refactor.
- No desactivar/revertir modificadores del motor actual sin evaluacion; publicar su traza y perspectivas separadas. Gate confirmo preservar semantica de level de APIv2.
- No instalar dependencias fuera de las listadas en ENGINE-CONNECTION10.1 y manifests existentes sin consultar.
- QA breve por peticion del usuario; no auditorias visuales intensivas ni computer use desde la sesion principal.

## 4. Verificacion
- [ ] `API_URL=http://localhost:8796 BASE_URL=http://localhost:4173 bash evals/smoke.sh` -> exit0.
- [ ] `API_URL=http://localhost:8796 BASE_URL=http://localhost:4173 bash evals/checks/XR-033.sh` -> exit0; nacio rojo sobre66a2dec antes de codigo.
- [ ] Publicacion real: engine_exports+count/hash y HTTP real /meta, timeline, group; logs en features/XR-033/verification.

## 5. Prioridades (de arriba abajo)
1. Baseline calculada sobre66a2dec: 250x24filas, 249conscore; conservar scores_embat.json y evaluation.json en plans/XR-033/baseline con SHA256SUMS.
2. Fase1: ampliar serializacion mensual sin cambiar score, publicar tablas derivadas transaccionales e idempotentes; congelar contrato interno para API.
3. Fase2: API lee tablas derivadas, integra v2 y elimina estado snapshot-only para motor temporal; verificar API real antes de fases3/4.
4. Fases3/4: KPIs y cinco perspectivas en paralelo una vez servida fase2.
5. Fase5: cambios de motor uno a uno bajo evaluate; ninguna regresion admitida, PSI objetivo<0.1; no fingir cierre si una metrica lo impide.
6. Publicar PR y merge directo autorizados por el usuario en el chat; commitsingleses sin co-author. Mantener evidencia proporcional.
