# Baseline estatico vs motor temporal: medicion honesta

Lauren, 19/09/2026. Resultados de ejecutar los dos pipelines sobre `datasets/`.
Codigo: `core/pipeline.py` (baseline) y `core/pipeline_embat.py` (temporal).
**Todo lo de aqui es medido, no estimado.**

---

## 1. Qué es cada uno

| | `core/pipeline.py` | `core/pipeline_embat.py` |
|---|---|---|
| Unidad | Sociedad (1.286) | **Grupo (250)** — la unidad confirmada |
| Tiempo | **Una foto** a 2026-09-01 | **24 meses**, point-in-time |
| Factores | 4 (liquidez, utilizacion, mora, pago) | 5 pilares, 16 senales |
| Fuentes | balances, debt, invoices | + **transactions (2,5 M filas)** |
| FX | Descarta filas fuera de moneda funcional | Convierte con `exchange_rate` |
| Agregacion | Media ponderada | Ponderada + **penalizacion del pilar mas debil** |
| Tiempo de ejecucion | 2 s | 21 s |

---

## 2. Los dos rankings casi no coinciden

```
Spearman(baseline_agregado_a_grupo, temporal) = 0,391
```

| | mediana | sd | min | max |
|---|---|---|---|---|
| Baseline | 67,2 | 20,2 | 15,0 | **100,0** |
| Temporal | 60,3 | 18,2 | 16,7 | 92,7 |

**52 de 248 grupos difieren en mas de 40 puntos percentiles.** 14 estan en el cuartil alto del
baseline y en la mitad baja del temporal, y 14 al reves. Con ρ = 0,39 **no estan midiendo lo
mismo**, y al menos uno de los dos se equivoca mucho.

---

## 3. La prueba que importa: ¿anticipan algo?

Evento definido **independientemente de cualquier score**: el grupo entra en **caja consolidada
negativa dos meses seguidos**. Se excluyen los grupos que ya estan en el evento en `t`, asi que
es una prueba hacia delante de verdad.

### 3.1 Anticipacion a 3 meses (51 eventos, 2.609 grupo-mes)

| Predictor | AUC |
|---|---|
| **`buffer_days` solo** (una ratio) | **0,879** |
| `cash_eom` solo | 0,814 |
| **Score compuesto (temporal)** | **0,665** |
| **Tendencia (pendiente 3m del score)** | **0,502** ← moneda al aire |

A 6 meses: compuesto 0,617, tendencia 0,480, `buffer_days` 0,807.

### 3.2 Por qué el compuesto pierde contra su propio componente

AUC de cada pilar por separado, mismo evento:

| Pilar | AUC |
|---|---|
| **liquidity** | **0,892** |
| debt | 0,556 |
| collections | 0,536 |
| **activity** | **0,385** |
| **payment** | **0,365** |

Y variando pesos:

| Ponderacion | AUC |
|---|---|
| Actual 25/20/15/20/20 | 0,662 |
| Liquidez pesada 60/10/5/15/10 | 0,864 |
| Solo liquidez | 0,892 |

**`payment` y `activity` apuntan al reves** (AUC < 0,5): un score alto de disciplina de pago
predice *mas* problemas de caja, no menos. No es un bug de signo, es real y tiene sentido: quien
paga todo a tiempo drena caja, y quien crece rapido la quema. El compuesto no solo diluye la
senal buena, **incorpora senal contraria**.

### 3.3 La lectura honesta, con su contra

Dos interpretaciones y **las dos son ciertas**:

1. El compuesto esta mal ponderado **para predecir tension de caja**.
2. **El evento elegido no es «mala salud»**: caja negativa tambien es crecimiento e inversion.
   Medir «salud crediticia» contra «se queda sin caja» es parcialmente injusto con el score.

Lo que **no** admite matiz: **la pendiente del score no predice nada** (AUC 0,50 y 0,48). La
historia de «trayectoria» no se sostiene construida asi.

---

## 4. Qué hacer con esto

### 4.1 Separar dos salidas, no colapsarlas en un numero

Es lo que hace un producto de credito real: **un rating y una watchlist**, no una cifra.

- **Score de salud (compuesto)** — para ordenar, comparar y explicar. Es un **juicio
  estructurado**, no una prediccion. Se vende por su descomposicion.
