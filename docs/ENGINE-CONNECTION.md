# Conexión del engine al frontal (XR-033)

Informe escrito el 19/09/2026 a las 16:10, tras el merge de la PR #9 (`codex/motherduck-fastify`)
y de las señales estratégicas de Lucas (`5cae7e4`). Medido sobre `main` en `9ff5a00`.

**Para qué sirve:** es el plan de implementación para terminar el motor y conectarlo al frontal.
Lo lee quien ejecute XR-033 y quien revise el resultado. Complementa a `improves.md` (enfoque de
producto) y a `core/ROADMAP.md` §7 (definición del algoritmo objetivo).

---

## 1. Veredicto en una frase

La tubería está montada de punta a punta y funciona, pero **transporta el peor de los tres motores
que tenemos**: MotherDuck sirve la foto estática de una empresa en un mes, mientras el frontal está
construido para una serie mensual por grupo con pilares, régimen, drivers, alertas y perspectiva.
El trabajo de XR-033 no es construir tubería nueva, es **llenarla**.

---

## 2. Estado medido de las cuatro capas

### 2.1 Datos: MotherDuck, listo

Base `md:hackspain_2026`, esquema `main`, cargada el 19/09. Diez tablas: las ocho originales del
reto más `scores` y `score_exports`. Verificación documentada en `docs/data/motherduck.md`: los
recuentos locales y remotos coinciden y la huella `md5` de los payloads da cero diferencias.

| Tabla | Filas |
|---|---:|
| `groups` | 250 |
| `companies` | 1.286 |
| `banking_products` | 5.987 |
| `debt_products` | 2.239 |
| `debt_schedule_config` | 87 |
| `balances` | 7.996 |
| `invoices` | 897.894 |
| `transactions` | 2.556.437 |
| `scores` | 1.286 |
| `score_exports` | 1 |

**Lo que hay que entender:** `scores` no es una tabla del motor temporal. Es el volcado de
`core/outputs/scores.json`, es decir `static-baseline-v1`, corte 2026-09-01, con 720 `partial`,
110 `available` y 456 `insufficient_data`. Su columna `payload` guarda el JSON completo de cada
resultado.

### 2.2 Engine: dos motores, y el bueno no está publicado

| | `core/pipeline.py` | `core/pipeline_embat.py` |
|---|---|---|
| Unidad | 1.286 sociedades | **250 grupos** |
| Tiempo | una foto | **24 meses**, point-in-time |
| Señales | 4 factores | 16 en 5 pilares |
| Señales estratégicas | no | **5**, ya enganchadas |
| Salida | `core/outputs/scores.json` | `core/outputs/scores_embat.json` |
| ¿Está en MotherDuck? | **sí** | **no** |
| ¿Está en git? | sí | **no**, gitignored (`.gitignore:45`) |

El refactor del 19/09 dejó el motor temporal modular en `core/signals/`, con un fichero por familia
y un registro explícito en `active.py`. Las cinco señales estratégicas de `SIGNALS_LUCAS.md` ya se
calculan: `pipeline_embat.py:439` llama a `attach_group_signals(panel, scored)`, y cada grupo-mes
sale con `strategic_signals`.

| Señal | Módulo | Qué representa |
|---|---|---|
| `current_health` | `current_health.py` | la foto financiera del mes, a partir de los cinco pilares |
| `trajectory_pressure` | `trajectory_pressure.py` | hacia dónde va y si absorbe lo que viene |
| `portfolio_learned_outlook` | `data_driven_peer_learning.py` | qué pasó después en empresas parecidas |
| `peer_position` | `sector_benchmark_rank.py` | percentil dentro de su cohorte comparable |
| `relationship_health` | `network_counterparty_health.py` | calidad y estabilidad de su red comercial |

Contrato común de cada señal, fijado en `SIGNALS_LUCAS.md`: `name`, `value` de 0 a 100,
`confidence`, `coverage`, `direction` y `evidence`. La falta de dato baja la cobertura, nunca se
convierte en mala salud.

### 2.3 API: la tubería, bien hecha

`app/api/src/motherduck/` son siete ficheros. Fastify consulta MotherDuck por defecto y solo usa
ficheros locales con `DATA_SOURCE=local` o `buildApp({exportsDir})`, que es lo que hacen los tests.
Decisiones correctas que hay que conservar:

- El token vive solo en `app/api/.env`, gitignored, nunca en variables `VITE_*`.
- Si la conexión falla, devuelve **503 `source_unavailable`**, y no sustituye por datos mock.
- El snapshot se carga una vez y se cachea 60 segundos, compartido entre peticiones.
- Las consultas de detalle van parametrizadas, no concatenadas.
- Los `DECIMAL` y `BIGINT` se serializan a propósito con `::double` y `::integer`.

Once rutas ya expuestas en `/api/v2/`: `universe`, `companies/:id`, `companies/:id/signals`,
`companies/:id/timeline`, `groups/:id`, `alerts`, `treemap`, `frames`, `frames/:month`,
`catalog/signals`, `meta`.

### 2.4 Frontal: construido para lo que aún no llega

XR-030, XR-031 y XR-032 han construido contra el contrato completo del mock: gráfica con banda de
perspectiva, fila de KPIs, pilares por mes con hover, drivers, alertas, régimen, treemap por cobros
y ficha de grupo. XR-032 termina hoy con sus 310 tests en verde.

---

## 3. El hueco exacto

Todo está en una sola función: `app/api/src/motherduck/store.ts:7`, `scoreRow()`. Construye la fila
del contrato v2 a partir del snapshot estático y **rellena a `null` todo menos `score` y `band`**.

| Campo del contrato v2 | Lo que el frontal pinta con él | Hoy desde MotherDuck | Quién lo produce |
|---|---|---|---|
| `pillars.{L,P,C,D,A}` | familia por mes, hover, barras | `null` | `pipeline_embat` |
| `level`, `penalty` | identidad del score, «por qué» | `null` | `pipeline_embat` |
| `cap`, `cap_code` | techo por evento duro | `null` | pendiente en el motor (v2 §7.5.6) |
| `delta_1m/3m/6m` | Δ en tabla, treemap y cabecera | `null` | `pipeline_embat` |
| `slope_3m/6m`, `z_own`, `run` | trayectoria | `null` | `trajectory_for()` |
| `regime` | bache frente a caída, **requisito central del brief** | `null` | `trajectory_for()` |
| `outlook_3m/6m`, `outlook_low/high` | banda de perspectiva de la gráfica | `null` | pendiente (v2 §7.7) |
| `confidence` | banda ancha y corte de alertas | `null` | `confidence_for()` |
| `branch` | «score con 3 de 5 familias» | `null` | `pipeline_embat` |
| `months` del manifiesto | scrubber, series, comparativa | **1 mes** | `pipeline_embat` da 24 |
| `driversAt()` | sección «qué se movió» | `[]` | `build_drivers()` |
| `narrativeAt()` | cabecera de texto | `null` | pendiente (v2 §7.8) |
| `alerts` | widget Alertas y triaje | `[]` | `early_warning()` da la base |
| `signalsFor()` | tabla de señales de la ficha | `[]` | `calculate_signals()` |
| `catalog` | catálogo de señales y auditoría | `[]` | `specs_by_pillar()` |
| Línea temporal de grupo | ficha de grupo, dispersión | 1 fila con todo `null` | `pipeline_embat` |

El manifiesto lo declara con honestidad: `capabilities: { snapshots_only: true }`. La UI degrada
sin romperse, que es lo correcto, pero enseña una aplicación vacía.

---

## 4. Arquitectura objetivo

```
  datasets (8 CSV)  ──►  MotherDuck: tablas crudas          [hecho]
                                  │
                                  ▼
                  core/pipeline_embat.py                     [hecho, sin publicar]
                  fuera de la petición, en batch
                                  │
                                  ▼
       MotherDuck: tablas derivadas del motor                [POR HACER]
       group_scores · group_signals · group_drivers
       group_alerts · group_kpis · signal_catalog
                                  │
                                  ▼
       app/api/src/motherduck/*.ts  (SELECT tipado)          [ampliar]
                                  │
                                  ▼
                     /api/v2/*  (contrato intacto)           [hecho]
                                  │
                                  ▼
                          frontal                            [hecho]
```

Tres principios que no se negocian:

1. **El motor no se ejecuta dentro de una petición.** La API solo lee tablas ya calculadas. Nada de
   abrir CSV ni de calcular finanzas al servir.
2. **El contrato v2 no se toca.** Es lo que el frontal ya consume y lo que tres tickets han
   validado con tests. Se rellenan sus campos, no se renombran.
3. **Nada puede depender de la cohorte cargada.** Ni percentiles en ejecución ni winsorización por
   mes. El test oculto llega con menos grupos y el score de un grupo no puede cambiar por eso.
   Si hace falta un percentil, se congela en `params/` y se carga.

