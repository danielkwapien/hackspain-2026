# X-Ray Engine — Diseño del motor de score, señales y backend

**Reto:** Embat · HackSpain 2026 · «¿Puede el dinero decir cómo está una empresa?»
**Fecha:** 18 de septiembre de 2026 · **Estado:** propuesta de diseño v1, previa a implementación
**Repositorio de trabajo:** `danielkwapien/hackspain-2026` · **Este documento no se sube al repo.**

---

## 0. Cómo leer este informe

### 0.1 Qué es

El diseño completo del **motor de salud financiera** que pide el brief (transcrito en `PROBLEM.md` §2): qué señales se calculan y cómo, cómo se combinan en un score 0–100, cómo se lee la trayectoria, cómo se explica cada número, cómo avisa el monitor, cómo se mide la anticipación, cómo se valida sin etiqueta y sobre qué backend se sirve a una interfaz tipo Trade Republic. Está pensado para que cualquier persona o agente del equipo pueda implementarlo sin volver a investigar.

### 0.2 En qué se basa

Tres capas de evidencia, en orden de autoridad:

1. **El brief oficial** (`PROBLEM.md` §2) y el dataset real (`datasets/`, 8 CSV + diccionario, entregado el 18/09/2026).
2. **Seis análisis forenses ejecutados sobre el dataset** (agentes A–F, scripts y paneles reproducibles en `~/Developer/embat-analysis/analysis/`). Todo número de este informe marcado **[D]** sale de ahí.
3. **Seis investigaciones bibliográficas y de mercado** (estado del arte en cash-flow scoring, metodología de scorecards e índices compuestos, detección de régimen y early warning, semántica de analista de crédito, ingeniería de targets sin etiqueta, arquitectura de backend). Lo marcado **[V]** está verificado con fuente; **[C]** es criterio de dominio; **[H]** es decisión o hipótesis de diseño propia.

Cuando la literatura y el dataset discrepan, **manda el dataset**: varias señales «canónicas» (cuotas impagadas del cuadro de amortización, muro de vencimientos, estacionalidad) no existen o son artefactos en estos datos, y se descartan aunque la teoría las recomiende.

### 0.3 Resumen ejecutivo: las diez decisiones

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Score compuesto determinista por construcción, sin modelo supervisado como núcleo.** | No hay etiqueta [D]. Embat premia determinismo y explicabilidad [V]. Un índice aditivo en puntos permite descomponer exactamente «qué se movió» sin SHAP [V]. |
| 2 | **Vector de salida, no un número:** `score` (nivel), `regime` (stable / improving / deteriorating / blip / recovering), `outlook` (banda a 3 y 6 meses), `drivers`, `confidence`, `alerts`. | El brief pide trayectoria y explicación; las agencias de rating separan nivel y *outlook* [V]; en los datos, dos tercios de la varianza es nivel fijo y el resto son escalones, no rampas [D]. |
| 3 | **La unidad temporal útil es la ventana de 3–6 meses, no el mes.** Todas las señales se calculan sobre ventanas móviles; el mes crudo es ruido (autocorrelación 0,06–0,28) [D]. | Evita un score que parpadea y hace defendible «bache o caída». |
| 4 | **Detección de cambio de nivel (change-point) por encima de la pendiente.** | 4 de cada 5 saltos grandes persisten; la mediana de breakpoints por empresa es 1 [D]. La pendiente equiponderada no aporta poder predictivo sobre el nivel [D]. |
| 5 | **Cinco pilares con pesos desiguales y agregación no compensatoria** (penalización del pilar más débil + *hard caps* por eventos duros). | Evidencia: comportamiento de pago y utilización de líneas son las señales mejor cuantificadas [V]; una deuda impagada no debe compensarse con caja [V]. |
| 6 | **Dos ramas de cobertura:** con facturas (785 empresas) y solo con movimientos (501). Los pesos se renormalizan y la confianza baja; nunca se imputa cero. | El 39 % del universo no tiene facturas y eso correlaciona con no tener ERP, no con salud [D]. |
| 7 | **Point-in-time estricto:** todo se calcula «as-of» fin de mes; el `status` de factura y el `payment_date` se recalculan; los primeros meses de cada empresa se marcan como warm-up. | `payment_date` está rellena en facturas no pagadas [D]; el DSO sube de 1 a 30 días por censura de ventana [D]. |
| 8 | **Anticipación medida contra eventos duros definidos antes de mirar el score**, con lead time en meses y curva alertas/precisión. Expectativa honesta: el adelanto medible será modesto. | El catálogo actual anticipa deterioro con AUC ≤ 0,58 a seis meses [D]; hay que decirlo y enseñar la curva, no inflar. |
| 9 | **Backend Python determinista (DuckDB + FastAPI) que exporta un artefacto precalculado**; el «tiempo real» es un replay con reloj en cliente y SSE para alertas; LLM solo para redactar con placeholders. | 30.864 filas de salida se regeneran en segundos; Embat habla Python y castiga que el LLM calcule [V]. |
| 10 | **Grupo y empresa se puntúan los dos**, con intercompany neteado por transferencias espejo y una señal explícita de dependencia intragrupo. | El test oculto son 60–80 «empresas» de 250 = grupos [H]; el intercompany es real y detectable por importe/fecha (25,9 % de las transferencias, 0,2 % en placebo) [D]. |

---

## 1. Lo que dicen los datos: hechos que fijan el diseño

Síntesis de los seis análisis forenses. Cada fila cambia una decisión concreta.

### 1.1 Forma del dataset

| Hecho [D] | Consecuencia de diseño |
|---|---|
| 8 CSV + diccionario. **No hay fichero ni columna de resultado, etiqueta ni split.** | Score no supervisado; validación por eventos proxy (§10). |
| `groups.n_companies_in_sample` coincide al 100 % con el conteo real; IDs correlativos sin huecos; sin patrón de test. | El test oculto no es inferible. Se puntúa todo el universo y Embat compara su 60–80. |
| **Historia real corta:** mediana 18 meses con movimientos; 373 empresas (29 %) con 24; 377 (29 %) con < 12. Empresas activas: 439 en 2024-09 → 1.229 en 2026-04. | Ventanas adaptativas, `confidence` explícita por historia, nunca comparar niveles agregados entre meses. |
| **2026-09 es un solo día** (9.242 movimientos). Último mes completo: **2026-08**. | Ventana de análisis: 2024-09 … 2026-08 (24 meses). |
| 789 empresas tienen movimientos **antes** de `created_at` (backfill mediano 39–53 días). | `created_at` no acota nada; el arranque real es `min(date)`. |
| **501 empresas (39 %) sin facturas**; 463 de ellas sin ERP. Solo 908 sin deuda; 378 con productos de deuda; 525 con `debt_repayment`. | Dos ramas de cobertura (§4.7). |
| `country` vacío en 82 %; 89 % de empresas en EUR pero el **55 % del volumen nominal** es COP/AOA/CLP por inflación de unidad. | FX obligatorio y constante por divisa (§3.3); país no se usa como señal. |
| Outliers: 0,25 % de filas = 75 % del importe absoluto; 20 movimientos > 1.000 M; una empresa con 100.000 M de caja reconstruida y cero cobros. | Winsorizar dentro de cada mes y escalar todo por la propia empresa. |

### 1.2 Signos y semántica (verificados)

| Campo | Regla [D] |
|---|---|
| `transactions.amount` | < 0 salida, > 0 entrada. Signo limpio por categoría salvo `-`, `transfer`, `payment_refund`. |
| `invoices.amount` | **> 0 emitida (cliente nos paga), < 0 recibida (pagamos a proveedor)**. 96,7–97,6 % de coincidencia cruzando contrapartes con el banco. `pending_amount` sigue el signo. |
| `invoices.payment_date` | **Solo informativa si `status = 'paid'`**. En `overdue`/`pending` es igual a `due_date` (96–100 %). Usarla sin filtrar da mora ≈ 0 por construcción. |
| `invoices.status` | Congelado a 2026-09-01. Esconde 122.006 facturas a proveedor pagadas tarde que figuran `paid`. Hay que recalcular «as-of». |
| `invoices.document_type` | Universo de DSO/DPO: **solo `invoice`** (84,7 %). `paymentDocument` duplica facturas (67,6 %); `note`/`refund` son abonos; `invoiceGroup` son remesas. |
| `debt_products.granted/outstanding` | **Negativos**. `facility = abs(granted)`, `drawn = max(−outstanding, 0)`. `liquidity = outstanding − granted` (exacto en líneas, confirming, factoring). |
| `balances` | Foto a 2026-09-01. Incluye la deuda (2.207 productos). `available` 100 % nulo. `granted` cuadra con `debt_products` en el 99 %. |
| `debt_schedule_config` | 87 filas, 40 empresas. `last_payment_date` es un timestamp de sincronización, **no vencimiento**. Las cuotas calculadas cuadran en importe (78 %) pero **no en fecha** (26 %). |
| `exchange_rate` en movimientos | Metadato de conversión a moneda contable; `amount` ya está en la moneda del producto. No aplicar en la reconstrucción de saldos. |
| `counterparty_id` | Espacio compartido entre facturas y movimientos (88 %), pero **cada contraparte pertenece a una sola empresa**: no identifica intercompany ni sectores. |

