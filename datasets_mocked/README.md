# `datasets_mocked/` — dataset mock del motor X-Ray (`data_kind: "mock"`)

Salida completa y determinista del motor X-Ray para las **1.286 empresas y 250 grupos
reales** durante los **24 meses** de 2024-09 … 2026-08: score, pilares, 28 señales,
drivers, régimen, outlook, alertas, narrativas, grupos y frames.

No son «datos de relleno»: son **el contrato de datos** entre el motor y la UI. Mismas
tablas, mismas columnas, mismas invariantes que producirá el motor real
(`docs/alfonso/ENGINE-EMBAT.md` §11.2). Si la UI funciona sobre esto, funcionará sobre el
motor.

> **Todo lo que hay aquí lleva `data_kind: "mock"` en los dos `manifest.json`.** Mientras
> la API sirva este directorio, la UI debe mostrar el banner «Datos simulados (mock v1)».

---

## 1. Qué es real y qué es sintético

| Campo | Origen | Detalle |
|---|---|---|
| `company_id`, `group_id`, pertenencia al grupo | **REAL** | `datasets/companies.csv` |
| `country` (ISO-2), `currency`, `erp`, `created_at` | **REAL** | país normalizado (ENGINE §1.5) |
| `first_activity`, `last_activity`, `months_hist` | **REAL** | `min`/`max` de `transactions.date` en la ventana |
| Ventana activa de cada empresa (qué meses existen) | **REAL** | el spine arranca en `first_activity`, no en `created_at` |
| `n_transactions`, `n_invoices`, `n_banking_products`, `n_debt_products` | **REAL** | recuentos del dataset |
| `has_invoices`, `has_debt`, `has_debt_repayment`, `has_lineofcredit`, `has_ss`, `has_salary`, `has_tax`, `has_invest`, `has_intercompany` | **REAL** | cobertura observada; P4-P6 exigen ≥ 3 apariciones (ENGINE §4.2) |
| `branch` (`full` / `no_debt` / `no_invoices` / `no_invoices_no_debt`) | **REAL** | derivada de la cobertura (ENGINE §4.7) |
| `op_in_12m`, `op_in_12m_eur` | **REAL** | cobros operativos TTM; a EUR con la tabla FX **constante** de ENGINE §3.3 |
| SHA-256 de los CSV de origen | **REAL** | en `manifest.json`, para trazar el mock a sus fuentes |
| `name` de empresa y grupo | sintético | legible y determinista por `crc32(id)`; **nunca sustituye al id** |
| `cash_quality` | sintético | prior real del 6,5 % `low` |
| `score`, `level`, `penalty`, pilares, las 28 `u` y sus valores crudos | sintético | modelo de §3 |
| `cap_code`, `regime`, `outlook`, `confidence`, `drivers`, `alerts` | **derivado** | calculado con `xray_mock/core.py`, nunca escrito a mano |
| `headline`, `body`, `watch_next` | sintético | plantilla determinista (sin LLM), citando siempre `value_fmt` |

---

## 2. Cómo se regenera

```bash
.venv/bin/python datasets_mocked/generate_mock.py \
    --seed 42 --data-dir datasets --out datasets_mocked \
    --inventory app/exports/v1 --now 2026-09-19T00:00:00+00:00
```

Con `--limit N` se generan las primeras N empresas por `company_id` ascendente y sus
grupos (útil para fixtures: `--limit 10 --seed 7`). Tarda **~40 s** para el universo
completo y deja `datasets_mocked/` en unos **212 MB**, de los que 81 MB son
`signals.csv` y 80 MB `exports/v1/results/`.

`--now` es lo **único** que fija `generated_at`: no se llama a `datetime.now()` en ningún
sitio. La primera ejecución cachea los hechos reales en `datasets_mocked/.cache/*.parquet`
(gitignored, con los hashes de origen en la clave: si `datasets/` cambia, se regenera).

**Determinismo duro.** Dos ejecuciones con el mismo `--seed` y el mismo `--now` producen
todos los ficheros byte a byte iguales:

```bash
python datasets_mocked/generate_mock.py --seed 42 --now 2026-09-19T00:00:00+00:00 --limit 50 --out /tmp/a
python datasets_mocked/generate_mock.py --seed 42 --now 2026-09-19T00:00:00+00:00 --limit 50 --out /tmp/b
diff -r /tmp/a /tmp/b   # sin salida
```

Lo que lo garantiza: un `numpy.random.Generator` por empresa derivado de
`(seed, zlib.crc32(company_id))` — nunca el `hash()` de Python, que cambia entre
ejecuciones —, orden de filas siempre explícito, floats escritos con 12 cifras
significativas y JSON con `sort_keys=True` y separadores fijos.

---

## 3. El modelo generador (resumen)

El orden importa: **el score objetivo se genera primero y los pilares y señales se derivan
para reproducirlo por la fórmula**, nunca al revés.

1. **Nivel latente** por empresa `μ ~ N(62, 13)` recortado a [30, 92]; con p = 0,50 un
   escalón `±U(6, 18)`, con p = 0,25 una tendencia `±U(0,4, 1,0)` pts/mes, con p = 0,15 un
   bache `−U(8, 20)` que revierte en 1-2 meses, y ruido `N(0, 2)` con AR(1) 0,3.
2. **Pilares y señales** alrededor de ese objetivo (dispersión 0,08 con correlación 0,2
   entre pilares, 0,06 entre señales, todas con persistencia AR(1) 0,7). Un
   **desplazamiento común ajustado por bisección** hace que
   `core.level(...) − core.penalty(...)` caiga a menos de 0,4 puntos del objetivo.
3. **Valor crudo** = inversa exacta de la normalización: `core.normalize_anchor(value,
   anchors) == u` y `core.orient(core.normalize_percentile(value, cuts), dir) == u` con
   error < 1e-10. Los cortes de percentil están congelados en `manifest.json`.
4. **Eventos duros**: `NEGCASH` ~4 % de las empresas (2-4 meses), `SSMISS` 2 %,
   `DEBTSTOP` 2 % (solo con amortizaciones), `LOCFULL` ~8 % de las que tienen línea. Se
   inyectan **bajando la señal** (L3, P4, D2, D1) y `core.caps` los detecta: el `cap_code`
   no se escribe nunca a mano.
5. **Referencia del universo**: `u_ref` de cada señal = mediana del universo fuera de
   warm-up, calculada en una primera pasada y **congelada** antes de calcular ninguna
   contribución. `base` es la parte del score que explica la empresa mediana.
6. **Todo lo demás** (`effective_weights`, `pillar_score`, `level`, `penalty`, `caps`,
   `band`, `contributions`, `delta_decomposition`, `theil_sen`, `z_own`, `breadth`, `run`,
   `cusum`, `level_shift`, `regime`, `outlook`, `confidence`, `alerts_policy`) sale de
   `xray_mock/core.py`, que implementa ENGINE §5-§8.

**Casos fijados** para la demo (la forma se nota en el score, no es un matiz):

| Forma | Empresas | Qué se ve |
|---|---|---|
| Subida sostenida | `COMP_0108`, `COMP_1061`, `COMP_0866` | 37 → 61 en 24 meses |
| Caída por escalón | `COMP_0519`, `COMP_0766` | −16 puntos en un mes |
| Caída gradual | `COMP_1015`, `COMP_0651` | 88 → 64 |
| Bache que revierte | `COMP_0099`, `COMP_1022` | 69 → 53 → 69 |
| Tensión de caja | `COMP_1267` | P1/P2 se deterioran mientras C1/C4 mejoran |
| Caída de caja en un mes | `COMP_0905`, `COMP_1250` | techo `NEGCASH`, score a 40 |
| Desapalancamiento sano | `COMP_0354` | `strength_flags = DELEVERAGING` |
| Excepcionalmente sólida | `COMP_0016` | 88, banda `solid` todo el periodo |

---

## 4. Qué hay en el directorio