---

## 5. Plan de implementación

### Fase 0 · Publicar la salida del motor temporal

Es lo que desbloquea todo lo demás. Sin esto, ninguna fase posterior existe.

1. Ejecutar `.venv/bin/python core/pipeline_embat.py` y conservar `core/outputs/scores_embat.json`.
2. Ejecutar `.venv/bin/python core/evaluate.py` y **conservar `core/outputs/evaluation.json` como
   línea base**. Sin esa referencia, la regla «un cambio entra solo si ninguna métrica empeora» no
   se puede aplicar.
3. Decidir dónde vive la salida. Recomendación: **tablas derivadas en MotherDuck**, cargadas por un
   script de publicación versionado, no el JSON suelto. Motivo: la API ya sabe leer de MotherDuck y
   el JSON de 250 grupos por 24 meses con señales no cabe cómodo en memoria por petición.
4. Escribir `core/publish.py`: lee la salida del motor y escribe las tablas de §6 con
   `CREATE OR REPLACE TABLE`, dentro de una transacción, con `params_version` y `generated_at`.

**Se verifica así:** `SELECT count(*) FROM group_scores` da 250 × meses; el `md5` del JSON de
origen coincide con el que guarda `engine_exports`.

### Fase 1 · Leer las tablas derivadas en la API

1. Añadir `app/api/src/motherduck/engine.ts` con las consultas tipadas de las tablas nuevas, en el
   mismo estilo que `detail.ts` y `coverage.ts`: esquema `zod` por consulta y casts explícitos.
2. Reescribir `scoreRow()` para que lea de `group_scores` en vez de fabricar `null`.
3. Implementar `driversAt`, `narrativeAt`, `signalsFor`, `alerts`, `catalog` y
   `groupTimelineByGroup` contra sus tablas.
4. Cambiar el manifiesto: `months` con la lista real, `capabilities.snapshots_only: false`,
   `model_version: "embat-temporal-v1"`, y actualizar las notas.
5. Mantener la unidad: **grupo por defecto**, sociedad como drill-down. Hoy conviven y hay dos
   números para la misma empresa, que es lo peor ante un jurado.

**Se verifica así:** los tests de `app/api/test/v2.test.ts` con `DATA_SOURCE=local` siguen verdes,
y contra MotherDuck `/api/v2/companies/<id>/timeline` devuelve más de 20 filas con
`pillars.L.value` no nulo.

### Fase 2 · Capa de KPIs de tesorería

Es la capa que falta para que Embat entienda la pantalla. Va **junto al score, no dentro**: el
score ordena la cartera, los KPIs explican en unidades reales. Detalle y coberturas en
`improves.md` §4.2.

| KPI | Definición | Nota |
|---|---|---|
| Runway (meses) | liquidez disponible / burn neto 3 m, solo si el burn es negativo | 125 de 237 grupos queman caja |
| Meses de cobertura | liquidez disponible / salidas operativas 3 m | el KPI para la otra mitad de la cartera |
| Burn neto (EUR) y tendencia | `op_in − op_out`, media 3 m, y variación | existe como ratio, falta en absoluto |
| Burn bruto (EUR) | `op_out` 3 m, desglosado por categoría | neto plano con bruto creciendo es otra conversación |
| Liquidez disponible | caja + `liquidity` no dispuesta de líneas | **ver trampas §7** |
| DSO / DPO | días emisión a cobro y a pago, ponderados por importe | palabras exactas de Embat |
| Aging 0-30 / 31-60 / 61-90 / 90+ | vencido vivo por tramo | los tramos que Embat enseña |
| Concentración de clientes | peso del mayor cliente y HHI 12 m | mediana del top-1 medida: **56,2 %** |
| Concentración bancaria | nº de bancos y peso del principal | señal comercial para Embat |
| Coste financiero | (intereses + comisiones) / salidas, y tendencia | solo ratio propio |
| Cobertura de datos | % de importe sin categoría, rama, feeds mudos | alimenta `confidence` |

Se sirven en un bloque `kpis` junto al score, y el frontal los pinta **antes** que los pilares.

### Fase 3 · Las cinco señales estratégicas en la pantalla

Ya se calculan, no se publican. Van como **diagnóstico separado**, no dentro del número, tal y como
dice `SIGNALS_LUCAS.md`: una señal solo entra en el score oficial si aporta anticipación,
estabilidad o explicación, y eso se mide con `evaluate.py`.