### 1.3 Estructura del generador

| Hecho [D] | Consecuencia |
|---|---|
| Sin factor común dominante: PC1 = 17,5 % y es tamaño; el comportamiento de pago es casi ortogonal al flujo de caja. | Los pilares son realmente distintos; la agregación importa. |
| ICC entre empresas del composite = 0,65 (nivel permanente); autocorrelación mensual 0,28; señales individuales 0,06–0,28. | Nivel ≫ pendiente. Ventanas de 3–6 meses. |
| PELT: 0 breaks 39 %, 1 break 50 %, 2 breaks 11 %. Saltos > 3σ: 14,5 % de empresas, y **el 79 % persiste**. | Change-point como componente central de régimen. |
| Pendientes por empresa: continuo unimodal, colas gruesas; 38 % con tendencia significativa (21 % deterioro, 17 % mejora). | Sin arquetipos discretos; el ligero sesgo al deterioro es real. |
| Grupo: ICC de nivel 0,35, de pendiente 0,23; filiales correlacionan +0,12 (placebo +0,01). | Consolidar reduce ruido pero no sustituye a la empresa. |
| **Warm-up:** el retraso de cobro empieza en 0 para toda empresa y sube con la antigüedad de la serie; el DSO mediano va de 1 a 30 días por censura por la izquierda. | Descartar los primeros 3–6 meses de cada empresa para señales de factura, o normalizar por antigüedad; el z-score por mes calendario **no** lo corrige. |
| Sin estacionalidad limpia explotable (panel desbalanceado por onboarding). | No descomponer estacionalidad; usar comparaciones intra-empresa y cross-section por mes. |
| El nivel de cash flow operativo está construido en equilibrio (ratio mediano cobros/pagos 0,94; mediana de flujo neto −30 €). | La señal está en trayectoria, volatilidad y regularidad, no en el nivel de flujo. |

### 1.4 Movimientos de caja

| Hecho [D] | Consecuencia |
|---|---|
| Categoría `-`: 24,9 % de filas, 30 % del importe; reclasificar por palabras clave **no funciona** (validado out-of-sample). Solo `social_security` (97,5 %), efectivo (93 %) y `fee` (85 %) son fiables. | `-` va a columnas propias `unclassified_in/out`; solo se usa en señales de regularidad. |
| Inflow bruto: 34,7 % `transfer` + 33 % sin categoría + 32 % cobros operativos. | El flujo operativo identificado es un tercio del total; escalar por la propia empresa. |
| Transferencias internas **no netean** por empresa (mediana 0,83). **Intercompany real** por espejo (importe opuesto al céntimo, ±2 días, mismo grupo): 25,9 % de las transferencias salientes, 0,2 % en placebo. Doble conteo mediano 2 % del inflow, p90 48 %. | Netear intercompany por espejo antes de cualquier agregado de grupo; señal de dependencia intragrupo. |
| No hay financiación nueva observable en movimientos (0,05 %). `lineofcredit` se comporta como cuenta operativa. | La deuda solo se ve en `debt_products` (foto) y en `debt_repayment`/`interest_charge`. |
| Seguridad Social: ratio de regularidad mediano 1,0; impuestos con patrón trimestral confirmado (71 % en el primer mes de trimestre); nómina irregular en importe (CV 0,44), útil como presencia. | Regularidad de SS y de nómina como señales; impuestos se evalúan por trimestre. |
| `interest_charge` ×2 interanual, pero en parte por onboarding; el tipo implícito es un orden de magnitud inferior al nominal. | Coste de financiación solo como ratio intra-empresa y trayectoria. |

### 1.5 Deuda y liquidez

| Hecho [D] | Consecuencia |
|---|---|
| Utilización de líneas **bimodal**: 187 a cero, 111 (24 %) ≥ 90 %; 7 con `granted` residual y utilización absurda. Solo hay **foto**, no serie. | Utilización = señal de **nivel** en el último tramo; winsorizar a [0,1]; `granted` nulo/cero = missing. |
| **No hay cuadro de amortización fiable ni vencimientos.** | Descartar «cuota impagada» y «muro de vencimientos». Sustituir por **regularidad de `debt_repayment`** (525 empresas, 113 con ≥ 20 meses). |
| Reconstrucción de saldos: viable (`opening = balance − Σ tx ≤ snapshot`), aperturas plausibles (p50 7.343 €), pero 6,5 % de cuentas abren < −1.000 € y el error crece hacia 2024. La caja mediana es plana; el % de empresas-día en negativo baja de 10,2 % a 5,4 %. | Saldo reconstruido solo para **nivel relativo y cambios**; ventanas trailing; test de robustez con `opening = 0`. Runway con cola infinita: capar. |
| Deuda no bancaria (socio / in-house): 236 productos, 50 empresas, 10 % del dispuesto. | Señal propia de fragilidad de financiación. |
| Desapalancar no es mejorar: hay empresas que cancelan la línea y acaban con caja negativa. | Δutilización siempre combinada con Δcaja. |

### 1.6 Validez de las señales frente a eventos proxy

Del análisis F (15 señales, 11 eventos deterministas, targets a 1/3/6 meses, GroupKFold por grupo):

- **Coincidentes, no anticipadores:** runway (AUC 0,83 en el mes del evento, 0,58 a 6 meses) y caja (0,70 → 0,48).
- **Con perfil de adelanto (AUC plana o creciente con el horizonte):** volatilidad de cobros `inflow_cv` (0,55), peso de comisiones e intereses `feeint_share` (0,53), mora en pagables `pay_ovd` (0,53), retraso de cobro `recv_dayslate` (0,57 en el target estricto).
- **El composite equiponderado no predice** (AUC out-of-fold 0,44–0,53) y **la pendiente no aporta sobre el nivel**. Con eventos definidos por cambio, la reversión a la media domina.
- **Los eventos se agrupan en el tiempo**: interrupción de cuotas y falta de pago fiscal son puntuales (73 % y 63 % de rachas de un mes); runway bajo y mora de clientes son estados (rachas medias 5,0 y 2,1). Esto sostiene «bache o caída».
- **Anticipación medible con el catálogo actual:** mediana de 3 meses de adelanto, pero solo en 53 de 950 empresas con evento duro (el 77 % tiene el evento en sus primeros 6 meses observados) y con falsa alarma 0,17 frente a una base de 0,19.

Lectura: el nivel está bien resuelto; la anticipación es el frente donde hay que ganar con pesos desiguales, change-point y eventos duros bien definidos, y donde hay que ser honesto en el pitch.

---

## 2. Principios de diseño

1. **Determinismo primero.** Cada número sale de una fórmula con parámetros versionados. El LLM redacta, no calcula [V, blog técnico de Embat].
2. **Aditividad para explicar.** El score es una suma de contribuciones por señal más términos de penalización nombrados; `Δscore` se descompone exactamente en `Δcontribuciones` [V].
3. **No compensatorio donde importa.** Un pilar muy débil penaliza más que lo que suma un pilar fuerte; ciertos eventos duros ponen un techo al score.
4. **Nivel y trayectoria por separado.** `score` es nivel suavizado; `regime` y `outlook` llevan la dirección. Nunca se funden en un solo número (convención rating + outlook) [V].
5. **Point-in-time.** Ninguna señal del mes M usa datos con fecha > fin de M. Normalizaciones cross-section por mes o trailing por empresa; nunca sobre los 24 meses completos [V, D].
6. **Escala propia.** Toda magnitud se expresa como ratio sobre la propia actividad de la empresa (salidas operativas medias, cobros medios), nunca en euros absolutos [D].
7. **Ausencia ≠ cero.** Una señal no disponible se excluye y renormaliza el peso; la `confidence` baja [V, D].
8. **Simetría con asimetría medida.** Mejora y deterioro usan las mismas señales, pero los umbrales de régimen son más sensibles al deterioro (momentum documentado en ratings) [V].
9. **Auditable y reversible.** Cada corrida guarda parámetros, hash de entradas y versión; cambiar un peso crea una versión nueva y las dos conviven.
10. **Simple para el jurado.** Entre 12 y 18 señales, cada una explicable en una frase a un CFO. Lo que no se puede explicar, no entra.

