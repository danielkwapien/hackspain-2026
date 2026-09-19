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
  scoring.py          baseline estático (de Dani)    — funciones puras
  pipeline.py         baseline estático              — foto a 2026-09-01, por sociedad
  scoring_embat.py    motor temporal                 — funciones puras
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
