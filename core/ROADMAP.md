# core/ — estado y siguientes pasos

Escrito el 19/09/2026 al cerrar la rama `data/storage-layer`, para quien siga
por la mañana. Cuenta qué hay, qué se ha medido, qué falta y **qué trampas ya
hemos pisado** para no repetirlas.

> **El formato de salida es provisional.** `core/outputs/*.json` y lo que espera
> la app son la misma decisión y se acuerda mañana con quien lleva la API. No
> hace falta respetar el esquema de `datasets_mocked/`: puede cambiar entero.
> Lo que sí hay que conservar es **cómo se calcula**, no cómo se serializa.

---

## 1. Qué hay ahora

```
core/
  datastore/          acceso a datos: catálogo, caché Parquet, validación
  signals/            catálogo modular de señales (una por módulo)
  engine/             motor de scoring por capas — todo lo ajustable en config.py
  scoring.py          baseline estático (de Dani)    — funciones puras
  pipeline.py         baseline estático              — foto a 2026-09-01, por sociedad
  pipeline_embat.py   motor temporal                 — 24 meses, por grupo
  evaluate.py         banco de pruebas: 5 métricas sin etiqueta
  tests/              6 tests, 4,3 s
```

### Cómo se ejecuta

```bash
.venv/bin/python core/pipeline.py                  # baseline  -> outputs/scores.json
.venv/bin/python core/pipeline_embat.py            # temporal  -> outputs/scores_embat.json
.venv/bin/python core/evaluate.py                  # métricas  -> outputs/evaluation.json
.venv/bin/python -m pytest core/tests/ -q          # 6 tests

# contra otro dataset (el test oculto llega así: mismo formato, menos grupos)
.venv/bin/python core/pipeline_embat.py --data-root /ruta/al/test --no-cache
EMBAT_DATA_ROOT=/ruta/al/test .venv/bin/python core/pipeline_embat.py
```

### Los dos motores

| | `pipeline.py` | `pipeline_embat.py` |
|---|---|---|
| Unidad | sociedad (1.286) | **grupo (250)** — la confirmada |
| Tiempo | una foto | **24 meses**, point-in-time |
| Factores | 4 | 5 pilares / 16 señales |
| Usa `transactions` | no | sí (2,5 M filas) |
| Puntuadas | 830 de 1.286 | 249 de 250 |
| Ejecución | 2 s | 2,4 s |

Los dos comparten esqueleto (anclas → 0-100 → renormalización por cobertura →
banda → drivers), así que **fundirlos es un problema de parámetros, no de
reescritura**.

---

## 2. Hecho

- **Capa de datos** (`datastore/`): catálogo con tipos declarados, raíz
  configurable, caché Parquet, validación. El pipeline pasó de **21 s a 2,4 s**.
- **Motor temporal por grupo** con replay de 24 meses, suavizado EWMA por pilar,
  penalización del pilar más débil y encogimiento por cobertura parcial.
- **Banco de pruebas** (`evaluate.py`) con 5 métricas sin etiqueta.
- **Dos garantías, con test**: la ejecución es determinista y **el score de un
  grupo no cambia si el fichero trae menos grupos** (873 scores, diferencia 0).
- **Tres arreglos medidos**: el factor de utilización que regalaba 25 puntos, el
  sesgo que premiaba no tener ERP (a medias), y el ruido mensual del score.

---

## 3. Dónde estamos, medido

`core/outputs/evaluation.json`, última ejecución:

| Métrica | Valor | Lectura |
|---|---|---|
| **M1** anticipación @3m | score **0,714** · tendencia **0,507** · `buffer_days` **0,881** | el compuesto pierde contra una sola ratio; la tendencia es una moneda al aire |
| **M2** estabilidad | ρ **0,931** · mediana \|Δ\| 2,65 · p90 8,23 | OK (objetivo ≥ 0,90) |
| **M3** dispersión | n 249 · mediana 57,4 · sd 14,6 · [21,6 – 83,4] | separa bien |
| **M4** paridad ramas | PSI **0,432** · con facturas 53,1 · sin 65,5 | **ROJO** (objetivo < 0,1) |
| **M5** aislamiento | 0 diferencias | OK |

**Cómo se usa:** ejecutar `evaluate.py` **antes y después** de cada cambio de
fórmula y comparar `evaluation.json`. La regla propuesta: **un cambio entra solo
si ninguna métrica empeora.**

---

## 4. Qué falta, por orden

### 4.1 Recalibrar el pilar `collections` — es lo que queda de M4

La mediana del pilar es **33,5**, frente a 62-77 del resto. Como solo existe
para 167 de 250 grupos, quien no tiene ERP se libra de él y **puntúa 12 puntos
más alto**. Ya no es un fallo de la lógica de cobertura (eso está arreglado):
**las anclas están mal calibradas**.

Sospechoso principal: `collection_ratio` = cobrado 3m / facturado 3m, que en
cualquier empresa que crezca o tenga desfase es estructuralmente < 1, así que
castiga a casi todo el mundo. Recalibrar para que la mediana del dataset caiga
cerca de 50 debería cerrar casi todo el hueco. **Medir con `evaluate.py`.**