---

## 3. Preparación de datos

### 3.1 Spine y ventana

- Ventana: **2024-09 … 2026-08** (24 meses). 2026-09 se descarta (un día).
- Spine `company × month` desde `first_activity = min(transactions.date)` de cada empresa (no desde `created_at`).
- `month_index` = orden del mes dentro de la empresa; `months_hist` = meses desde `first_activity`.
- **Warm-up:** `month_index ≤ 3` → todas las señales se calculan pero el score se marca `warmup = true` y no genera alertas. Para señales de factura (DSO, mora), el warm-up es de **6 meses** por la censura documentada [D].

### 3.2 Universo de facturas y estado as-of

```sql
-- universo
document_type = 'invoice' AND status <> 'cancel'
AND due_date BETWEEN '2024-01-01' AND '2027-12-31'
-- dirección
dir = CASE WHEN amount > 0 THEN 'AR' ELSE 'AP' END
-- estado a cierre E
paid_asof   = status = 'paid' AND payment_date <= E
open_asof   = issuance_date <= E AND NOT paid_asof
overdue_asof= open_asof AND due_date < E
days_late   = datediff('day', due_date, payment_date)   -- SOLO si status='paid'
```

Pagos parciales (0,78 %) se ignoran: binario pagada/no pagada. Abonos (`note`, `refund`) se agregan aparte como `credit_note_amount` por dirección.

### 3.3 Unidad monetaria

- **Señales intra-empresa:** moneda contable de la empresa. Facturas: `amount_acc = amount / exchange_rate` cuando `currency ≠ accounting_currency` y el rate está en (0,001, 10.000); si no, `amount`. Movimientos: `amount` tal cual (ya está en la moneda del producto). Como todo son ratios dentro de la empresa, no hace falta EUR.
- **Consolidación de grupo (16,8 % de grupos multidivisa):** tabla `fx(currency → EUR)` constante = mediana de `exchange_rate` observada en movimientos de productos de esa divisa (USD 1,16, GBP 0,84, MXN 20,8, CLP 1.048, COP 4.272…). Documentada como supuesto visible; neutra en trayectoria.

### 3.4 Flujos: taxonomía fija

| Clase | Categorías | Uso |
|---|---|---|
| `op_in` | collection, bulk_collection, pos_settlement, cash_settlement(s), payment_refund, tax_refund | Cobros operativos |
| `op_out` | payment, bulk_payment, utility, salary, tax, social_security, collection_refund | Pagos operativos |
| `fin_out` | debt_repayment, interest_charge, fee | Servicio y coste de financiación (desglosado) |
| `inv` | investment_deployment (−), investment_return (+) | Inversión |
| `internal` | transfer, cash_withdrawal, pos_withdrawal | Excluido de flujos; base del neteo intercompany |
| `unclassified` | `-`, nulo | Columnas propias; solo para regularidad (SS, efectivo, fee) |

Winsorización: por señal, percentiles 1/99 **dentro de cada mes** antes de normalizar.

### 3.5 Caja reconstruida

Por producto `checking`/`saving`/`investment`: `opening = balance_snapshot − Σ amount(date ≤ snapshot_date)`; `B(d) = opening + Σ amount(date ≤ d)`. Sin aplicar `exchange_rate`. Se usa **solo** para: saldo fin de mes, mínimo intramensual, días con caja agregada negativa, y sus ratios sobre salidas operativas. Dos controles obligatorios en el pipeline: (a) recomputar con `opening = 0` y comprobar que el ranking de trayectorias no cambia; (b) marcar `cash_quality = low` en empresas cuya apertura reconstruida es < −1.000 € o cuyo saldo supera 100× sus cobros anuales.

### 3.6 Intercompany

Emparejar `transfer` saliente en A con `transfer` entrante en B, mismo `group_id`, importe opuesto (< 0,01) y |Δfecha| ≤ 2 días. Los pares casados se etiquetan `intercompany = true`. Se usan para: (a) netear en agregados de grupo; (b) señal `intragroup_dependency = Σ entradas intercompany 6m / Σ (op_in + entradas intercompany) 6m` por empresa.

### 3.7 Panel de salida de esta fase

`signals_raw(company_id, month, signal, value, n_obs, window, is_available, quality_flag)` en formato largo. Los paneles ya construidos por los análisis (`B_panel`, `C_invoice_panel`, `D_liquidity_panel`, `E_cashflow_panel`, `F_signals_raw`) sirven como referencia de implementación y como test de regresión: el pipeline final debe reproducir sus columnas.

---

## 4. Catálogo definitivo de señales

Cinco pilares. Cada señal: id, definición exacta, ventana, orientación (↑ = mayor es más sano), normalización (§5.1), peso dentro del pilar, cobertura en el dataset y evidencia. Las ventanas son trailing e incluyen el mes actual.

### 4.1 Pilar L — Liquidez (peso 25)

| id | Señal | Definición | Ventana | ↑/↓ | Normalización | Peso | Cobertura [D] | Evidencia |
|---|---|---|---|---|---|---|---|---|
| L1 | `buffer_days` | `30 · cash_eom / mean(op_out, 3m)`; `cash_eom` = checking + saving a fin de mes (reconstruido) | 3m | ↑ | Anclas: ≤ 0 → 0; 10 d → 0,3; 27 d → 0,6; 60 d → 0,9; ≥ 120 d → 1 | 30 | 99 % | Mediana de pymes 27 días [V, JPMC]; «average/minimum balance» top predictor [V] |
| L2 | `cash_min_ratio` | `min diario de caja agregada en el mes / mean(op_out, 3m)` | 1m (mínimo) + 3m | ↑ | Percentil congelado | 20 | 99 % | Mínimo intramensual y cierres bajos: coeficiente más robusto de FinRegLab [V] |
| L3 | `neg_cash_days` | Días del mes con caja agregada < 0, media 3m | 3m | ↓ | Anclas: 0 → 1; 1–3 → 0,6; 4–9 → 0,3; ≥ 10 → 0 | 25 | 99 % (332 empresas con algún día) | Ídem; equivalente europeo de NSF [V] |
| L4 | `runway_months` | `(cash_eom + invest_eom) / mean(op_out, 3m)`, capado a [−3, 24] | 3m | ↑ | Anclas: ≤ 0 → 0; 0,5 → 0,25; 1 → 0,45; 3 → 0,8; ≥ 6 → 1 | 15 | 99 % | Coincidente fuerte (AUC 0,83 en t) [D]; sirve para nivel, no anticipa |
| L5 | `invest_presence` | `invest_eom / mean(op_out, 12m)` | 12m | ↑ | Anclas: 0 → 0,5 (neutral); > 1 → 1 | 10 | 82 empresas > 0 | Ahorro/inversión = exceso estructural [C] |

Descartadas: saldo absoluto (escala), `available` (vacío), `countable` (residual).

### 4.2 Pilar P — Disciplina de pago propia (peso 20)