En la ficha se pintan como cinco tarjetas con valor de 0 a 100, dirección, confianza y la evidencia
en una línea. El relato del pitch sale solo:

```
Salud actual · Trayectoria futura · Inteligencia Embat · Posición entre pares · Salud del ecosistema
```

### Fase 4 · Cierre del motor

Por orden de impacto, cada cambio pasando por `evaluate.py` contra la línea base de la fase 0:

1. **Techos por evento duro** con condición de actividad, y régimen con histéresis de dos meses.
   Es lo que distingue bache de caída, el requisito central del brief.
2. **Recalibrar el pilar de cobros**. Su mediana es 33,5 frente a 62-77 del resto, y quien no tiene
   ERP puntúa 12 puntos más. Objetivo: PSI por debajo de 0,1.
3. **Índice de adelanto y perspectiva a 3 y 6 meses con banda**. La pendiente del score da AUC
   0,507, o sea no anticipa nada. La anticipación sale de las señales con perfil de adelanto.
4. **Drivers por señal** con valor formateado, y narrativa por plantilla determinista.
5. **Retirar `core/pipeline.py`** del camino de la demo.

---

## 6. Contrato de las tablas derivadas

Nombres propuestos, en el mismo esquema `main`. Todas llevan `params_version` y `generated_at`.

```sql
-- una fila por grupo y mes: es el corazón del contrato v2
CREATE OR REPLACE TABLE group_scores (
  group_id VARCHAR, month VARCHAR,            -- 'YYYY-MM'
  months_hist INTEGER, warmup BOOLEAN, branch VARCHAR,
  pillar_l DOUBLE, pillar_p DOUBLE, pillar_c DOUBLE, pillar_d DOUBLE, pillar_a DOUBLE,
  weight_l DOUBLE, weight_p DOUBLE, weight_c DOUBLE, weight_d DOUBLE, weight_a DOUBLE,
  level DOUBLE, penalty DOUBLE, cap DOUBLE, cap_code VARCHAR,
  score DOUBLE, band VARCHAR,
  delta_1m DOUBLE, delta_3m DOUBLE, delta_6m DOUBLE,
  slope_3m DOUBLE, slope_6m DOUBLE, z_own DOUBLE, run INTEGER, level_shift DOUBLE,
  regime VARCHAR, direction VARCHAR,
  outlook_3m DOUBLE, outlook_6m DOUBLE, outlook_low DOUBLE, outlook_high DOUBLE,
  confidence DOUBLE, coverage DOUBLE,
  params_version VARCHAR, generated_at TIMESTAMP
);

-- valor crudo y puntos de cada señal, disponible o no
CREATE OR REPLACE TABLE group_signal_values (
  group_id VARCHAR, month VARCHAR, signal VARCHAR, pillar VARCHAR,
  value DOUBLE, points DOUBLE, weight DOUBLE, contribution DOUBLE,
  is_available BOOLEAN, quality_flag VARCHAR
);

-- las cinco señales estratégicas, con su contrato propio
CREATE OR REPLACE TABLE group_strategic_signals (
  group_id VARCHAR, month VARCHAR, name VARCHAR,
  value DOUBLE, confidence DOUBLE, coverage DOUBLE,
  direction VARCHAR, evidence VARCHAR            -- JSON serializado
);

-- KPIs de tesorería en unidades reales
CREATE OR REPLACE TABLE group_kpis (
  group_id VARCHAR, month VARCHAR, kpi VARCHAR,
  value DOUBLE, unit VARCHAR,                    -- 'EUR' | 'days' | 'months' | 'ratio' | 'pct'
  trend DOUBLE, is_available BOOLEAN, basis VARCHAR
);

CREATE OR REPLACE TABLE group_drivers (
  group_id VARCHAR, month VARCHAR, rank INTEGER,
  kind VARCHAR,                                  -- 'pillar' | 'signal' | 'cap' | 'penalty'
  key VARCHAR, label VARCHAR, direction VARCHAR,
  impact DOUBLE, value_before DOUBLE, value_after DOUBLE, value_fmt VARCHAR, message VARCHAR
);

CREATE OR REPLACE TABLE group_alerts (
  alert_id VARCHAR, group_id VARCHAR, month VARCHAR,
  severity VARCHAR, cause VARCHAR, direction VARCHAR,
  score_before DOUBLE, score_after DOUBLE, top_driver VARCHAR, message VARCHAR
);

CREATE OR REPLACE TABLE signal_catalog (
  signal VARCHAR, pillar VARCHAR, label VARCHAR, unit VARCHAR, direction VARCHAR,
  weight_in_pillar DOUBLE, pillar_weight DOUBLE, anchors VARCHAR, window VARCHAR, requires VARCHAR
);

CREATE OR REPLACE TABLE engine_exports (
  model_version VARCHAR, params_version VARCHAR, data_version VARCHAR,
  cutoff_date VARCHAR, months_from VARCHAR, months_to VARCHAR,
  n_groups INTEGER, n_months INTEGER, generated_at TIMESTAMP,
  source_md5 VARCHAR, metadata VARCHAR
);
```