### 4.2 Reconstruir la trayectoria

`slope_3m` del score da **AUC 0,507**: no predice nada. La derivada de un
compuesto suavizado llega tarde por construcción. Si queremos anticipación tiene
que salir de las señales con perfil de adelanto (`inflow_cv`, `feeint_share`,
`ap_overdue`, `ar_days_late`), no de la pendiente del propio score.

### 4.3 Completar el catálogo de señales

Hay **16 implementadas**; el diseño de `ENGINE.md` describe 28. Faltan sobre
todo las de contraparte (concentración, churn) y las de fortaleza explícita.
**No añadir por añadir**: cada señal nueva pasa por `evaluate.py` y si no mueve
ninguna métrica, sobra.

### 4.4 Preprocesado y atípicos

El 0,25 % de las filas concentra el 75 % del importe absoluto. Hoy se defiende
con ratios, recortes por dominio y escalado contra la propia historia, pero **no
hay winsorización**. Ojo: cualquier recorte estimado sobre la cohorte cargada
rompe M5; los límites tienen que ser **absolutos o congelados en fichero**.

### 4.5 Dar a `pipeline.py` los datos de transacciones

Sin flujos no hay `buffer_days`, que es la señal más predictiva del dataset
(AUC 0,88). Además recuperaría parte de las 456 sociedades que perdieron score.
Puede leer por `datastore/` sin tocar el resto: el catálogo ya cubre todo lo que
usa.

### 4.6 Acordar el contrato de salida con la API

Mañana, con quien lleva la app. **Nada de lo anterior depende de esto**: el
motor calcula igual y la serialización es la última capa.

---

## 4.7 El motor vive en `engine/`, no en un script

`scoring_embat.py` ya no existe: cada etapa es un módulo en `engine/`
(`families`, `combine`, `modifiers`, `overrides`, `calibrate`, `explain`,
`trace`). **Todo lo ajustable está en `engine/config.py`** y las formas de
mezclar se eligen por nombre desde `engine/registry.py`. Para cambiar cómo se
combina una familia se edita una línea de configuración, no la lógica.

El score se construye por capas: nivel → momentum (±8) → contexto (±4) →
techos absolutos. Cada capa escribe su paso en el rastro mientras calcula, y
`explain.py` monta la frase de la demo desde ahí, así que la explicación no
puede contradecir al número. Detalle en [`engine/README.md`](engine/README.md).

---

## 5. Trampas ya pisadas — no repetirlas

1. **Las sumas en coma flotante no son deterministas.** DuckDB agrega en
   paralelo y la suma no es asociativa: la misma ejecución daba totales que
   diferían ~1e-4, suficiente para cruzar un ancla y **mover el score 25
   puntos**. Todos los importes se redondean a céntimos al agregar. Si añades
   una agregación monetaria nueva, **redondéala**.

2. **Nada puede depender de la cohorte cargada.** Percentiles, winsorización por
   mes, calibración por cuantiles: todo eso daría otro número para el mismo
   grupo cuando el fichero traiga 60 en vez de 250. Hoy solo se usan **anclas
   absolutas** y por eso M5 pasa. Si necesitas un percentil, **congélalo en
   `params/` y cárgalo**, no lo calcules en ejecución.

3. **Renormalizar sin penalizar la ignorancia infla el score.** Si de un pilar
   solo observas el 35 % del peso, no puedes sacar un 100 en él. Por eso está el
   encogimiento `50 + (P − 50)·√f`, dentro del pilar y entre pilares.

4. **`payment_date` está rellena también en facturas no pagadas** (237.593
   filas) y trae fechas imposibles. Usarla **solo** con `status='paid'` y dentro
   de ventana. El estado as-of se reconstruye por acumulados de altas y bajas,
   nunca con `pending_amount`, que es una foto final.

5. **Dejar de pagar Seguridad Social no es tensión, es un feed mudo.** La
   actividad total cae a 0,47× su propia base cuando eso pasa: es la conexión
   bancaria apagándose. La caja negativa sí es tensión real (actividad 1,16×).
   No convertir ausencia de movimientos en mala salud.

6. **Falta de dato ≠ mala salud.** 83 grupos no tienen facturas y 100 no tienen
   deuda. Excluir y renormalizar, nunca imputar cero.

7. **El mes crudo es ruido.** Sin suavizado el ranking iba a ρ 0,82 con saltos
   de 17 puntos. Con EWMA sobre el **pilar** (no sobre el score final, para que
   la descomposición siga cuadrando) sube a 0,93.

8. **No hay etiqueta y no hay factor latente de salud.** Tres indicadores de
   tensión independientes no co-varían (*lifts* 0,98 / 0,94 / 1,13). El score es
   **una definición, no una estimación**: se defiende por su descomposición, no
   por su ajuste. No intentes entrenar contra una etiqueta proxy: ya se probó y
   da AUC fuera de fold 0,44-0,53.

9. **Validar contra el futuro del propio score es circular.** Un score suavizado
   continúa su tendencia por construcción. Las pruebas válidas van contra un
   evento observable definido **fuera** del score, excluyendo a quien ya está
   dentro en `t`. Es lo que hace M1.