| id | Señal | Definición | Ventana | ↑/↓ | Normalización | Peso | Cobertura | Evidencia |
|---|---|---|---|---|---|---|---|---|
| P1 | `ap_pct_paid_late` | Fracción de importe de facturas recibidas **pagadas** en la ventana con `days_late > 0` | 3m (≥ 5 facturas) | ↓ | Anclas: 0 → 1; 0,25 → 0,7; 0,5 → 0,4; 0,75 → 0,15; 1 → 0 | 30 | 440 empresas con datos suficientes | Rasgo estable de empresa, ICC 0,61 [D]; PAYDEX [V] |
| P2 | `ap_days_late_w` | Retraso propio ponderado por importe, facturas recibidas pagadas | 3m | ↓ | Anclas: ≤ 0 → 1; 7 → 0,8; 15 → 0,6; 30 → 0,3; ≥ 60 → 0 | 20 | 484 | Fallidas españolas: DPO +14 a +31 días [V, ECCBSO] |
| P3 | `ap_overdue_over_received_3m` | Importe de recibidas vivas y vencidas a cierre / importe recibido 3m | stock + 3m | ↓ | Percentil congelado | 15 | 573 | Versión no saturada del aging [D] |
| P4 | `ss_regularity` | Meses con `social_security` / meses activos | 6m | ↑ | Anclas: 1 → 1; 0,83 → 0,7; 0,67 → 0,4; ≤ 0,5 → 0 | 15 | 686 empresas con SS; en el resto **no se calcula** | Señal de regularidad más limpia (ratio mediano 1,0) [D]; impago a TGSS = red flag fuerte [C] |
| P5 | `tax_regularity` | Trimestres con `tax` en su primer mes / trimestres observados | 12m | ↑ | Anclas: 1 → 1; 0,75 → 0,6; 0,5 → 0,3; < 0,5 → 0 | 10 | 1.155 con `tax` | Patrón trimestral 71 % [D] |
| P6 | `salary_regularity` | Meses con `salary` / meses activos | 6m | ↑ | Anclas: ≥ 0,9 → 1; 0,75 → 0,6; 0,5 → 0,3; < 0,5 → 0 | 10 | 819 con nómina | Presencia > importe [D]; payroll regularity [V] |

Notas: P4–P6 solo se calculan si la empresa ha mostrado esa categoría al menos 3 veces en su historia (evita penalizar a quien no paga nómina por su banco). En la rama sin facturas, P se compone solo de P4–P6.

### 4.3 Pilar C — Cobros y clientes (peso 15)

| id | Señal | Definición | Ventana | ↑/↓ | Normalización | Peso | Cobertura | Evidencia |
|---|---|---|---|---|---|---|---|---|
| C1 | `ar_pct_paid_late` | Fracción de importe de emitidas cobradas con retraso > 0 | 3m (≥ 5) | ↓ | Anclas como P1 | 25 | 296 | ICC 0,64 [D] |
| C2 | `ar_days_late_w` | Mora de clientes ponderada (emitidas cobradas) | 3m | ↓ | Anclas: ≤ 0 → 1; 10 → 0,8; 20 → 0,6; 40 → 0,3; ≥ 80 → 0 | 15 | 296 | Colineal con DSO (0,87): se usa esta, no DSO [D] |
| C3 | `ar_overdue_over_issued_3m` | Emitidas vivas vencidas a cierre / emitido 3m | stock + 3m | ↓ | Percentil congelado | 20 | 466 | Aging no saturado [D]; %>90 d como benchmark CRF [V] |
| C4 | `collection_ratio_3m` | Cobrado 3m / emitido 3m, recortado a [0, 3] | 3m | ↑ | Anclas: < 0,6 → 0; 0,85 → 0,5; 1 → 0,8; ≥ 1,1 → 1 | 15 | 466 | Cash conversion [V] |
| C5 | `customer_breadth` | `ar_n_counterparties_12m` (log) y, si ≥ 5 clientes, `1 − ar_hhi_12m` | 12m | ↑ | Percentil congelado | 15 | 500 | HHI > 0,2 alto [V]; en el dataset el HHI satura por pocos clientes [D] |
| C6 | `customer_churn_rel` | Churn de clientes 12m vs 12m previos, relativo a la mediana del universo | 24m | ↓ | Percentil congelado | 10 | 348 | Churn absoluto no discrimina (mediana 0,46) [D] |

Descartadas: DSO countback / balance-sheet (no hay saldo AR contable), CEI (requiere AR inicial fiable), `ar_overdue_pct` (satura, mediana 0,88).

### 4.4 Pilar D — Deuda y coste de financiación (peso 20)