- **Alerta de liquidez (`buffer_days`)** — para el monitor. Es donde la prediccion **si**
  funciona (AUC 0,88). Va como metrica destacada propia, no enterrada al 12,5 % del peso.

### 4.2 La trayectoria hay que reconstruirla

La pendiente de un compuesto suavizado llega tarde por construccion. Si queremos anticipacion,
tiene que salir de las senales con perfil de adelanto (ENGINE §6.3 `LeadIndex`), no de la
derivada del propio score.

### 4.3 Fallos concretos del baseline que si conviene arreglar

1. **`debt_utilisation_factor`: `granted <= 0` devuelve 100.** No tener lineas de credito da
   **25 puntos gratis** de score perfecto. Explica el `max = 100,0`. Deberia ser `None`
   (no aplicable) y renormalizar, como hace con los demas factores.
2. **No lee `transactions.csv`.** Sin flujos no hay `buffer_days`, que es justo la senal con
   AUC 0,88. `cash/(cash+deuda)` es un proxy de liquidez mucho mas debil.
3. **FX: descarta las filas fuera de la moneda funcional** en vez de convertirlas. Con el 15 %
   de facturas en otra divisa, a un grupo multidivisa le borra datos en silencio.
4. **`available` siempre es NULL** en `balances.csv` (verificado en las 7.996 filas): la rama
   `number(row["available"])` es codigo muerto que siempre cae al `balance`.

---

## 5. Estabilidad: medida y corregida

El score mensual crudo era ruido. Con suavizado EWMA (α = 0,5) sobre el **pilar** —no sobre el
score final, para que la descomposicion siga cuadrando—:

| | Antes | Despues |
|---|---|---|
| Spearman(rank_t, rank_{t−1}) | 0,821 | **0,937** |
| mediana \|Δscore\| mensual | 4,8 pts | **2,9 pts** |
| p90 \|Δscore\| | 17,2 pts | **9,1 pts** |

El objetivo de BUILD-PLAN V3 (ρ ≈ 0,9) se cumple **solo** con el suavizado. Sin el, el ranking
parpadea y cualquier conclusion sobre trayectoria es ruido.

---

## 6. Aviso sobre el plan de validacion

> «Mirar predicciones a mitad de los dos años y ver que tendencia predijo la evolucion futura.»

Si «evolucion futura» es **el propio score en `t+k`**, la prueba es **circular**: mide la
autocorrelacion de la formula, no su capacidad predictiva. Un score suavizado continua su
tendencia por construccion; con EWMA α = 0,5 eso esta garantizado y no demuestra nada.

La version valida es la de §3: **un evento observable definido antes y fuera del score**,
excluyendo a quien ya esta en el evento en `t`. Es la unica forma de que el numero signifique
algo, y ya esta implementada.

---

## 7. Fallo nuevo que ha cazado el banco de pruebas (M4)

`core/evaluate.py` mide la paridad entre ramas de cobertura. Resultado:

```
M4  paridad ramas  PSI=0,78 [REVISAR]
    con facturas   mediana 53,2  (n=167)
    sin facturas   mediana 71,9  (n=82)
```

**No tener ERP sube el score 18,7 puntos.** Es exactamente el modo de fallo contra el que avisa
BUILD-PLAN §4.2: el score esta midiendo en parte si el grupo tiene integracion contable.

Causa, localizada en la mediana por pilar:

| Pilar | Con facturas | Sin facturas |
|---|---|---|
| liquidity | 61,9 | 66,7 |
| **payment** | **75,0** | **99,6** |

En la rama sin facturas el pilar `payment` se queda solo con `ss_regularity` y `tax_regularity`,
que valen ~1,0 para casi todo el mundo. Desaparecen las dos senales que castigan
(`ap_pct_paid_late`, `ap_days_late`) y el pilar colapsa a «¿paga sus impuestos?» ≈ 100.

**El error esta en renormalizar dentro del pilar sin penalizar la ignorancia.** Si solo observas
el 35 % del peso de un pilar, no puedes sacar un 100 en el.

**Arreglo propuesto (encogimiento por cobertura parcial):**

```
f = peso observado del pilar / peso total del pilar
P_ajustado = 50 + (P_crudo - 50) * sqrt(f)
```

Lo que no se ve se asume **medio**, no excelente. Es la correccion estandar y deberia bajar el
PSI por debajo de 0,1 sin tocar ninguna ancla. **Medir con `core/evaluate.py` antes y despues.**