---

## 6. Contexto que no está en el código

- **La unidad confirmada es el grupo** (250), no la sociedad. La sociedad sirve
  de drill-down.
- **Escala 0-100 confirmada**, más alto = más sano. La distribución dentro de la
  escala sigue siendo hipótesis nuestra.
- **No hay validación numérica contra etiqueta**: se juzgan las conclusiones
  vistas en la app. El score importa porque las alimenta, no por su precisión.
- **El test oculto llega en el mismo formato con menos grupos.** Por eso M5 es el
  test que protege la entrega.
- **Audiencia: un inversor / prestamista.** La pantalla principal es una cartera
  ordenada, no un cuadro de mando de tesorería.

Detalle en [`docs/lauren/`](../docs/lauren/): `BUILD-PLAN.md` (plan y decisiones
abiertas), `COMPARISON.md` (todas las mediciones), `LABEL-VIABILITY.md` (por qué
no hay etiqueta), `UNKNOWNS.md` (qué sabemos y qué asumimos).

---

## 7. Definición completa del algoritmo objetivo (`embat-temporal-v2`)

Esta sección fija **qué calcula el motor cuando esté terminado**. Es la versión
de referencia para el equipo entero: quien toque `scoring_embat.py`, quien
integre la API (XR-020) y quien explique el score a Embat o al jurado leen lo
mismo. Cumple las trampas de §5 por construcción: anclas absolutas o congeladas
en fichero, nada estimado sobre la cohorte cargada, ausencia de dato ≠ mala
salud, suavizado sobre el pilar y no sobre el score, y validación contra eventos
definidos fuera del score. Lo que ya existe en `v1` se marca **[v1]**; lo que
falta, **[v2]**. El diseño largo con la evidencia de cada umbral está en
`docs/alfonso/ENGINE-EMBAT.md`; aquí está la definición operativa.

### 7.1 Qué mide el score y qué no

El score responde a una sola pregunta: **¿puede esta empresa seguir pagando lo
que debe en los próximos meses?** Es una **definición**, no una estimación (§5.8):
se defiende porque cada punto se descompone en señales observables, no porque
ajuste una etiqueta. Por eso el número va siempre acompañado de tres cosas que
no se colapsan dentro de él: la **trayectoria** (hacia dónde va), la **confianza**
(cuánto dato lo sostiene) y la **alerta temprana** (la señal que de verdad
anticipa, `buffer_days`, con su propio canal).

Lo que el score **no** mide: rentabilidad contable, valor de la empresa,
probabilidad de impago calibrada. No tenemos balance ni cuenta de resultados;
tenemos movimientos bancarios, facturas y productos de deuda, y el score se
limita a lo que eso permite ver.

### 7.2 Flujo de datos, de la tabla al número

```
datasets/*.csv
  │ 1. catálogo + validación (datastore/)            [v1]
  │ 2. taxonomía de flujos por categoría             [v1]
  │ 3. caja diaria reconstruida por producto         [v1]
  │ 4. estado as-of de facturas por acumulados       [v1]
  │ 5. emparejamiento intercompany (espejos)         [v2]
  ▼
panel de señales crudas  (grupo × mes × señal, con is_available)
  │ 6. señal → puntos 0-100 con anclas congeladas    [v1]
  │ 7. pilar = media ponderada + encogimiento √f     [v1]
  │ 8. EWMA α=0,5 sobre cada pilar                   [v1]
  │ 9. nivel = Σ pilares + encogimiento √cobertura   [v1]
  │ 10. penalización del pilar más débil             [v1]
  │ 11. techos por eventos duros (caps)              [v2]
  ▼
score mensual 0-100 + banda
  │ 12. trayectoria y régimen (histéresis 2 meses)   [v1 parcial → v2]
  │ 13. índice de adelanto y outlook 3/6 m con banda [v2]
  │ 14. alerta temprana por buffer_days              [v1]
  │ 15. drivers por señal y por pilar, Δ exacto      [v1 por pilar → v2 por señal]
  │ 16. confianza (historia × cobertura × calidad)   [v1]
  │ 17. agregado de grupo con dispersión             [v1 parcial → v2]
  ▼
outputs/ (contrato a acordar con la API; §4.6)
```

Reglas de preparación que condicionan todo lo demás:

- **Flujos.** `op_in` = collection, bulk_collection, pos_settlement,
  cash_settlement(s), payment_refund, tax_refund. `op_out` = payment,
  bulk_payment, utility, salary, tax, social_security, collection_refund.
  `fin_out` = debt_repayment, interest_charge, fee. `inv` = investment_deployment
  / investment_return. `internal` = transfer, cash_withdrawal, pos_withdrawal
  (fuera de flujos; base del neteo intercompany). `unclassified` solo cuenta
  para calidad de dato.
- **Caja.** `B(d) = saldo_foto − Σ amount(fecha ≤ fecha_foto) + Σ amount(fecha ≤ d)`
  por producto checking/saving/investment. Marcar `cash_quality = low` si la
  apertura reconstruida es < −1.000 € o el saldo supera 100× los cobros anuales.
