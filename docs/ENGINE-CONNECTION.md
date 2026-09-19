# Conexión del engine al frontal (XR-033)

Informe escrito el 19/09/2026 a las 16:10 y **actualizado a las 16:20**, cuando XR-032 terminó y
dejó la PR #10 en conflicto con la rama de MotherDuck. Escrito tras el merge de la PR #9
(`codex/motherduck-fastify`) y de las señales estratégicas de Lucas (`5cae7e4`). Medido sobre
`main` en `9ff5a00` y sobre `xr/XR-032-company-research-panels` en `b42255a`.

**Para qué sirve:** es el plan de implementación para terminar el motor y conectarlo al frontal.
Lo lee quien ejecute XR-033, quien revise el resultado y cualquiera del equipo que necesite entender
cómo encajan datos, motor, API y pantalla.

**Este documento es autosuficiente.** Todo lo que necesitas para ejecutarlo está aquí o en ficheros
versionados. No depende de nada que viva solo en una máquina.

### 0. Mapa de lectura: qué está en el repositorio y qué no

Parte del material de trabajo del equipo es local y **no viaja en el repositorio**. Si alguien clona
y no encuentra un fichero, es por esto, no por un error.

| Documento | ¿En el repositorio? | Qué contiene |
|---|---|---|
| `docs/ENGINE-CONNECTION.md` | **sí** | este plan |
| `core/ROADMAP.md` | **sí** | estado del motor, trampas pisadas y algoritmo objetivo (§7) |
| `core/signals/SIGNALS_LUCAS.md` | **sí** | contrato de las cinco señales estratégicas |
| `docs/data/motherduck.md` | **sí** | carga, anomalías conservadas y decisiones de la integración |
| `docs/api/v2.md` | **sí** | el contrato de la API que no se toca |
| `AGENTS.md`, `.claude/`, `evals/`, `features/` | **sí** | arnés, agentes, skills y checks |
| `improves.md` | no, local | enfoque de producto para Embat. **Lo esencial está inlineado en §5 fase 3 de este documento** |
| `plans/` | no, local | planes y evidencia de cada ticket. **Lo esencial para XR-033 está en §5 y §8** |
| `core/outputs/scores_embat.json` | no, se genera | salida del motor temporal. La produce la fase 1 |
| `core/outputs/evaluation.json` | no, se genera | línea base de métricas. La produce la fase 1 |

La columna «Plan» de `TASKQUEUE.md` apunta a rutas de `plans/`, que son locales. La fila de XR-033
apunta a este documento a propósito, para que cualquiera pueda ejecutarla.

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
y ficha de grupo. XR-032 **terminó a las 16:03** con sus 310 tests en verde y dejó la PR #10 abierta.

### 2.5 El frontal terminado choca con MotherDuck, y el choque no es textual

XR-032 nació de `main` en `90aa9d3`. Mientras estaba en vuelo, `main` avanzó con la PR #9 de
MotherDuck. El merge da **nueve ficheros en conflicto y diecinueve hunks**, y la sesión los dejó sin
resolver a propósito, con la nota en `features/NOTES.md`, porque la decisión es del Gate.

| Fichero en conflicto | Qué se disputa |
|---|---|
| `app/api/src/app.ts` | selección de fuente y registro de rutas |
| `app/web/src/lib/api-v2.ts` | **los tipos del contrato** |
| `app/web/src/components/topbar.tsx` | cabecera |
| `app/web/src/panels/companies/CompaniesPanel.tsx` | tabla de empresas |
| `app/web/src/panels/compare/ComparePanel.tsx` | comparativa |
| `app/web/src/panels/research/ResearchPanel.tsx` | ficha |
| `app/web/src/widgets/group/GroupWidget.tsx` | widget de grupo |
| `app/web/src/widgets/treemap/TreemapWidget.tsx` y su test | mapa |

La raíz del choque es que **las dos ramas resuelven problemas distintos sobre las mismas líneas**.
La PR #9 hizo nulables los campos porque el dato real de MotherDuck tiene huecos:

```
score, band, delta_1m, delta_3m, delta_6m, regime, confidence,
op_in_12m, op_in_12m_eur      →  todos pasan a `| null`
+ ScoreSnapshot y SnapshotFactor, nuevos, para la ficha del baseline estático
```

XR-032 reescribió esos mismos paneles contra el contrato completo, donde esos campos siempre
existen.

**Regla de resolución, y es la parte importante de este informe:** en cada hunk manda **la
disposición y los componentes de XR-032**, y **la tolerancia a nulos de la PR #9**. No es un
compromiso salomónico, es que cada rama acierta en lo suyo. La disposición de XR-032 es el producto
que se enseña. Y la tolerancia a nulos **no es un parche temporal que desaparezca cuando publiquemos
el motor temporal**: seguirá habiendo nulos legítimos en los meses de calentamiento, en las ramas de
cobertura sin facturas o sin deuda, en los techos mientras no estén implementados y en los grupos
con datos insuficientes. Una UI que asume que el dato siempre está es una UI que se rompe en
producción.