Regla de identidad que un test debe comprobar en cada publicación:

```
score = level − penalty − cap_adj,   con cap_adj = level − min(level, cap)
```

`cap_adj` se reconstruye de `level` y `cap`, **nunca de `score`**, porque definirlo como
`level − score` cancela el score de los dos lados y convierte la invariante en una tautología.

---

## 7. Trampas medidas, que dan resultados falsos si se ignoran

1. **`granted` y `outstanding` llegan en negativo.** 464 de 477 líneas de crédito y 995 de 1.000
   préstamos. Un headroom o una utilización sin normalizar el signo salen al revés.
2. **`liquidity` casi no existe en cuentas corrientes**: 11,4 %, frente al 81 % de las líneas de
   crédito, 76 % de confirming y 88 % de factoring. La liquidez disponible de quien no tiene líneas
   es su caja a secas, y hay que marcarlo, no rellenarlo.
3. **`counterparty_id` no cruza empresas.** Cubre el 99 % de las facturas y sirve para concentración
   y para la red comercial, pero cada contraparte pertenece a una sola empresa: no vale para
   detectar intercompany, que se resuelve por transferencias espejo.
4. **Fechas extremas conservadas a propósito**: vencimientos hasta 7025, pagos hasta 6913 y ocho
   fechas valor en 2099. Política de corte explícita, nunca normalización silenciosa.
5. **Referencias huérfanas**: 1.314 movimientos y 29 balances apuntan a productos que no están en
   ninguno de los dos catálogos, y 183.627 movimientos son de productos de deuda. `LEFT JOIN`
   siempre, y el catálogo de productos une `banking_products` con `debt_products`.
6. **Las sumas en coma flotante no son deterministas.** DuckDB agrega en paralelo y la suma no es
   asociativa. Redondear a céntimos en cada agregación monetaria: sin eso, una diferencia de 1e-4
   cruza un ancla y mueve el score 25 puntos.
7. **Un score `NULL` no es un cero.** 456 sociedades están en `insufficient_data`. Siguen en el
   universo, con su estado a la vista.
8. **`payment_date` está rellena también en facturas no pagadas**, 237.593 filas con fechas
   imposibles. Usarla solo con `status = 'paid'` y dentro de ventana.

---

## 8. Orden y criterios de aceptación

| Fase | Entrega | Cómo se comprueba |
|---|---|---|
| 0 | salida del motor publicada y línea base guardada | `engine_exports` con una fila; `evaluation.json` en disco |
| 1 | la API sirve la serie real | `timeline` con más de 20 filas y `pillars.L.value` no nulo; `meta.model_version` es `embat-temporal-v1` |
| 2 | bloque `kpis` en la ficha | test de cobertura por KPI; el frontal pinta EUR, días y % |
| 3 | cinco señales estratégicas en pantalla | cada una con valor, dirección, confianza y evidencia |
| 4 | techos, régimen, cobros recalibrado, perspectiva | `evaluate.py` sin empeorar ninguna métrica y PSI por debajo de 0,1 |

La fase 0 es de minutos. La 1 es la que rellena la aplicación entera y es la que hay que hacer
primero y bien. Las fases 2 y 3 se pueden paralelizar en cuanto la 1 esté servida.

---

## 9. Lo que no hay que hacer

- No tocar el contrato `/api/v2/*`. Tres tickets de frontal se apoyan en él.
- No devolver datos mock cuando MotherDuck falle. El 503 `source_unavailable` es la decisión
  correcta y se conserva.
- No calcular finanzas dentro de una petición HTTP.
- No meter DSCR contable desde `debt_schedule_config`: 87 cuadros para 40 sociedades y las fechas
  cuadran en el 26 % de los casos.
- No inventar exposición FX, sector ni descomposición estacional: no hay datos que lo sostengan.
- No llamar Rule of 40 a la eficiencia de crecimiento delante de Embat. No hay ingresos ni EBITDA,
  solo cobros y caja.