- **Facturas.** `payment_date` solo con `status = 'paid'` y dentro de ventana
  (§5.4). Emitida = importe > 0 (cliente); recibida = importe < 0 (proveedor).
  Vencida = viva con `due_date < cierre`.
- **Intercompany.** Transferencia saliente en A y entrante en B, mismo grupo,
  importe opuesto (< 0,01) y |Δfecha| ≤ 2 días → `intercompany = true`. Se
  excluye de `op_in` y se netea en el grupo.
- **Importes** redondeados a céntimos en cada agregación (§5.1).

### 7.3 Las cinco familias: qué significan y por qué pesan lo que pesan

| Familia | Peso | Pregunta que responde | Por qué ese peso |
|---|---|---|---|
| **L · Liquidez y colchón de caja** | 25 | ¿Cuánto aguanta si mañana deja de cobrar? | Quedarse sin caja es lo único que mata a corto plazo. `buffer_days` es la señal más predictiva del dataset (AUC 0,88). |
| **P · Disciplina de pago propia** | 20 | ¿Paga lo que debe, y a tiempo? | El retraso a proveedores es un rasgo estable (ICC 0,61) y dejar de pagar a Hacienda o a la Seguridad Social es la bandera roja clásica. |
| **C · Cobros y calidad de cartera** | 15 | ¿Le pagan sus clientes? | Vender sin cobrar mata igual, pero un tercio de las empresas no tiene facturas y el cobro acaba reflejándose en la caja: pesa menos para no duplicar. |
| **D · Deuda y coste de financiación** | 20 | ¿Cuánto depende del banco y cuánto le cuesta? | La utilización de líneas es la señal mejor cuantificada en la literatura (81 % en default frente a 52 %, dos años antes). |
| **A · Actividad y estabilidad** | 20 | ¿El negocio crece, se mantiene o se apaga, y es predecible? | La volatilidad de cobros es la que mejor **adelanta** en este dataset; el crecimiento neto de intercompany separa a la filial sostenida por la matriz. |

Los pesos suman 100 y son parámetros congelados. Se defienden por evidencia,
no por ajuste: no hay etiqueta contra la que optimizarlos (§5.8).

### 7.4 Señales por familia

Convenciones: **ventana** trailing incluyendo el mes actual; **↑** mayor es
más sano, **↓** menor es más sano; **anclas** en formato `valor → puntos`, con
interpolación lineal y recorte a [0, 100]; **peso** dentro del pilar (los pesos
de cada pilar suman 100). Las señales marcadas **Q** usan anclas obtenidas de
cuantiles del universo de referencia y **congeladas en `params/v2.yaml`**; en
ejecución son anclas absolutas como las demás, así que M5 se mantiene.
`requires` indica el dato sin el cual la señal no existe (nunca se imputa).

**L · Liquidez (25)**

| id | Señal | Definición sobre los datos | Ventana | ↑↓ | Anclas | Peso | requires | Estado |
|---|---|---|---|---|---|---|---|---|
| L1 | `buffer_days` | `30 · caja_fin_mes / media(op_out, 3m)` | 3m | ↑ | 0→0 · 10→30 · 27→60 · 60→90 · 120→100 | 30 | caja | [v1] |
| L2 | `cash_min_ratio` | mínimo diario de caja agregada en el mes / media(op_out, 3m) | 1m + 3m | ↑ | Q | 15 | caja | [v2] |
| L3 | `neg_cash_share` | fracción de los últimos 3 meses con caja agregada < 0 (v2: días con caja < 0 / días del mes, media 3m) | 3m | ↓ | 0→100 · 0,34→50 · 0,67→20 · 1→0 | 25 | caja | [v1] |
| L4 | `runway_months` | `(caja + inversión) / media(op_out, 3m)`, recortado a [−3, 24] | 3m | ↑ | 0→0 · 0,5→25 · 1→45 · 3→80 · 6→100 | 15 | caja | [v2] |
| L5 | `cash_trend` | variación relativa de la caja de fin de mes frente a la mediana de los 3 meses previos | 3m | ↑ | −0,5→0 · −0,2→30 · 0→60 · 0,2→85 · 0,5→100 | 15 | caja | [v1] |

`invest_presence` (inversión / salidas 12m) no entra como señal: alimenta la
etiqueta de fortaleza (§7.9).

**P · Disciplina de pago propia (20)**