```
manifest.json          seed, versiones, hashes de origen, recuentos, u_ref y cortes congelados
signal_catalog.csv     las 28 señales que puntúan + A6 (que no puntúa)
companies.csv          1.286 · metadatos reales + cobertura + rama + cash_quality
groups.csv             250 · metadatos reales + n_companies + moneda de consolidación
score_timeline.csv     22.235 empresa-mes · pilares, pesos, nivel, techo, banda, régimen, outlook
group_timeline.csv     4.307 grupo-mes · score consolidado, dispersión, filial más débil
signals.csv            438.701 filas · empresa × mes × señal DISPONIBLE (valor, u, peso, contribución)
drivers.csv            119.566 filas · top-5 por |contribución| + PENALTY + CAP
alerts.csv             638 · severidad, mes detectado, mes evidente, lead time, estado
narratives.csv         22.235 · headline / body / watch_next por empresa-mes
frames/YYYY-MM.json    24 · estado del universo ese mes (lo que carga el replay de golpe)
exports/v1/            contrato dashboard-v1 + extensión `xray`
  manifest.json          data_kind: "mock"
  companies.json         inventario REAL de Dani, filtrado a las entidades generadas
  groups.json            idem
  companies/*.json       1.286 · COPIADOS tal cual del inventario, no se regeneran
  results/COMP_*.json    1.286 · resultado por empresa
  results/GROUP_*.json   250 · resultado por grupo
```

Las columnas son exactamente las de `plans/00-reference/mock-data-contract.md` §2.1-§2.10.

---

## 5. Invariantes garantizadas

El generador las cumple en la salida completa con **tolerancia 1e-6** (medido: ≤ 1,4e-10):

1. `score = clip(level, 0, cap)` y `level = 100·Σ w_k^eff·P_k − penalty`.
2. `Σ contribution_i + base − penalty − cap_adj = score` por empresa-mes, con
   `cap_adj = level − score`; y `Σ weight_i = 1` sobre las señales disponibles.
3. `delta_1m = score_t − score_{t−1}` y
   `Σ delta_vs_prev_i + ΔPenalty + ΔCap = delta_1m`.
4. `outlook_low ≤ outlook_6m ≤ outlook_high`.
5. `band` coherente con `score` (solid ≥ 80, healthy 60-79, watch 40-59, stress < 40), en
   empresa y en grupo.
6. Las señales de factura **no existen** para las empresas sin facturas (fila ausente, no
   fila con `u = 0`): ningún `u` imputado.
7. `warmup = true` ⇔ `month_index ≤ 3` ⇔ `regime = "warmup"`; **sin alertas en warm-up** ni
   con `confidence < 0,5`.
8. `regime` dentro del dominio cerrado de ENGINE §6.2; ≤ 5 % de las empresas **activas ese
   mes** con alerta de deterioro y ≤ 2 % de mejora; cool-down de 3 meses por empresa y causa.
9. Un grupo tiene `score` solo si al menos una filial lo tiene; `weakest_company` es la de
   menor score y `dispersion = max − min`.
10. `frames/YYYY-MM.json` contiene **exactamente** las empresas activas ese mes.
11. `core.normalize_*(value) == u` para las 438.701 filas (la inversa es exacta).
12. `headline ≤ 70` caracteres, una narrativa por empresa-mes, `guardrail_passed = true`.

---

## 6. Apuntar la API a este mock

```bash
EXPORTS_DIR=$(pwd)/datasets_mocked/exports/v1 corepack pnpm --filter api dev
```

Con eso `/api/v1/*` sirve el inventario real copiado más los `results/*.json` del mock, y
`/api/v2/*` (cuando exista) lee las tablas de `datasets_mocked/`. Ojo con el puerto 8787:
si ya hay una API escuchando con otro `EXPORTS_DIR`, hay que pararla antes.

---

## 7. Decisiones y desviaciones