El tipo `ScoreSnapshot` que añadió la PR #9 sí es transitorio: existe solo para enseñar los cuatro
factores del baseline estático. Cuando la fase 2 sirva la serie real, se retira.

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

### Fase 0 · Cerrar el frontal en `main`

Va primero porque XR-033 toca los mismos ficheros y no se puede trabajar sobre una base en disputa.

1. Resolver los diecinueve hunks con la regla de §2.5: disposición y componentes de XR-032, tipos
   nulables y tolerancia a huecos de la PR #9.
2. Resolverlos **en un worktree temporal**, nunca en el de la sesión de XR-032 ni en el compartido.
3. Ejecutar la suite completa de la web y la de la API después del merge. Las dos tienen que quedar
   en verde antes de tocar nada más.
4. Mergear la PR #10 y marcar XR-032 `done`.

**Se verifica así:** `pnpm --filter web test` y `pnpm --filter api test` en verde sobre `main`, y la
aplicación arranca contra MotherDuck sin excepciones de tipo, aunque enseñe campos vacíos.

### Fase 1 · Publicar la salida del motor temporal

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

### Fase 2 · Leer las tablas derivadas en la API

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

### Fase 3 · Capa de KPIs de tesorería

Es la capa que falta para que Embat entienda la pantalla. Va **junto al score, no dentro**: el
score ordena la cartera, los KPIs explican en unidades reales, en euros, días y por ciento.

Por qué importa: el comprador es Embat, o un gestor de tesorería parecido, que quiere conocer la
salud financiera de **sus propios clientes**. Su vocabulario público es DSO, DPO, aging por tramos,
utilización de líneas, headroom y servicio de la deuda. El motor habla de pilares y de puntos. Esta
capa traduce.

Las coberturas están medidas sobre `datasets/` el 19/09 y se repiten aquí para que este documento no
dependa de ninguno local.

| KPI | Definición | Cobertura medida | Nota |
|---|---|---|---|
| Runway (meses) | liquidez disponible / burn neto 3 m, solo si el burn es negativo | 125 de 237 grupos queman caja neta en 6 m | `buffer_days` es cobertura de salidas brutas, no runway |
| Meses de cobertura | liquidez disponible / salidas operativas 3 m | todos | el KPI para la otra mitad de la cartera, la que genera caja |
| Burn neto (EUR) y tendencia | `op_in − op_out`, media 3 m, y variación frente a los 3 m previos | todos | existe como ratio, falta en absoluto |
| Burn bruto (EUR) | `op_out` 3 m, desglosado por nómina, proveedores, impuestos y deuda | todos | neto plano con bruto creciendo es otra conversación |
| Liquidez disponible | caja + `liquidity` no dispuesta de `debt_products` | líneas 434/536, confirming 175/229, factoring 21/24; **cuentas corrientes solo 11,4 %** | **ver trampas §7**, no es comparable entre clientes sin marcar quién tiene líneas |
| DSO / DPO | días de emisión a cobro y a pago, ponderados por importe, solo `status='paid'` | 742 sociedades con emitidas, 783 con recibidas | hoy solo hay retraso sobre vencimiento |
| Aging 0-30 / 31-60 / 61-90 / 90+ | vencido vivo por tramo, en cobros y en pagos | las mismas | los tramos que Embat enseña |
| Concentración de clientes | peso del mayor cliente y HHI de emitidas 12 m | 706 sociedades, 544 con cinco clientes o más | mediana del mayor cliente: **56,2 %** |
| Concentración bancaria | nº de bancos conectados y peso del principal, desde `banking_products.bank_name` | todos | riesgo para el cliente y señal comercial para Embat |
| Coste financiero | (intereses + comisiones) / salidas, y tendencia de `interest_charge` | 351 sociedades con intereses | el tipo implícito no es fiable |
| Desviación frente a previsión | previsión ingenua desde la estacionalidad propia 12 m, y desviación del real | todos con 12 meses o más | es la palabra literal de Embat: forecast frente a real |
| Cobertura de datos | % de importe sin categoría, rama y feeds mudos | 38,8 % del importe sin categoría | alimenta `confidence` y dice a Embat dónde falta conectividad |

Dos cosas que **no** entran, aunque suenen bien en una demo. La Rule of 40 es una métrica de
software por suscripción y aquí no hay ingresos ni EBITDA, solo cobros y caja: va como «eficiencia
de crecimiento» dentro de Actividad y nunca con ese nombre delante de Embat. Y el DSCR contable
desde `debt_schedule_config` tampoco, porque son 87 cuadros para 40 sociedades y las fechas cuadran
en el 26 % de los casos.

Se sirven en un bloque `kpis` junto al score, y el frontal los pinta **antes** que los pilares.

### Fase 4 · Las cinco señales estratégicas en la pantalla

Ya se calculan, no se publican. Van como **diagnóstico separado**, no dentro del número, tal y como
dice `SIGNALS_LUCAS.md`: una señal solo entra en el score oficial si aporta anticipación,
estabilidad o explicación, y eso se mide con `evaluate.py`.