| id | Señal | Definición sobre los datos | Ventana | ↑↓ | Anclas | Peso | requires | Estado |
|---|---|---|---|---|---|---|---|---|
| P1 | `ap_pct_paid_late` | del importe de recibidas **pagadas** en ventana, fracción pagada después del vencimiento (≥ 5 facturas) | 3m | ↓ | 0→100 · 0,1→85 · 0,3→60 · 0,6→20 · 0,8→0 | 30 | invoices | [v1] |
| P2 | `ap_days_late_w` | retraso medio ponderado por importe, recibidas pagadas | 3m | ↓ | 0→100 · 7→80 · 15→60 · 30→30 · 60→0 | 20 | invoices | [v1] |
| P3 | `ap_overdue_over_received` | recibidas vivas y vencidas a cierre / importe recibido 3m | stock + 3m | ↓ | Q | 15 | invoices | [v2] |
| P4 | `ss_regularity` | meses con `social_security` / meses activos | 6m | ↑ | 0,5→0 · 0,67→40 · 0,83→70 · 1→100 | 15 | ≥ 3 pagos de SS en la historia | [v1] |
| P5 | `tax_regularity` | trimestres con `tax` en su primer mes / trimestres observados | 12m | ↑ | 0→0 · 0,25→30 · 0,5→60 · 0,75→85 · 1→100 | 10 | ≥ 3 pagos de tax | [v1] |
| P6 | `salary_regularity` | meses con `salary` / meses activos | 6m | ↑ | 0,5→0 · 0,75→60 · 0,9→100 | 10 | ≥ 3 nóminas | [v2] |

Regla de las regularidades (P4–P6): solo existen si la empresa ha mostrado esa
categoría al menos 3 veces antes; si la actividad total del mes cae por debajo
de 0,6× su base de 12 meses, la ausencia se marca `feed_silent` y **no puntúa**
(§5.5: un feed apagado no es tensión).

**C · Cobros y calidad de cartera (15)**

| id | Señal | Definición sobre los datos | Ventana | ↑↓ | Anclas | Peso | requires | Estado |
|---|---|---|---|---|---|---|---|---|
| C1 | `ar_pct_paid_late` | del importe de emitidas **cobradas**, fracción cobrada después del vencimiento (≥ 5) | 3m | ↓ | 0→100 · 0,1→85 · 0,3→60 · 0,6→20 · 0,8→0 | 25 | invoices | [v1] |
| C2 | `ar_days_late_w` | mora de clientes ponderada por importe | 3m | ↓ | 0→100 · 10→80 · 20→60 · 40→30 · 80→0 | 15 | invoices | [v2] |
| C3 | `ar_overdue_ratio` | emitidas vivas y vencidas a cierre / emitido 3m | stock + 3m | ↓ | Q (recalibrada, §7.10) | 20 | invoices | [v1 → recalibrar] |
| C4 | `collection_ratio` | cobrado 3m / emitido 3m, recortado a [0, 3] | 3m | ↑ | Q (recalibrada, §7.10) | 15 | invoices | [v1 → recalibrar] |
| C5 | `customer_breadth` | nº de clientes distintos 12m (log) y, si ≥ 5, `1 − HHI` de importes | 12m | ↑ | Q | 15 | invoices | [v2] |
| C6 | `customer_churn_rel` | clientes perdidos 12m / clientes 12m previos, relativo a la mediana congelada | 24m | ↓ | Q | 10 | invoices | [v2] |

**D · Deuda y coste de financiación (20)**

| id | Señal | Definición sobre los datos | Ventana | ↑↓ | Anclas | Peso | requires | Estado |
|---|---|---|---|---|---|---|---|---|
| D1 | `loc_utilisation` | Σ dispuesto / Σ concedido en lineofcredit + confirming + factoring, recortado a [0, 1]; concedido nulo o 0 → no disponible | foto (últimos 3 meses); antes, dispuesto reconstruido | ↓ | 0→100 · 0,3→90 · 0,6→60 · 0,9→20 · 1→0 | 25 | líneas | [v1] |
| D2 | `debtrep_regularity` | meses con `debt_repayment` en 6m / meses con repago en los 12 previos (relativo a su propia base) | 6m vs 12m | ↑ | 0→0 · 0,5→20 · 0,8→60 · 1→100 | 20 | ≥ 6 repagos en 9 meses | [v2] |
| D3 | `debt_service_ratio` | `(debt_repayment + interest_charge) 3m / op_in 3m` | 3m | ↓ | 0→100 · 0,1→80 · 0,25→50 · 0,5→20 · 1→0 | 20 | deuda | [v1] |
| D4 | `feeint_share` | `(fee + interest_charge) 3m / op_out 3m` | 3m | ↓ | 0→100 · 0,01→85 · 0,03→60 · 0,08→25 · 0,15→0 | 15 | — | [v1] |
| D5 | `nonbank_debt_share` | dispuesto en productos custom / in-house sobre dispuesto total | foto | ↓ | 0→100 · 0,25→60 · 0,5→30 · 0,75→0 | 10 | deuda | [v2] |
| D6 | `leverage_flow` | dispuesto total / op_in 12m | 12m | ↓ | Q | 10 | deuda | [v2] |

**A · Actividad y estabilidad (20)**