| id | Señal | Definición | Ventana | ↑/↓ | Normalización | Peso | Cobertura | Evidencia |
|---|---|---|---|---|---|---|---|---|
| D1 | `loc_utilisation` | `Σ drawn / Σ facility` en `lineofcredit` + `confirming` + `factoring`, winsorizado a [0,1]; `granted` nulo/0 → missing | foto 2026-09 (se aplica a los últimos 3 meses; antes, `loc_drawn_eom` reconstruido / facility) | ↓ | Anclas: 0 → 1; 0,3 → 0,9; 0,6 → 0,6; 0,9 → 0,2; 1 → 0 | 25 | 206 empresas con líneas | Señal mejor cuantificada: 81 % vs 52 % en default, 76 % dos años antes [V, Moody's]; bimodal en el dataset [D] |
| D2 | `debtrep_regularity` | Meses con `debt_repayment` / meses activos, 6m, **relativo a la propia base 12m** (`reg_6m / reg_12m_prev`) | 6m vs 12m | ↑ | Anclas: ≥ 1 → 1; 0,8 → 0,6; 0,5 → 0,2; 0 → 0 | 25 | 525 | Sustituye a «cuota impagada» (cuadro sin fechas fiables) [D]; incumplimiento predice PD [V] |
| D3 | `debt_service_ratio` | `(debt_repayment + interest_charge) 3m / op_in 3m` | 3m | ↓ | Anclas: 0 → 1 (si tiene deuda) ; 0,1 → 0,8; 0,25 → 0,5; 0,5 → 0,2; ≥ 1 → 0 | 20 | 525 | DSCR inverso [V]; lead débil pero positivo [D] |
| D4 | `feeint_share` | `(fee + interest_charge) 3m / op_out 3m` | 3m | ↓ | Percentil congelado | 15 | 100 % | Perfil de adelanto [D]; fees como proxy de descubierto [V] |
| D5 | `nonbank_debt_share` | Dispuesto en productos `custom`/`in-house` / dispuesto total | foto | ↓ | Anclas: 0 → 1; 0,25 → 0,6; 0,5 → 0,3; ≥ 0,75 → 0 | 10 | 50 empresas | Financiación de socio = no financiado por bancos [C, D] |
| D6 | `leverage_flow` | `drawn total / op_in 12m` | 12m | ↓ | Percentil congelado | 5 | 307 | Apalancamiento por flujo [C] |

Descartadas: cuotas impagadas del cuadro, muro de vencimientos, nueva deuda por `created_at`, tipo nominal como coste (2 decimales, sin fecha), Δutilización sola.

### 4.5 Pilar A — Actividad y estabilidad (peso 20)

| id | Señal | Definición | Ventana | ↑/↓ | Normalización | Peso | Cobertura | Evidencia |
|---|---|---|---|---|---|---|---|---|
| A1 | `op_in_growth` | `op_in 3m / op_in 3m previos − 1`, y `op_in 12m / 12m previos − 1` cuando existe; **neto de intercompany** | 3m y 12m | ↑ | Percentil congelado, recortado a [−0,6, +1] | 25 | 100 % (12m: 818) | Cobros netos de financiación: mayor magnitud en FinRegLab [V]; crecimiento con DSO plano = fortaleza [C] |
| A2 | `inflow_cv` | σ/μ de `op_in` mensual | 3m (y 6m) | ↓ | Percentil congelado | 25 | 88 % | Volatilidad +1,8–2,1 pp default por σ [V]; **mejor perfil de adelanto del dataset** [D] |
| A3 | `net_ocf_ratio` | `(op_in − op_out) 3m / op_out 3m` | 3m | ↑ | Anclas: ≤ −0,3 → 0; −0,1 → 0,35; 0 → 0,5; 0,1 → 0,7; ≥ 0,3 → 1 | 20 | 100 % | Nivel poco discriminante [D]; útil como trayectoria |
| A4 | `activity_trend` | `n_tx 3m / n_tx 12m·(3/12)` | 3m vs 12m | ↑ | Percentil congelado | 10 | 100 % | Caída de actividad como señal temprana [C] |
| A5 | `intragroup_dependency` | Entradas intercompany 6m / (op_in + entradas intercompany) 6m | 6m | ↓ | Anclas: 0 → 1; 0,2 → 0,7; 0,5 → 0,3; ≥ 0,8 → 0 | 10 | 257 empresas con espejo | Filial sostenida por la matriz [C, D] |
| A6 | `unclassified_share` | `(unclassified_in + unclassified_out) / (bruto total)` | 3m | ↓ | Percentil, **solo como `quality_flag`, no puntúa** | 0 | 100 % | Calidad de dato, no salud [D] |

Fuera del score (van a `confidence`): `months_hist`, cobertura de pilares, `cash_quality`, `unclassified_share`.

### 4.6 Señales de fortaleza explícitas

El brief exige reconocer a la «excepcionalmente sólida». Además del nivel alto, el motor etiqueta `strength_flags` cuando coinciden: (a) A1 > 0 con C2 plano o bajando; (b) P1 ≤ 0,1 sostenido 6m; (c) L1 ≥ 60 días con D1 ≤ 0,3; (d) D2 ≥ 1 y D6 bajando; (e) L5 > 0. Estas etiquetas alimentan el driver «por qué es sólida», no suman puntos extra.

### 4.7 Ramas de cobertura y renormalización

| Rama | Empresas [D] | Pilares disponibles | Peso efectivo | `confidence` máx. |
|---|---|---|---|---|
| Completa | ~440 con facturas suficientes y deuda | L, P, C, D, A | 100 | 1,0 |
| Sin deuda | ~900 sin productos ni repagos | L, P, C, A (D4 sigue disponible) | L 28 · P 22 · C 17 · D 5 · A 28 | 0,9 |
| Sin facturas | 501 | L, P(4–6), D, A | L 32 · P 13 · D 27 · A 28 | 0,75 |
| Sin facturas ni deuda | ~350 | L, P(4–6), A | L 42 · P 18 · A 40 | 0,65 |

Regla: `w_k^eff = w_k · avail_k / Σ w_j · avail_j`. Dentro de cada pilar, igual con las señales.

---

## 5. Fórmula del score

### 5.1 Normalización de cada señal a `u ∈ [0,1]`

Dos mecanismos, ambos deterministas y **congelados** en `params/v1.yaml`:

- **Anclas de dominio** (piecewise-linear) para las señales con umbrales interpretables (utilización, días de retraso, buffer, regularidad). Es la forma «scorecard» de FICO/PAYDEX y la que un CFO entiende [V].
- **Percentil congelado** para las señales sin escala natural (crecimiento, volatilidad, aging relativo). Los cortes de percentil se estiman sobre el **universo de referencia** (todas las empresas, meses fuera de warm-up, winsorizados por mes) y se guardan como tabla `breakpoints(signal, p01…p99)`. Al test oculto se le aplican los mismos cortes: no ve su propia distribución.

Suavizado: `u_smooth = EWMA(u, α)` con `α = 0,5` (half-life ≈ 1 mes) en señales de flujo (A1–A4, L1–L2, C4) y `α = 1` (sin suavizar) en señales de stock, regularidad y eventos (L3, P4–P6, D1–D2).

### 5.2 Pilar

`P_k = Σ_i w_i · u_i / Σ_i w_i` sobre las señales disponibles del pilar (§4.7).

### 5.3 Nivel

```
Level_t = 100 · Σ_k w_k^eff · P_k,t
        − Penalty_t
Penalty_t = 100 · λ · max(0, τ − min_k P_k,t)        λ = 0,5 ; τ = 0,45
```

La penalización del pilar más débil es la versión explicable de una agregación no compensatoria (la geométrica de OECD/JRC penaliza perfiles desiguales [V]); aquí se mantiene aditiva para que la descomposición del delta sea exacta. Ejemplo: `min P = 0,15` → penalización 15 puntos, que aparece como driver «Pilar de deuda muy débil: −15».

### 5.4 Techos por eventos duros (*hard caps*)

Se aplican **solo a eventos dinámicos observables mes a mes**, con código y decaimiento:

| Código | Condición (as-of t) | Techo | Vigencia |
|---|---|---|---|
| `CAP_NEGCASH` | `neg_cash_days ≥ 10` en t y en t−1 | 40 | mientras persista + 1 mes |
| `CAP_SSMISS` | SS pagada en ≥ 9 de los 12 meses previos y ausente en t y t−1 (dos meses seguidos: filtra baches de fecha) | 45 | 2 meses |
| `CAP_DEBTSTOP` | `debt_repayment` regular ≥ 6 de los últimos 9 meses y ausente 2 meses seguidos | 50 | 2 meses |
| `CAP_LOCFULL` | `loc_utilisation ≥ 0,95` (solo en los meses cubiertos por la foto) | 60 | mientras persista |

`Score_t = min(Level_t, cap_t)`, y el techo aparece como driver con su código. Umbrales de dos meses porque los eventos puntuales del dataset son en un 63–74 % rachas de un mes [D]: un solo mes es «bache».

### 5.5 Escala y bandas

Score 0–100, mayor = más sano. Bandas (alineadas con el gráfico del brief y con las escalas de mercado de 4–5 tramos [V]):

| Banda | Rango | Lectura |
|---|---|---|
| `solid` | ≥ 80 | Excepcionalmente sólida |
| `healthy` | 60–79 | Sana |
| `watch` | 40–59 | Vigilar |
| `stress` | < 40 | Tensión |

Calibración de la distribución: el score bruto se mapea por cuantiles a una prior con soporte ~[30, 92], media ~62, sd ~13, para que casos tipo Northbrook (45→65) y Velasco (82→68) caigan donde el brief los pone [H]. El mapeo es monótono: no afecta a métricas de rango.

### 5.6 Confianza

`confidence = f_hist(months_hist) · f_cov(Σ w^eff disponible) · f_quality`, con `f_hist` = 0,4 (< 6 m), 0,7 (6–11), 0,9 (12–17), 1,0 (≥ 18); `f_cov` = peso efectivo cubierto / 100; `f_quality` = 0,8 si `cash_quality = low` o `unclassified_share > 0,6`. Con `confidence < 0,5` el score se muestra con banda ancha y no dispara alertas.

### 5.7 Grupo

1. Netear intercompany (§3.6) y convertir a EUR con la tabla constante.
2. Recalcular las señales de flujo y stock sobre los agregados (no promediar ratios): `buffer_days` de grupo = caja consolidada / salidas consolidadas; retrasos ponderados por importe sobre todas las facturas no intercompany.
3. `Score_grupo` con la misma fórmula.
4. Añadir `group_dispersion = max − min` de scores de filiales y `weakest_subsidiary`. Un grupo con score 70 y una filial en 25 se muestra como 70 con aviso.

Salida al leaderboard: por defecto **grupo**, con la opción `--unit company` (§10.6).

### 5.8 Parámetros (extracto de `params/v1.yaml`)

```yaml
version: v1
window: {start: 2024-09, end: 2026-08}
warmup_months: {default: 3, invoices: 6}
winsor: {low: 0.01, high: 0.99, scope: month}
pillars:
  L: {weight: 25, signals: {L1: 30, L2: 20, L3: 25, L4: 15, L5: 10}}
  P: {weight: 20, signals: {P1: 30, P2: 20, P3: 15, P4: 15, P5: 10, P6: 10}}
  C: {weight: 15, signals: {C1: 25, C2: 15, C3: 20, C4: 15, C5: 15, C6: 10}}
  D: {weight: 20, signals: {D1: 25, D2: 25, D3: 20, D4: 15, D5: 10, D6: 5}}
  A: {weight: 20, signals: {A1: 25, A2: 25, A3: 20, A4: 10, A5: 10}}
anchors:
  L1: [[0,0],[10,0.3],[27,0.6],[60,0.9],[120,1]]
  D1: [[0,1],[0.3,0.9],[0.6,0.6],[0.9,0.2],[1,0]]
  P1: [[0,1],[0.25,0.7],[0.5,0.4],[0.75,0.15],[1,0]]
penalty: {lambda: 0.5, tau: 0.45}
caps: {NEGCASH: 40, SSMISS: 45, DEBTSTOP: 50, LOCFULL: 60}
ewma_alpha: {flow: 0.5, stock: 1.0}
calibration: {support: [30, 92], mean: 62, sd: 13}
```

---

## 6. Trayectoria, régimen y outlook

### 6.1 Estadísticos por empresa-mes (todos causales)

| Estadístico | Cálculo | Parámetro |
|---|---|---|
| `slope_3m`, `slope_6m` | Theil-Sen sobre `Score_{t−k+1..t}` con IC 90 % (`scipy.stats.theilslopes`) [V] | k = 3, 6 |
| `z_own` | `(Score_t − mediana_{t−12..t−1}) / (1,4826 · MAD_{t−12..t−1})` | ventana 12 |
| `breadth` | Diffusion index: % de señales con `Δ3m > 0` (+1), plano (0,5), < 0 (0) [V] | umbral plano ±0,02 en `u` |
| `run` | Meses consecutivos con el mismo signo de `Δ3m Score` | — |
| `cusum⁺ / cusum⁻` | CUSUM tabular sobre `z_own`, k = 0,5, h = 4 [V] | — |
| `p_change` | Bayesian Online Change-Point Detection sobre Score, hazard 1/12 [V] | confianza continua |
| `level_shift` | Diferencia entre mediana de los últimos 3 meses y mediana de los 6 anteriores, en puntos | — |

Justificación del énfasis en escalón: en el dataset la mediana de breakpoints es 1 y el 79 % de los saltos persiste [D].

### 6.2 Reglas de régimen

Evaluadas a partir de `month_index ≥ 7`; antes, `regime = warmup`.

- **deteriorating**: `run ≥ 3` con signo negativo **y** `breadth ≤ 35` **y** (`slope_6m` significativamente < 0 **o** `cusum⁻ > h` **o** `level_shift ≤ −6`).
- **improving**: simétrico con `run ≥ 3`, `breadth ≥ 65`, (`slope_6m` > 0 sig. **o** `cusum⁺ > h` **o** `level_shift ≥ +6`), pero con **`run ≥ 4`** (asimetría: la mejora exige un mes más de persistencia; momentum de ratings [V]).
- **blip**: `|z_own| ≥ 2` durante 1–2 meses **y** `breadth` en [40, 60] **y** `slope_6m` no significativa **y** el nivel vuelve a ±1σ de su mediana previa en ≤ 2 meses. Mientras no se confirme la reversión se etiqueta `shock_pending` (el bache solo se confirma a posteriori; en tiempo real es «sospecha»).
- **recovering**: régimen previo `deteriorating`, `slope_3m > 0` con `run ≥ 2`, y `Score_t` aún ≥ 5 puntos por debajo de su máximo 12m.
- **stable**: el resto.

Histéresis: cambiar de régimen exige cumplir la nueva regla **2 meses consecutivos**. Cambiar de banda (§5.5) exige cruzar el umbral por ≥ 2 puntos y mantenerlo 2 meses hacia abajo, 3 hacia arriba.

### 6.3 Outlook (la banda «Bid/Ask» de la UI)

```
Outlook_h = Score_t + φ·slope_6m·h + γ·LeadIndex_t          h ∈ {3, 6}, φ = 0,85 (amortiguado)
LeadIndex_t = media de z orientados de {A2 inflow_cv, D4 feeint_share, P3 ap_overdue, C2 ar_days_late}
banda = Outlook_h ± 1,28 · σ_resid · √h
```

`LeadIndex` reúne las cuatro señales con perfil de adelanto en el dataset [D]; `γ` se calibra con una regresión logística de `y_Ds` (deterioro estricto a 6 meses) sobre `LeadIndex` con GroupKFold, y se congela en `params`. `outlook_label ∈ {positive, stable, negative, watch}` según el signo de `Outlook_6 − Score_t` y si la banda cruza un umbral de banda de score.

---

## 7. Explicabilidad

### 7.1 Contribuciones

Para cada empresa-mes: `contrib_i = 100 · w_k^eff · (w_i / Σ w) · (u_i − u_i^ref)`, con `u^ref` = mediana del universo de referencia de esa señal. Así `Score = Base + Σ contrib_i − Penalty − CapAdj`, donde `Base` es el score de la empresa mediana. Los *reason codes* son las contribuciones negativas más grandes («frente a la empresa mediana») [V].

### 7.2 Qué se movió

`ΔScore_t = Σ_i (contrib_i,t − contrib_i,t−1) + ΔPenalty + ΔCap`, exacto por aditividad [V]. Se reportan los tres mayores `|Δcontrib|` más un resto agregado, con el valor legible (`"DPO propio 31 días (+12 vs mes anterior)"`).

### 7.3 Narrativa

El LLM recibe **solo** el JSON de drivers con valores ya formateados como placeholders (`{d1} = "91 % de la línea dispuesta"`), devuelve `headline`, `body`, `watch_next` usando los placeholders, y el servidor sustituye. Regex final: todo token numérico de la salida debe estar en la allowlist de `value_fmt`; si falla, reintento y luego plantilla determinista. Se guarda prompt, salida, modelo y `guardrail_passed` [V, principios de Embat]. Coste: precomputar el último mes de las 1.286 empresas más los 24 meses de los casos narrativos ≈ 1–2 € con Haiku 4.5; el resto on-demand con caché por hash de drivers.

---

## 8. Monitor que avisa

| Parámetro | Valor | Fundamento |
|---|---|---|
| Disparo | régimen `deteriorating` o `improving` confirmado (2 meses), **o** cualquier `CAP_*` nuevo, **o** `level_shift ≤ −8` | doble ventana tipo SRE [V] |
| Histéresis | entra con `|z_own| ≥ 2`, sale con < 1 | evita flapping [C] |
| Cool-down | 3 meses por empresa y causa | `keep_firing_for` [V] |
| Presupuesto | ≤ 5 % de la cartera al mes en deterioro, ≤ 2 % en mejora; se ordena por `|ΔScore| · p_change · exposición` y se corta | fatiga de alertas (NEWS2) [V] |
| Niveles | `watch` (solo panel), `review` (bandeja + Slack), `urgent` (cap o cruce de banda) | umbrales escalonados [V] |
| Salida | tabla `alerts` + toast en la UI + **POST real a un Slack incoming webhook** en cada tick del replay | convierte el bonus en demostración |

Curva a enseñar: alertas por 100 empresas-mes en x, precisión y lead time mediano en y, con el punto operativo marcado.

---

## 9. Anticipación medida

### 9.1 Evento «evidente» (congelado antes de mirar el score)

Definido sobre reglas naïve de nivel, **no sobre el score**, para evitar circularidad [V, D]:

- **Deterioro evidente:** primer mes con `CAP_NEGCASH` **o** `CAP_SSMISS` **o** `CAP_DEBTSTOP`, **o** caída ≥ 15 puntos del índice naïve `E` (media de z de caja/salidas, mora propia y aging) respecto a su máximo 12m sostenida 2 meses.
- **Mejora evidente:** simétrico (+15 sobre el mínimo 12m, 2 meses) o salida de un `CAP_*` sostenida 3 meses.
- Se excluyen eventos con `t_event < 9` (sin pasado suficiente); el 77 % de los eventos duros actuales caen ahí [D], así que la muestra evaluable será pequeña y hay que decirlo.

### 9.2 Alerta y lead

`t_alert` = primer mes con régimen `deteriorating` confirmado (o `outlook = negative` con banda por debajo de la banda de score) dentro de `[t_event − 9, t_event)`. `lead = t_event − t_alert` en meses.

### 9.3 Métricas

- Distribución de lead (mediana, IQR), `Recall@h` para h = 1, 2, 3, 6, precisión de alertas, ratio ruido/señal de Kaminsky y evaluación *event-based* frente a *month-based* [V].
- Se compara siempre con la **base**: P(evento en 6 m) sin condicionar. Una falsa alarma de 0,17 frente a una base de 0,19 no es mérito [D].
- Objetivo realista para el hackathon: lead mediano ≥ 2 meses en deterioro con precisión ≥ 1,5× la base, y enseñar la curva completa.

---

## 10. Validación y hedge del leaderboard

### 10.1 Eventos proxy como supervisión débil

Se reutilizan los eventos deterministas del análisis F con dos correcciones: (a) `D2` (runway < 0,5) se sustituye por `CAP_NEGCASH` porque el runway reconstruido está sesgado [D]; (b) los eventos de mejora `I2`/`I5` se condicionan a que el nivel de partida no sea extremo, para limitar la reversión a la media.

### 10.2 Particionado

- `GroupKFold(5)` por `group_id` (todas las filiales y meses de un grupo juntos).
- Walk-forward: parámetros calibrados con meses 1–18, evaluación en 19–24, con purga de 6 meses.

### 10.3 Métricas por eje (reportadas por separado)

| Eje | Métrica |
|---|---|
| Nivel | AUC del score en t contra evento duro en t (esperado alto: es coincidente) |
| Anticipación | AUC del score y del `LeadIndex` en t contra evento en (t, t+3] y (t, t+6]; **a batir: 0,53–0,58** [D] |
| Dos caras | AUC deterioro y AUC mejora por separado |
| Estabilidad | Spearman(Score_t, Score_t−1) intra-empresa (esperado ~0,9); tasa de alertas en blips confirmados |
| Sensibilidad | Recalcular con pesos iguales y con ±25 % por pilar; % de empresas que cambian de banda (OECD/JRC paso 8) [V] |
| Drift | PSI de la distribución de scores entre universo de referencia y cada cohorte de antigüedad; < 0,1 aceptable [V] |

### 10.4 Casos narrativos

Ya identificados en los datos [D]: subida sostenida COMP_0108, COMP_1061, COMP_0866; caída COMP_0519, COMP_1015, COMP_0766, COMP_0651 (escalones, no rampas); baches COMP_0099, COMP_1022; tensión de caja clásica COMP_1267 (cobra antes, paga cada vez más tarde); caída de caja en un solo mes COMP_0905 y COMP_1250; desapalancamiento sano COMP_0354, COMP_1167, COMP_0531 frente a desapalancamiento con caja negativa COMP_1279.

### 10.5 Fugas a vigilar (tests automáticos)

1. Ninguna señal del mes M usa filas con fecha > fin de M.
2. `status` y `payment_date` de facturas solo vía el recálculo as-of.
3. Percentiles congelados no usan meses de warm-up ni la propia empresa en test.
4. `next_payment_date` y `outstanding_balance` del cuadro no se usan en meses anteriores a la foto.
5. Suma de contribuciones + base − penalizaciones = score (±1e-9).

### 10.6 Salidas para el leaderboard

```
predictions.csv        group_id, company_id, month, score, band, regime, outlook_3m, outlook_6m,
                       p_deterioration_6m, p_improvement_6m, confidence
submission_last.csv    group_id, score            # formato mínimo probable
submission_panel.csv   group_id, month, score
submission_class.csv   group_id, class            # improving / stable / deteriorating
make_submission.py --unit {group|company} --format {last|panel|class|prob}
```

Robustez cross-métrica: el score interno es un rango calibrado por cuantiles (§5.5), así que no pierde en métricas de rango y solo arriesga sesgo en RMSE; *shrinkage* hacia la media proporcional a `1/√months_hist` protege a las empresas de alta reciente [H].

---

## 11. Backend

### 11.1 Stack

| Capa | Elección | Motivo |
|---|---|---|
| Cómputo | **Python 3.12 + DuckDB** (`ASOF JOIN` nativo = point-in-time por construcción) + pandas/polars para ventanas; `scipy`, `ruptures` | Todo cabe en memoria; SQL auditable; el `.duckdb` es motor y almacén [V] |
| Artefacto | `scores.duckdb` + Parquet + `leaderboard.csv`, regenerados con `just build` | 30.864 filas de salida; recompute completo en segundos |
| API | **FastAPI** + `sse-starlette` | Habla el idioma de Embat [V]; SSE para ticks y alertas |
| Front | Next.js en Vercel (o React + Vite, decisión abierta con Dani) | Sponsor; replay en cliente |
| Tiempo real | Replay con reloj en cliente sobre 24 frames precargados; SSE solo para sincronía y alertas | Tinybird free = 1.000 requests/día: no sirve para la UI [V] |
| LLM | Claude Haiku 4.5 con placeholders y caché por hash | §7.3 |
| Despliegue | API en Vercel (función Python) o Cloud Run si el timeout aprieta; front en Vercel | Demo navegable obligatoria |

Compatibilidad con la propuesta de Dani (`docs/dani/planning-provisional.md`): el motor en Python exporta resultados versionados y la API los sirve sin recalcular; da igual que la API sea FastAPI o Fastify, mientras el motor viva en Python y el contrato sea el de §11.3.

### 11.2 Modelo de datos

```sql
CREATE TABLE signals(company_id TEXT, month DATE, signal TEXT, value DOUBLE, u DOUBLE,
  u_smooth DOUBLE, is_available BOOL, quality_flag TEXT, params_version TEXT,
  PRIMARY KEY(company_id, month, signal, params_version));
CREATE TABLE score_timeline(company_id TEXT, month DATE, score DOUBLE, level DOUBLE,
  band TEXT, penalty DOUBLE, cap_code TEXT, regime TEXT, slope_3m DOUBLE, slope_6m DOUBLE,
  z_own DOUBLE, breadth DOUBLE, p_change DOUBLE, outlook_3m DOUBLE, outlook_6m DOUBLE,
  outlook_low DOUBLE, outlook_high DOUBLE, outlook_label TEXT, confidence DOUBLE,
  months_hist INT, branch TEXT, params_version TEXT, PRIMARY KEY(company_id, month, params_version));
CREATE TABLE group_timeline(group_id TEXT, month DATE, score DOUBLE, band TEXT, regime TEXT,
  dispersion DOUBLE, weakest_company TEXT, n_companies INT, params_version TEXT,
  PRIMARY KEY(group_id, month, params_version));
CREATE TABLE drivers(company_id TEXT, month DATE, rank INT, signal TEXT, pillar TEXT,
  contribution DOUBLE, delta_vs_prev DOUBLE, value DOUBLE, value_fmt TEXT, direction TEXT,
  params_version TEXT, PRIMARY KEY(company_id, month, rank, params_version));
CREATE TABLE alerts(alert_id TEXT PRIMARY KEY, company_id TEXT, event TEXT, severity TEXT,
  month_detected DATE, month_evident DATE, lead_time_months INT, trigger_signal TEXT,
  score_before DOUBLE, score_after DOUBLE, params_version TEXT);
CREATE TABLE narratives(company_id TEXT, month DATE, params_version TEXT, prompt_hash TEXT,
  model TEXT, prompt TEXT, output_json JSON, rendered TEXT, guardrail_passed BOOL, created_at TIMESTAMP);
CREATE TABLE audit_runs(run_id TEXT PRIMARY KEY, params_version TEXT, params_json JSON,
  inputs_hash TEXT, git_sha TEXT, created_at TIMESTAMP, duration_s DOUBLE, checks_json JSON);
```

### 11.3 Contrato de API (congelar en H+12 con `mock.json`)

```
GET  /v1/universe?as_of=2026-06&unit=company|group&sort=-score&band=watch&limit=50
GET  /v1/companies/{id}?as_of=2026-06
GET  /v1/groups/{id}?as_of=2026-06
GET  /v1/companies/{id}/explain?month=2026-06
GET  /v1/alerts?since=2026-01&severity=review
GET  /v1/treemap?as_of=2026-06&group_by=group|country|erp
GET  /v1/replay/frames                     # 24 frames gzip
GET  /v1/replay/stream   (SSE: tick | alert | score_update)
POST /v1/replay/control  {action, month, speed_ms}
POST /v1/whatif          {company_id, from_month, overrides:{signal: delta}}
GET  /v1/audit/{run_id}
```

Respuesta de detalle (extracto):

```jsonc
{ "company_id": "COMP_1267", "group_id": "GROUP_0113", "as_of": "2026-06",
  "score": 47.3, "band": "watch", "delta_1m": -5.8,
  "regime": "deteriorating", "confidence": 0.86, "branch": "full",
  "outlook": {"h3": 43.1, "h6": 39.4, "low": 33.0, "high": 46.0, "label": "negative"},
  "timeline": [{"month":"2024-09","score":66.1,"band":"healthy"} /* … 24 */],
  "drivers": [
    {"rank":1,"signal":"P2","pillar":"P","contribution":-9.4,"delta_vs_prev":-4.1,
     "value":31,"value_fmt":"paga a proveedores 31 días tarde","direction":"worse"},
    {"rank":2,"signal":"D4","pillar":"D","contribution":-6.2,"delta_vs_prev":-2.0,
     "value":0.031,"value_fmt":"comisiones e intereses 3,1 % de los pagos","direction":"worse"},
    {"rank":3,"signal":"C2","pillar":"C","contribution":+3.5,"delta_vs_prev":+1.2,
     "value":6,"value_fmt":"cobra con 6 días de retraso","direction":"better"}],
  "penalty": {"weakest_pillar":"P","points":-7.5},
  "cap": null,
  "alert": {"alert_id":"a_0412","event":"payables_stretch","severity":"review",
            "month_detected":"2026-03","month_evident":"2026-06","lead_time_months":3},
  "audit": {"params_version":"v1","run_id":"r_2026-09-19T03:10Z","inputs_hash":"sha256:…"} }
```

### 11.4 Pipeline

```
just build  →  1 ingest (CSV/gz → parquet, hash de entradas)
               2 spine (empresa × mes desde first_activity)
               3 prepare (as-of de facturas, taxonomía, FX, intercompany, caja reconstruida)
               4 signals (ASOF JOIN; test: ninguna fila > fin de mes)
               5 normalize (winsor por mes, anclas / percentiles congelados, EWMA)
               6 score (pilares, penalización, caps, calibración; test: aditividad exacta)
               7 trajectory (Theil-Sen, z_own, breadth, CUSUM, BOCPD, régimen, outlook)
               8 drivers + alerts + anticipación
               9 validate (GroupKFold, walk-forward, sensibilidad, PSI) → report.md
              10 export (scores.duckdb, parquet, frames.json.gz, leaderboard.csv, audit_runs)
```

What-if: el score es `f(signals_row, params)`; el escenario re-ejecuta 5–8 para una empresa y los meses ≥ M (~20 filas, < 1 s).

### 11.5 Mapeo con la UI tipo Trade Republic

| Elemento de Trade Republic | X-Ray | Campo(s) |
|---|---|---|
| Instrumento y precio | Empresa o grupo y score | `score`, `band` |
| Variación 1D | `delta_1m` en puntos y % | `delta_1m` |
| Bid / Ask | Banda de outlook a 6 meses | `outlook.low`, `outlook.high` |
| 1D · 1S · 1M · 1A · Máx | 1M · 3M · 6M · 1A · Máx (24 m) | `timeline` |
| Resumen · Estadísticas · Noticias | Resumen · Señales (drivers por pilar) · Alertas | `drivers`, `alerts` |
| Sparkline verde/roja | Score coloreado por régimen | `regime` |
| Tu cartera | Filiales de mi grupo (CFO) o cartera del financiador | `/groups/{id}` |
| Favoritos | Watchlist con sparkline y última alerta | `/universe` |
| Treemap por sector | Treemap por grupo/país/ERP; tamaño = cobros 12m; color = `delta_3m` | `/treemap` |
| Valor de la cuenta | Salud media de la cartera y nº de empresas «que se mueven de verdad» | `/universe` agregado |

---

## 12. Qué nos diferencia

1. **Vector nivel + régimen + outlook con banda**, no un número; la banda es literalmente el Bid/Ask de la UI.
2. **Change-point como núcleo de la trayectoria**, porque los datos se mueven por escalones y así lo demostramos.
3. **Dos ramas de cobertura honestas** con confianza explícita, en lugar de imputar ceros al 39 % del universo sin facturas.
4. **Point-in-time verificado con tests**, incluido el recálculo as-of de facturas que descubre el doble de mora que el `status` congelado.
5. **Intercompany real neteado** por transferencias espejo y una señal de dependencia intragrupo que ningún score de mercado tiene.
6. **Cobros netos de financiación e intercompany**, la corrección que evita premiar a quien se hunde tirando de la línea [V].
7. **Explicación aditiva exacta** («qué se movió») sin SHAP, y narrativa con placeholders que no puede inventar cifras.
8. **Anticipación medida contra eventos definidos antes de mirar el score**, con curva alertas/precisión y comparación con la base. Menos vistoso que un «detecta con 6 meses», más creíble ante Embat.
9. **Monitor con presupuesto de alertas y Slack real** en el replay.
10. **Parámetros versionados y auditables**: dos versiones del score conviven y se comparan en vivo.

---

## 13. Plan de ejecución (36 h, cinco personas)

| Bloque | Horas | Entrega verificable | Frente |
|---|---|---|---|
| Arranque | H0–H3 | Preguntar a Embat unidad/formato/métrica; congelar `params/v1.yaml` inicial; `just build` produce spine y `signals_raw` con 30.864 filas | Datos (Dani) + motor |
| Motor v0 | H3–H9 | Score, drivers y régimen para todas las empresas; test de aditividad y de point-in-time en verde | Motor |
| Contrato | H9–H12 | `mock.json` + FastAPI sirviendo el artefacto; **desbloquea el front** | API |
| UI | H12–H20 | Universo con sparklines, detalle con timeline y drivers, watchlist, replay en cliente | Front (2 personas) |
| Alertas y anticipación | H20–H24 | Bandeja, Slack webhook, curva lead/precisión, casos narrativos | Motor |
| Narrativa y auditoría | H24–H28 | Explicación LLM con guardarraíl; panel de auditoría; what-if | API + motor |
| Cierre técnico | H28–H31 | Deploy público, SSE, prueba desde móvil ajeno, `leaderboard.csv` en el formato confirmado | Todos |
| Vídeo y entrega | H31–H34 | Vídeo del recorrido; README; `hackspain submit` | Producto |
| Colchón | H34–H36 | Nada nuevo | — |

Puestas en común cada 90 minutos con evidencia, como propone Dani.

---

## 14. Riesgos y preguntas abiertas

| Riesgo | Mitigación |
|---|---|
| El leaderboard usa una unidad o métrica que no cubrimos | Panel canónico + `make_submission.py` con cuatro formatos; preguntar en H0 |
| La anticipación medible es pequeña y el jurado espera «seis meses» | Enseñar la curva y la base; vender el régimen y el outlook, no un lead inflado |
| Caja reconstruida sesgada en 2024 | Nivel relativo, ventanas trailing, test `opening = 0`, `cash_quality` |
| Utilización de líneas es una foto | Aplicarla solo a los últimos 3 meses como nivel; nunca como trayectoria |
| Empresas sin facturas quedan «peor» por cobertura | Renormalización y `confidence`; comprobar que la distribución de scores por rama tiene PSI < 0,1 |
| Outliers del generador (caja de 100.000 M, importes de 3.000 M) | Winsorización por mes; exclusión del top 1 % en consolidados de grupo |
| Repo público y vídeo obligatorios | Hacerlos en H+2 y H+31, no al final |

Preguntas para Embat el primer día: unidad (grupo o empresa), formato y métrica del leaderboard, número de envíos, hora de cierre, quién juzga el track.

---

## 15. Anexos

### 15.1 Material de análisis (fuera del repo)

`~/Developer/embat-analysis/`:
- `analysis/A_schema_quality.{py,md}` — estructura, nulos, signos, cobertura, integridad.
- `analysis/B_generator_forensics.{py,md}` + `B_panel.parquet` — PCA, ICC, change-points, casos tipo.
- `analysis/C_invoices_payment_behaviour.{py,md}` + `C_invoice_panel.parquet` — DSO/DPO as-of, mora, concentración.
- `analysis/D_debt_liquidity.{py,md}` + `D_liquidity_panel.parquet` — utilización, reconstrucción de caja, `debt_repayment`, intercompany espejo.
- `analysis/E_transactions_cashflow.{py,md}` + `E_cashflow_panel.parquet` — taxonomía, flujos, regularidad, FX.
- `analysis/F_proxy_events_signals.{py,md}` + `F_events_panel.parquet` — eventos proxy, AUC por horizonte, anticipación.
- `parquet/` — los 8 ficheros del dataset en Parquet (zstd).

Entorno: `hackspain-2026/.venv` (duckdb, pandas, polars, numpy, scipy, scikit-learn, statsmodels, ruptures).

### 15.2 Fuentes principales [V]

- Embat: blog técnico `embat.io/tech`; Risk Management, Counterparty y Debt Management; changelog (Forecast date adjustment, feb 2026); tesis de Cathay Innovation.
- Cash-flow scoring: FinRegLab / Howell & Matsumoto 2025 (*Sharpening the Focus*); Plaid *How we built LendScore*; Prism Data CashScore v4; Moody's *Usage and Exposures at Default of Corporate Credit Lines*; JPMorgan Chase Institute *Cash is King*; ECCBSO *Customer and supplier payment periods and financial distress*; Berg et al. RFS 2020.
- Metodología: OECD/JRC *Handbook on Constructing Composite Indicators*; MathWorks `formatpoints` (escalado PDO); myFICO reason codes; InterpretML EBM; S&P *Use of CreditWatch and Outlooks*; Güttler (Bundesbank) rating momentum; PSI/CSI.
- Trayectoria y early warning: `scipy.stats.theilslopes`; Adams & MacKay BOCPD; `ruptures` PELT; Conference Board diffusion index; BIS *ROC, NSR y umbrales*; Alessi & Detken (ECB WP 1039); Google SRE *Alerting on SLOs*; NEWS2.
- Backend: DuckDB AsOf Join; Feast point-in-time joins; sse-starlette; Vercel FastAPI; Tinybird limits; Convex limits.
- Regulación y benchmarks España/UE: Ley 15/2010; Cepyme Observatorio de Morosidad II-2025; EU Payment Observatory 2025; Intrum EPR 2026; D&B PAYDEX; Coface DRA; Allianz Trade grading.