- **Precisión de escritura: 12 cifras significativas, no 6 decimales.** Con 6 decimales,
  `Σ 100·w·P` sobre cinco pilares acumula ~1e-4 de error y las invariantes del contrato
  (tolerancia 1e-6) **no se pueden comprobar sobre lo escrito**; el caso peor es D4, cuya
  unidad vive en [0, 0,08] y pierde la inversa de la normalización. `%.12g` es igual de
  determinista, deja el error en ~1e-10 y escribe corto los números redondos (`0.5`).
- **CSV, no Parquet.** `signals.csv` son 438.701 filas y 81 MB. `*.parquet` está en
  `.gitignore` y el loader de la API lee CSV.
- **`regime = "warmup"` dura hasta `month_index = 3`**, no hasta el 7 de ENGINE §6.2:
  el contrato exige `regime = warmup ⇔ warmup = true` y `warmup` es `month_index ≤ 3`. Se
  le pasa `warmup_until = 3` a `core.regime`, que con su histéresis de dos meses hace que
  el régimen real empiece en el mes 4. Los meses 4-6 salen `stable`: sin seis meses de
  historia no hay `z_own` ni `level_shift` y ninguna regla de §6.2 puede dispararse.
- **P4 y D2 no se muestrean: se derivan de su historia de pagos.** Son señales de
  *regularidad*, y son las que alimentan los techos `SSMISS` y `DEBTSTOP`. Si el `u` saliera
  del modelo y la historia de pagos fuera aparte, el techo y la señal se contradirían. La
  serie «hubo pago» es sintética (todos los meses salvo el evento inyectado y, con p = 0,35,
  un mes suelto que nunca dispara un techo): usar la real de `transactions` dispararía
  muchos más `SSMISS`/`DEBTSTOP` que el 2 % que fija el plan.
- **L5 (`colchón invertido`) es 0 en las empresas sin productos de inversión**, que es un
  hecho real (`has_invest`): si no, la `strength_flag` `SAVINGS` se encendería en todas.
- **El presupuesto de alertas se aplica sobre las empresas activas de cada mes**, no sobre
  el total del universo: en 2024-09 hay menos de la mitad de las empresas vivas, y el 5 %
  del total sería un 10 % de la cartera real de ese mes.
- **Cortes de percentil**: se congelan como la distribución plausible declarada de cada
  unidad (`simulate.PERCENTILE_SCALES`, rejilla uniforme de 21 puntos) y se guardan en
  `manifest.json`. No se estiman sobre los valores generados porque el objeto primario es
  `u`: invertir los mismos cortes con los que se normaliza es lo único que hace exacto el
  round-trip `value → u`, que es lo que la UI y los tests pueden comprobar.
- **`months[].contributions`** va en cada mes (dashboard-v1 literal) y además duplicado en
  la raíz para el mes de corte, que es lo que pinta la ficha sin recorrer 24 meses. Es el
  85 % del tamaño de `exports/v1/results/` (80 MB): si hace falta adelgazar el repo, ése es
  el sitio.
- **Nada de FX fila a fila**: la consolidación de grupo usa la tabla constante de
  ENGINE §3.3 (`real_inputs.FX_TO_EUR`).
- **Nada de LLM**: las narrativas son plantillas. El `value_fmt` que citan es exactamente
  el placeholder que ENGINE §7.3 le pasará al modelo real, así que el guardarrail se puede
  probar contra estos datos.

### Aviso de ENGINE §1.5: la liquidez no reconcilia

`balances.csv` **no cuadra** con `transactions.csv` (el error crece hacia 2024 y el 6,5 %
de las cuentas abre en negativo). **El mock no reconstruye la caja.** Los valores crudos de
las señales de liquidez (`L1` días de colchón, `L2` caja mínima sobre salidas, `L3` días en
negativo, `L4` runway) son **coherentes con su `u`** —salen de invertir las anclas— pero
**no son saldos reales ni derivados de los saldos reales**. Sirven para leer nivel relativo
y cambios, que es exactamente para lo que ENGINE §1.5 autoriza a usarlos; no sirven para
cuadrar un extracto bancario.