| id | Señal | Definición sobre los datos | Ventana | ↑↓ | Anclas | Peso | requires | Estado |
|---|---|---|---|---|---|---|---|---|
| A1 | `op_in_growth` | `op_in 3m / op_in 3m previos − 1`, **neto de intercompany**; con 24 meses, media con la versión 12m/12m | 3m y 12m | ↑ | −0,5→0 · −0,2→30 · 0→60 · 0,25→85 · 0,6→100 | 25 | — | [v1; neteo v2] |
| A2 | `inflow_cv` | desviación típica / media de `op_in` mensual | 3m (y 6m) | ↓ | 0,1→100 · 0,3→80 · 0,6→55 · 1→25 · 1,8→0 | 25 | — | [v1] |
| A3 | `net_ocf_ratio` | `(op_in − op_out) 3m / op_out 3m` | 3m | ↑ | −0,3→0 · −0,1→35 · 0→55 · 0,1→75 · 0,3→100 | 20 | — | [v1] |
| A4 | `activity_trend` | nº de movimientos 3m / (nº de movimientos 12m · 3/12) | 3m vs 12m | ↑ | Q | 10 | — | [v2] |
| A5 | `intragroup_dependency` | entradas intercompany 6m / (op_in + entradas intercompany) 6m | 6m | ↓ | 0→100 · 0,2→70 · 0,5→30 · 0,8→0 | 10 | espejos | [v2] |
| A6 | `unclassified_share` | (sin clasificar entrante + saliente) / bruto total | 3m | ↓ | — | 0 | — | solo `quality_flag` [v2] |

### 7.5 Composición: de la señal al score

1. **Señal → puntos.** `s_i = interp(valor_i, anclas_i)`, en [0, 100]. Sin
   valor, sin puntos (nunca se imputa).
2. **Pilar.** `raw_k = Σ w_i s_i / Σ w_i` sobre las señales disponibles, y
   **encogimiento por cobertura**: `P_k = 50 + (raw_k − 50) · √f_k`, con
   `f_k` = peso observado / peso total del pilar. Lo no observado se asume
   medio, no excelente (§5.3). Un pilar sin ninguna señal no existe ese mes.
3. **Suavizado.** `P̃_k,t = 0,5 · P_k,t + 0,5 · P̃_k,t−1` (EWMA causal, α = 0,5,
   vida media ≈ 1 mes). Se aplica al pilar, no al score, para que la
   descomposición siga cuadrando (§5.7). Excepción: las señales de evento
   (L3, P4–P6, D1, D2) entran en su pilar sin suavizar, porque un impago no se
   promedia.
4. **Nivel.** `w_k^eff = w_k / Σ_{disponibles} w_j`;
   `Level_t = Σ w_k^eff · P̃_k,t`, y encogimiento entre pilares:
   `Level_t = 50 + (Level_t − 50) · √cobertura`, con cobertura = Σ pesos de los
   pilares disponibles. Cobertura < 0,5 o menos de 3 meses de historia → sin
   score.
5. **Penalización del eslabón débil.** `Penalty_t = 0,5 · max(0, 45 − min_k P̃_k,t)`.
   Agregación no compensatoria explicable: una caja perfecta no tapa una deuda
   en 15; el recorte sale como driver con nombre.
6. **Techos por eventos duros [v2].** `Score_t = min(Level_t − Penalty_t, Cap_t)`.
   Solo eventos dinámicos observables mes a mes, con dos meses de persistencia
   para separar bache de caída (el 63–74 % de los eventos puntuales del dataset
   son rachas de un mes):

   | Código | Condición as-of t | Techo | Vigencia |
   |---|---|---|---|
   | `CAP_NEGCASH` | caja agregada < 0 ≥ 10 días en t y en t−1 | 40 | mientras persista + 1 mes |
   | `CAP_SSMISS` | SS pagada ≥ 9 de 12 meses previos, ausente en t y t−1, **y actividad ≥ 0,6× su base** (si no, es feed apagado, §5.5) | 45 | 2 meses |
   | `CAP_DEBTSTOP` | repago regular ≥ 6 de 9 meses, ausente 2 meses seguidos, misma condición de actividad | 50 | 2 meses |
   | `CAP_LOCFULL` | `loc_utilisation ≥ 0,95` en meses cubiertos por la foto | 60 | mientras persista |

   El techo aparece como driver con su código y con los puntos que recorta
   (`cap_adj = level − min(level, cap)`), así que la identidad del score sigue
   siendo exacta.
7. **Bandas.** ≥ 80 `solid`, 60–79 `healthy`, 40–59 `watch`, < 40 `stress`.
   Sin calibración por cuantiles: dependería de la cohorte cargada (§5.2).

### 7.6 Trayectoria y régimen

Todo causal: en el mes t solo se usa lo anterior a t. Sobre la serie de `Score`:

- `slope_3m`, `slope_6m`: pendiente por mínimos cuadrados [v1]; en v2, pendiente
  **Theil–Sen** sobre 6 meses (robusta a un mes atípico).
- `z_own`: distancia del mes al nivel previo, en desviaciones de la propia
  empresa (mediana y MAD de los 6 meses anteriores) [v2].
- `breadth`: fracción de pilares que se mueven en la misma dirección que el
  score [v2]. Un deterioro en un solo pilar es una avería local; en tres, es
  sistémico.
- `level_shift`: mediana de los 3 últimos meses menos mediana de los 6
  anteriores [v1].

Reglas, con **histéresis de dos meses** (un régimen solo cambia si la condición
se cumple dos meses seguidos), y `warmup` con menos de 7 meses:

| Régimen | Condición |
|---|---|
| `deteriorating` | pendiente 6m ≤ −1,0 puntos/mes y ≥ 3 meses en la dirección, o `breadth` ≥ 0,6 a la baja |
| `improving` | pendiente 6m ≥ +1,0 y ≥ 4 meses en la dirección |
| `blip` | \|z_own\| ≥ 2 durante 1–2 meses y el nivel vuelve a ±1 σ de su mediana previa en ≤ 2 meses (el «bache» del brief) |
| `shock_pending` | \|z_own\| ≥ 2 este mes, aún sin saber si revierte (pendientes 3m y 6m de signo contrario) |
| `recovering` | `level_shift` ≥ +5 tras un régimen `deteriorating` o un techo activo en los 6 meses previos |
| `stable` | ninguna de las anteriores |

**Bache frente a caída, en una frase:** un bache es un salto grande que
revierte en dos meses y no rompe la mediana; una caída es una pendiente
sostenida o un salto que no revierte.

### 7.7 Anticipación: índice de adelanto y outlook [v2]

La pendiente del propio score no anticipa (M1 tendencia 0,507): un compuesto
suavizado llega tarde por construcción (§4.2). La anticipación sale de las
señales con perfil de adelanto medido en el dataset, combinadas en un **índice
de adelanto** separado del score:

```
Lead_t = 0,35 · z(buffer_days_trend) + 0,25 · z(inflow_cv) + 0,15 · z(feeint_share)
       + 0,15 · z(ap_overdue_over_received) + 0,10 · z(ar_days_late_w)
```

donde `z(·)` es la variación de la señal en 3 meses frente a su propia
historia (mediana y MAD de 12 meses; signo orientado a «peor = positivo»).
Sin cohorte: cada empresa se compara consigo misma.

- **Outlook a 3 y 6 meses.** `Outlook_h = Score_t + slope_6m · h − k_h · Lead_t`,
  con `k_3 = 3` y `k_6 = 5`, recortado a [0, 100]. La **banda** es
  `± (σ_own · √h)`, con `σ_own` la desviación de los cambios mensuales de la
  propia empresa (mínimo 3 puntos). En la UI, esa banda es el «Bid/Ask».
- **Alerta temprana.** Canal propio y no colapsado en el score (§7.1):
  `buffer_days` en banda `critical` (< 10 días), o `watch` (< 27) dos meses
  seguidos, o `Lead_t ≥ 1,5` dos meses seguidos. Cada alerta lleva la señal
  que la dispara, su valor y el texto «cayendo / plano / subiendo».
- **Métrica de aceptación.** M1 se calcula para `Score`, para `Outlook_3` y
  para `Lead`; `Outlook_3` tiene que superar al `Score` en anticipación a 3
  meses, y `Lead` acercarse a `buffer_days` (0,88). Si no, el índice sobra.

### 7.8 Explicabilidad: cada punto tiene nombre

- **Contribución por señal.** `c_i = 100 · w_k^eff · (w_i / Σ w) · (s_i − 50) / 100`
  respecto al punto neutro 50; por pilar, `C_k = w_k^eff · (P̃_k − 50)` [v1].
- **Identidad exacta.** `Score = 50 + Σ_k C_k − Penalty − cap_adj`, y por tanto
  `ΔScore = Σ ΔC_k − ΔPenalty − Δcap_adj`. Un test lo comprueba en cada
  ejecución (la invariante que XR-001 hizo no tautológica: `cap_adj` se
  reconstruye de `level` y `cap`, nunca de `score`).
- **«Qué se movió».** Drivers ordenados por |Δc| entre t−1 y t, con la señal,
  el valor crudo antes y después y el pilar; los tres mayores en la cabecera y
  el resto en el detalle.
- **Narrativa.** Plantilla determinista por driver y régimen: «El colchón de
  caja baja de 41 a 22 días (−6 puntos); la utilización de líneas sube al 88 %
  (−4). Régimen: deteriorando, 4 meses». Sin modelo de lenguaje en el cálculo.

### 7.9 Cobertura, confianza y fortaleza

- **Ramas de cobertura.** Completa (L, P, C, D, A); sin deuda (D solo con D4);
  sin facturas (P solo con P4–P6, sin C); sin facturas ni deuda. Cada rama
  renormaliza y encoge (§7.5), y la rama va en la salida para que la UI la
  muestre («score con 3 de 5 familias»).
- **Confianza.** `confidence = f_hist · cobertura · f_quality`, con
  `f_hist` = 0,45 (< 6 meses), 0,75 (6–11), 0,9 (12–17), 1,0 (≥ 18) y
  `f_quality` = 0,8 si `cash_quality = low` o `unclassified_share > 0,6`.
  Con confianza < 0,5 el score se enseña con banda ancha y **no dispara
  alertas**.
- **Fortaleza explícita [v2].** El brief exige reconocer a la «excepcionalmente
  sólida». Etiquetas `strength_flags`, que no suman puntos y alimentan el driver
  «por qué es sólida»: crecimiento (A1 > 0) con mora de clientes plana o
  bajando; P1 ≤ 0,1 sostenido 6 meses; L1 ≥ 60 días con D1 ≤ 0,3; D2 ≥ 1 con
  D6 bajando; presencia de inversión.