En la ficha se pintan como cinco tarjetas con valor de 0 a 100, dirección, confianza y la evidencia
en una línea. El relato del pitch sale solo:

```
Salud actual · Trayectoria futura · Inteligencia Embat · Posición entre pares · Salud del ecosistema
```

### Fase 5 · Cierre del motor

Por orden de impacto, cada cambio pasando por `evaluate.py` contra la línea base de la fase 1:

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
| 0 | PR #10 mergeada, frontal y MotherDuck conviviendo | las dos suites en verde sobre `main`; la app arranca sin excepciones de tipo |
| 1 | salida del motor publicada y línea base guardada | `engine_exports` con una fila; `evaluation.json` en disco |
| 2 | la API sirve la serie real | `timeline` con más de 20 filas y `pillars.L.value` no nulo; `meta.model_version` es `embat-temporal-v1` |
| 3 | bloque `kpis` en la ficha | test de cobertura por KPI; el frontal pinta EUR, días y % |
| 4 | cinco señales estratégicas en pantalla | cada una con valor, dirección, confianza y evidencia |
| 5 | techos, régimen, cobros recalibrado, perspectiva | `evaluate.py` sin empeorar ninguna métrica y PSI por debajo de 0,1 |

La fase 0 es la que desbloquea el trabajo en equipo, porque hasta que no esté nadie puede tocar esos
nueve ficheros sin chocar. La fase 1 es de minutos. La fase 2 es la que rellena la aplicación entera
y es la que hay que hacer primero y bien. Las fases 3 y 4 se paralelizan en cuanto la 2 esté
servida.

---

## 9. Lo que no hay que hacer

- No tocar el contrato `/api/v2/*`. Tres tickets de frontal se apoyan en él.
- No revertir la tolerancia a nulos de la PR #9 al resolver el merge. Los nulos legítimos no
  desaparecen cuando llegue el motor temporal.
- No resolver los conflictos dentro del worktree de la sesión de XR-032 ni en el compartido. Se
  hace en uno temporal y se descarta después.
- No devolver datos mock cuando MotherDuck falle. El 503 `source_unavailable` es la decisión
  correcta y se conserva.
- No calcular finanzas dentro de una petición HTTP.
- No meter DSCR contable desde `debt_schedule_config`: 87 cuadros para 40 sociedades y las fechas
  cuadran en el 26 % de los casos.
- No inventar exposición FX, sector ni descomposición estacional: no hay datos que lo sostengan.
- No llamar Rule of 40 a la eficiencia de crecimiento delante de Embat. No hay ingresos ni EBITDA,
  solo cobros y caja.

---

## 10. Cómo se trabaja este ticket

Las reglas de trabajo del equipo viven en un protocolo local que no está en el repositorio. Lo que
hace falta para ejecutar XR-033 se repite aquí, para que cualquiera pueda hacerlo sin ese fichero.

**Aislamiento.** Un ticket es una rama y un worktree propio, nunca el directorio compartido, porque
hay varias sesiones trabajando a la vez sobre el mismo repositorio.

```sh
git worktree add ../hackspain-embat-XR-033 -b xr/XR-033-engine-connection main
```

**Objetivo verificable antes de escribir código.** Se escribe `features/XR-033/spec.md` con los
escenarios, y `evals/checks/XR-033.sh` con una línea por escenario, usando las funciones de
`evals/checks/lib.sh`: `web_test`, `api_test`, `py_test` para tests reales, y `api_json` o
`route_ok` solo para contratos HTTP. El check tiene que **salir distinto de cero** antes de
implementar nada. Si sale cero, no mide nada nuevo.

**Criterios de aceptación.** Cada fase termina con el suyo, el de §8, comprobado con un comando y
con la salida pegada. No vale una opinión.

**Cola.** `TASKQUEUE.md` vive solo en `main` y lo escribe el Gate. No se edita desde una rama: es el
fichero que choca en todas las PR. El estado del ticket se reporta en el chat y en
`features/NOTES.md`.

**Commits y entrega.** Mensajes `XR-033: <qué>` en inglés, uno por unidad de trabajo, sin
co-author, sin emoji. Nunca `git stash`, `git reset --hard` ni `git checkout .`. No se hace merge ni
push a `main`: eso lo hace Alfonso, que es el Gate, y él marca `done`.

**Cuándo parar y preguntar.** Si falta el token de MotherDuck, si el plan contradice a `AGENTS.md`
o al contrato de `docs/api/v2.md`, si hay que instalar una dependencia no listada, o si tres
pasadas seguidas fallan en el mismo punto. En ese último caso el problema está en el spec o en el
plan, no en el código: se anota el diagnóstico en `features/NOTES.md` y se para.

**Entorno.** El motor usa el `.venv` de la raíz con DuckDB y pandas. La API necesita
`MOTHERDUCK_TOKEN` en `app/api/.env`, que es gitignored y no se comparte por chat; los tests corren
sin él con `DATA_SOURCE=local`. Hay otras sesiones ocupando los puertos 5173, 8787, 4173 y 8789: usa
otros y dilo.