### 7.10 Calibración de las anclas Q y arreglo de M4

Las anclas **Q** se fijan una vez sobre el universo de referencia (todas las
empresas, meses fuera de warm-up) con el procedimiento siguiente, y se guardan
en `params/v2.yaml`: `p05 → 0 (o 100 si ↓)`, `p25 → 30`, `p50 → 55`,
`p75 → 80`, `p95 → 100`. En ejecución son constantes: el test oculto, con
menos grupos, recibe las mismas anclas (M5 se conserva).

El mismo procedimiento cierra M4 (§4.1): `ar_overdue_ratio` y `collection_ratio`
se recalibran para que la mediana del universo caiga en 55, con lo que el pilar
C deja de estar en 33,5 frente a 62–77 de los demás y quien no tiene ERP deja
de ganar 12 puntos. Regla de entrada del cambio: `evaluate.py` antes y después,
y entra solo si ninguna métrica empeora y el PSI de M4 baja de 0,1.

### 7.11 Grupo

La unidad confirmada es el grupo (§6). Nunca se promedian ratios de filiales:

1. Netear intercompany y convertir a EUR con la tabla constante.
2. Recalcular todas las señales sobre los agregados consolidados (caja
   consolidada / salidas consolidadas; retrasos ponderados sobre todas las
   facturas no intercompany; líneas sumadas).
3. Aplicar §7.5–§7.9 tal cual.
4. Añadir `group_dispersion = max − min` de los scores de filiales y
   `weakest_subsidiary`. Un grupo en 70 con una filial en 25 se muestra como 70
   con aviso, y `intragroup_dependency` de la filial explica si vive de la
   matriz.

### 7.12 Parámetros congelados

```yaml
version: embat-temporal-v2
pillars: {L: 25, P: 20, C: 15, D: 20, A: 20}
signals:                      # peso dentro del pilar; anclas en §7.4 o Q congeladas
  L: {L1: 30, L2: 15, L3: 25, L4: 15, L5: 15}
  P: {P1: 30, P2: 20, P3: 15, P4: 15, P5: 10, P6: 10}
  C: {C1: 25, C2: 15, C3: 20, C4: 15, C5: 15, C6: 10}
  D: {D1: 25, D2: 20, D3: 20, D4: 15, D5: 10, D6: 10}
  A: {A1: 25, A2: 25, A3: 20, A4: 10, A5: 10}
shrinkage: sqrt                # dentro del pilar y entre pilares
ewma_alpha: {flow: 0.5, event: 1.0}
penalty: {lambda: 0.5, tau: 45}
caps: {NEGCASH: 40, SSMISS: 45, DEBTSTOP: 50, LOCFULL: 60, persistence_months: 2}
feed_silent_ratio: 0.6
min: {coverage: 0.5, months_score: 3, months_regime: 7}
regime: {slope_threshold: 1.0, z_threshold: 2.0, hysteresis_months: 2}
lead: {weights: {buffer_trend: 0.35, inflow_cv: 0.25, feeint: 0.15, ap_overdue: 0.15, ar_late: 0.10}, k3: 3, k6: 5, alert_threshold: 1.5}
confidence: {hist: [[6, 0.45], [12, 0.75], [18, 0.9]], quality_penalty: 0.8}
bands: {solid: 80, healthy: 60, watch: 40}
quantile_anchors: {}           # tabla p05/p25/p50/p75/p95 por señal Q, generada una vez
```

Todo cambio de parámetro lleva `params_version` en la salida y pasa por
`evaluate.py` con la regla de §3.

### 7.13 Salida mínima por grupo y mes (base del contrato con la API)

Independiente de cómo se serialice (§4.6), cada fila de grupo × mes tiene que
llevar: `score`, `level`, `penalty`, `cap` y `cap_code`, `band`, `regime`,
`direction`, `slope_6m`, `outlook_3m` y `outlook_6m` con sus bandas, `lead`,
`alert` (señal, valor, texto), `confidence`, `branch`, `coverage`,
`strength_flags`, los cinco `P̃_k` con su contribución, las señales con valor
crudo, puntos, disponibilidad y contribución, y los drivers del mes y del Δ.
Con eso, la UI de XR-030/XR-031 pinta todo lo que hoy pinta con el mock sin
inventar nada, y XR-020 solo traduce nombres.

### 7.14 Orden de implementación de v2

1. Techos con condición de actividad y régimen con histéresis (§7.5.6, §7.6):
   es lo que distingue bache de caída, el requisito central del brief.
2. Recalibración Q de C3 y C4 y anclas Q congeladas (§7.10): cierra M4.
3. Índice de adelanto, outlook y alerta (§7.7): es el «anticipa» del brief y se
   mide con M1.
4. Drivers por señal con identidad exacta y narrativa (§7.8).
5. Señales [v2] por orden de evidencia: L4, L2, P3, C2, D2, A5 (con el
   emparejamiento intercompany), después C5, C6, D5, D6, A4, P6, cada una con
   `evaluate.py` y la regla de §3.
6. Grupo con dispersión y filial más débil (§7.11) y salida de §7.13.
