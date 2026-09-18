# Plan de construcción — motor de ranking de salud financiera por grupo

Lauren, 18/09/2026. Plan ejecutable para 48 h. Diseño del motor:
[ENGINE.md](ENGINE.md) · Estado de incógnitas: [UNKNOWNS.md](UNKNOWNS.md) · Por qué no hay
etiqueta: [LABEL-VIABILITY.md](LABEL-VIABILITY.md).

---

## 0. El encuadre, en cinco frases

1. **La unidad es el GRUPO. 250 grupos, no 1.286 sociedades** [ORG]. Las señales se calculan
   sobre agregados de grupo; la sociedad es *drill-down*, no unidad de puntuación.
2. **El usuario es un inversor / prestamista** que quiere decidir a quién prestar o en quién
   entrar. No es el CFO mirándose a sí mismo. Eso cambia la pantalla principal: **una cartera
   ordenada**, no un cuadro de mando de tesorería.
3. **Lo que se entrega es un ranking explicable**, no un número exacto. No hay score de
   referencia, así que el objetivo es que **el orden y las conclusiones sean defendibles**,
   señal a señal.
4. **El score en el mes `t` usa solo datos ≤ `t`.** Es una función de una ventana creciente, y
   se recalcula para los 24 meses. Esa reejecución es a la vez el producto (la trayectoria que
   ve el inversor) y la validación (¿bajó antes del golpe?).
5. **La explicabilidad es el criterio de diseño dominante**, por encima del ajuste. Si una señal
   no se explica en una frase a un inversor, no entra.

---

## 1. Lo que fija el terreno: números a nivel de grupo

Medidos sobre `datasets/` [D]. **Todos los de ENGINE §4 son por sociedad; estos son los que
mandan ahora.**

### 1.1 Cobertura por fuente (de 250 grupos)

| | Grupos | % |
|---|---|---|
| Con facturas | 167 | 67 % |
| Con productos de deuda | 150 | 60 % |
| Historia ≥ 12 meses | 159 | 64 % |
| Historia ≥ 18 meses | 127 | 51 % |
| Historia completa 24 meses | **86** | **34 %** |

**Agrupar mejora la cobertura**: 67 % de grupos con facturas frente al 61 % de sociedades, porque
basta con que una filial tenga ERP. Buena noticia y argumento a favor de la unidad grupo.

### 1.2 Ramas de cobertura recalculadas a nivel de grupo

| Rama | Grupos | Pilares |
|---|---|---|
| Completa (facturas + deuda) | **101** | L, P, C, D, A |
| Sin deuda | 66 | L, P, C, A |
| Sin facturas | 49 | L, P(4–6), D, A |
| Sin ninguna de las dos | 34 | L, P(4–6), A |

**Sustituye a la tabla de ENGINE §4.7**, que está calculada por sociedad.

### 1.3 La curva que condiciona todo el *replay*

Grupos puntuables en cada mes según la historia mínima exigida:

| Mes | Existen | ≥ 3 m | ≥ 6 m | ≥ 12 m |
|---|---|---|---|---|
| 2024-09 | 95 | 0 | 0 | 0 |
| 2025-03 | 142 | 129 | 97 | 0 |
| 2025-09 | 171 | 159 | 142 | 95 |
| 2026-03 | 246 | 232 | 179 | 136 |
| 2026-08 | **250** | 249 | **244** | **159** |

Tres lecturas que cambian decisiones:

- **El panel está fuertemente sesgado a la derecha.** En 2024-09 solo existen 95 de 250 grupos.
  No se pueden comparar agregados entre meses sin normalizar por cohorte.
- **Exigir 12 meses de historia dejaría fuera al 36 % de los grupos en el último mes.** Demasiado
  caro. Exigir 6 cubre 244 de 250 (98 %).
- **La ventana útil de *backtest* empieza hacia 2025-06**, cuando ya hay ~128 grupos con 6 meses.
  Antes, el *replay* es demasiado fino para sacar conclusiones.

---

## 2. Arquitectura: el score es una función `as-of`

### 2.1 La firma

```
score(group_id, t) = f( todos los hechos con fecha ≤ fin de mes t )
```

Sin excepciones. Nada de `status` final de factura, nada de `outstanding_balance` de la foto
aplicado hacia atrás, nada de percentiles calculados con el futuro. Se ejecuta para
`t = 2024-09 … 2026-08` y produce el **panel `group_month`: 250 × 24 = 6.000 filas como máximo**.

Ese panel es simultáneamente:

- **el producto** — la trayectoria de 24 meses que el inversor ve en pantalla;
- **la validación** — si el score cae antes de un evento observable, la anticipación se mide
  sobre el propio panel, sin etiqueta;
- **la entrega** — la predicción del test oculto es el mismo panel con menos grupos.

### 2.2 Historia variable: la regla de ventana mínima

Trade-off real: **más historia da mejor señal, pero exigirla deja grupos sin puntuar.** Decisión
propuesta, calibrada con la tabla de §1.3:

| Historia en `t` | Qué se emite | `confidence` |
|---|---|---|
| < 3 meses | **No se puntúa.** `status = insufficient_history` | — |
| 3–5 meses | Score **provisional**: solo señales de ventana ≤ 3m; sin régimen ni *outlook* | ≤ 0,45 |
| 6–11 meses | Score completo; régimen disponible; sin señales de 12m (A1-12m, C5, C6, D6, L5) | ≤ 0,75 |
| ≥ 12 meses | Todo | ≤ 1,0 |

Las señales que no se pueden calcular **se excluyen y se renormalizan los pesos** (ENGINE §4.7).
Nunca se imputan a cero: un grupo joven no es un grupo enfermo.

> **Decisión abierta D1 (ver §6):** si el score provisional se muestra en el ranking junto al
> resto o se aparta a una sección «cobertura insuficiente». Recomendación: **apartarlo**. Un
> inversor que ve un grupo con 3 meses ordenado junto a uno con 24 recibe una comparación falsa.

---

## 3. Base de datos y capas

### 3.1 Decisión: DuckDB + Parquet. No Postgres

El dataset es una **foto inmutable de solo lectura**. No hay escrituras concurrentes,
transacciones ni multiusuario, que es lo único que justifica un relacional. Postgres costaría
instalación, DDL, carga de 3,4 M de filas y **un servicio que tiene que estar levantado durante
la demo**. DuckDB lee los `.csv.gz` sin descomprimir, escanea los 2,5 M de movimientos con
`GROUP BY` en **~7,6 s**, y es SQL que lee todo el equipo.

Si aparece **estado de aplicación** (usuarios, alertas leídas, watchlists del inversor), eso sí
es escritura: **SQLite** o Postgres gestionado, **solo para eso**, nunca mezclado con los datos
analíticos.

### 3.2 Capas

```
datasets/*.csv.gz          bronce: vistas DuckDB, sample_size=-1. No se copia nada
   ↓
silver_*.parquet           hechos saneados: fechas, FX, dirección, intercompany, caja
   ↓
company_month.parquet      panel por sociedad (drill-down)
   ↓
group_month.parquet        ← EL ARTEFACTO. 6.000 filas. Unidad de puntuación
   ↓
scores.parquet + drivers.parquet + alerts.parquet     exports/ = contrato con frontend
```

`exports/` se versiona en git: son pocos MB y son el contrato entre personas. **Publicar el
primer día con datos de relleno rotulados** para desbloquear al frontend.

### 3.3 Los artefactos congelados (`params/reference_v1.json`)

Con el test oculto confirmado como «mismo formato, menos grupos», **todo lo que dependa de la
cohorte cargada es un bug**. Hay que congelar **cinco** cosas (auditoría en UNKNOWNS §4.1):

1. Cortes de percentil por señal.
2. **Límites de winsorización** por señal.
3. **Mapa monótono de calibración** a la escala 0–100.
4. **`u_ref` por señal y `Base`** (el grupo mediano), que usa la descomposición de ENGINE §7.1.
5. Mediana de churn del universo (C6).

Se generan **una vez** con los 250 grupos, se commitean y **jamás se recalculan en ejecución**.

> **Corrección a ENGINE §5.8:** `winsor: {scope: month}` no sirve. Con 250 grupos —y solo 95
> activos en los primeros meses— los límites mensuales se estiman sobre muy pocos puntos y
> además dependen de la cohorte. **Winsorización con límites globales congelados por señal.**

> **Corrección a ENGINE §5.1:** los percentiles se estimaban sobre el universo de sociedades.
> Deben estimarse sobre la **distribución de grupos**, que es la unidad que se ordena. Y con
> n = 250, **p01/p99 se apoyan en 2–3 observaciones**: usar **p05/p95** e interpolar entre
> deciles. Pretender precisión de percentil 1 con 250 puntos es ruido.

---

## 4. Procesado: valores atípicos y datos ausentes

### 4.1 Atípicos — el dataset es brutal

El 0,25 % de las filas concentra el 75 % del importe absoluto; hay 20 movimientos > 1.000 M y un
grupo con caja reconstruida de 100.000 M y cero cobros [D]. Defensas, en este orden:

1. **Todo ratio, nunca un importe absoluto.** Ninguna señal puntúa en euros. Esto elimina de
   golpe el problema de escala entre un grupo de 1 sociedad y uno de 24.
2. **Escalar contra la propia historia del grupo** (`z_own` sobre mediana y MAD, que son
   robustas), no contra la media del universo.
3. **Winsorización con límites globales congelados** (§3.3) antes de normalizar.
4. **Recortes duros por dominio** donde el ratio tiene significado: `runway` a [−3, 24],
   `collection_ratio` a [0, 3], `loc_utilisation` a [0, 1], `op_in_growth` a [−0,6, +1].
5. **`cash_quality = low`** cuando la apertura reconstruida es < −1.000 € o el saldo supera 100×
   los cobros anuales. Va a `confidence`, no al score.

### 4.2 Datos ausentes — la regla de oro

> **Ausencia de dato ≠ mala salud.** Es la regla que más fácil se rompe y la que más rápido
> produce una conclusión absurda en pantalla.

| Caso | Qué NO hacer | Qué hacer |
|---|---|---|
| Grupo sin facturas (83 de 250) | Imputar 0 en DSO/aging | Excluir pilares C y P1–P3; renormalizar; `confidence` ≤ 0,75 |
| Grupo sin deuda (100 de 250) | Puntuar 0 en el pilar D | Excluir D salvo D4; **no tener deuda no es malo** |
| Señal sin cobertura | Imputar la mediana | Excluir y renormalizar dentro del pilar |
| Historia corta | Extrapolar tendencia | Regla de ventana mínima (§2.2) |
| `granted` nulo o 0 en una línea | Utilización = 0 o = 1 | `missing`; no se calcula D1 |
| **Feed bancario mudo** | Tratarlo como impago | **`stale_feed`, va a `confidence`** — ver §4.3 |

**Test obligatorio:** la distribución de scores de cada rama de cobertura debe tener **PSI < 0,1**
contra la rama completa. Si los grupos sin facturas puntúan sistemáticamente más bajo, la
renormalización está mal y lo que mide el score es la integración del ERP, no la salud.

### 4.3 La corrección del feed mudo [crítica]

De [LABEL-VIABILITY.md](LABEL-VIABILITY.md) §3: cuando una empresa «deja de pagar la Seguridad
Social», **su actividad total cae a 0,47× su propia base**. Eso es una conexión bancaria que se
apaga, no una empresa en tensión — la caja negativa, que sí es tensión, viene con actividad
**1,16×**.

**`CAP_SSMISS` y `CAP_DEBTSTOP` de ENGINE §5.4 castigan feeds mudos.** Arreglo:

```
si (obligación recurrente desaparece) y (actividad_3m / actividad_base ≥ 0,8):
    → cap real. Empresa viva que ha dejado de pagar
si (obligación recurrente desaparece) y (actividad cae < 0,8):
    → stale_feed. Baja confidence, NO toca el score
```

Lo mismo para P4/P5/P6 (regularidades) del pilar P.

### 4.4 Consolidación de grupo

1. **Netear intercompany** por transferencias espejo (importe opuesto, ±3 días, entre dos
   sociedades del mismo grupo). Detectable: 25,9 % de las transferencias frente a 0,2 % en
   placebo [D].
2. **Convertir a EUR** con el `exchange_rate` de cada fila. El 15 % de las facturas no son EUR.
3. **Agregar hechos, luego calcular ratios.** Nunca promediar ratios de filiales:
   `buffer_days` de grupo = caja consolidada ÷ salidas consolidadas.
4. **Emitir dispersión**: `group_dispersion` (max − min de scores de filiales) y
   `weakest_subsidiary`. Un grupo con 70 y una filial en 25 se muestra como 70 **con aviso** —
   para un inversor, esa filial puede ser justo el riesgo.

---

## 5. Validación sin etiqueta

No hay referencia contra la que medir error. Lo que sí se puede demostrar es **consistencia,
robustez y anticipación**. Ocho mecanismos, de mayor a menor valor para el jurado:

| # | Mecanismo | Qué demuestra | Criterio |
|---|---|---|---|
| **V1** | **Test de aislamiento de 60 grupos.** Ejecutar sobre 60 grupos aislados y comparar con el universo completo | **Generalización.** Es el escenario confirmado del test oculto | Scores **idénticos**, tol. 1e-9 |
| **V2** | **Anticipación sobre el *replay*.** Distancia en meses entre la caída del score y el evento duro observable (caja negativa persistente) | Que el score **ve venir** las cosas | Lead mediano > 0; curva alertas/precisión |
| **V3** | **Estabilidad del ranking.** Spearman(rank_t, rank_{t−1}) | Que el ranking **no parpadea** | ≈ 0,9. Si es bajo, es ruido |
| **V4** | **Monotonía sintética.** Empeorar una señal de un grupo *ceteris paribus* | Que el score **responde en la dirección correcta** | El score baja, siempre |
| **V5** | **Paridad entre ramas (PSI).** Distribución por rama de cobertura | Que no se puntúa **la integración del ERP** | PSI < 0,1 |
| **V6** | **Sensibilidad a pesos.** Recalcular con pesos iguales y ±25 % por pilar | Que el ranking **no depende de pesos a ojo** | % de grupos que cambian de banda; reportarlo |
| **V7** | **Panel de aceptación.** Los grupos donde 2+ indicadores independientes coinciden vs control activo y limpio | **Validez aparente** en casos duros | El score los separa. **No se ajustan pesos con ellos** |
| **V8** | **Ablación por pilar.** Quitar un pilar y ver si el orden sobrevive | Que ningún pilar **domina** por accidente | Spearman entre rankings |

**V1, V3 y V4 son tests de CI**, deterministas y sin discusión. **V2 y V6 son las diapositivas**
que convencen al jurado. V1 se escribe **antes** que la fórmula.

> **Lo que NO se puede afirmar:** que el score predice quiebras, que está calibrado como
> probabilidad, o que la anticipación es de seis meses. La evidencia disponible da un adelanto
> **modesto** (ENGINE §1.6: AUC 0,53–0,58 a 6 meses). **Enseñar la curva y la base, no inflar.**
> Un inversor detecta una promesa hinchada antes que un error de cálculo.

---

## 6. Decisiones y trade-offs abiertos

Hay que cerrarlas conscientemente. Recomendación en cada una.

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| **D1** | Grupos con historia 3–5 meses en el ranking | Mezclados / sección aparte | **Aparte.** Comparar un grupo de 3 meses con uno de 24 es engañar al inversor |
| **D2** | Base de los percentiles congelados | Distribución de sociedades (n=1.286) / de grupos (n=250) | **Grupos.** Es la unidad que se ordena. Con n=250, usar p05/p95, no p01/p99 |
| **D3** | Calibración a [30, 92] μ62 σ13 | Aplicarla / dejar el score crudo | **Aplicarla, pero es hipótesis [H]**, apoyada solo en los 4 números del brief. Monótona ⇒ no altera el ranking. Emitir también `score_raw` |
| **D4** | Utilización de línea (D1) | Es solo foto de 2026-09 | **Nivel en los últimos 3 meses, nunca trayectoria.** Aplicarla hacia atrás inventaría una serie |
| **D5** | Caja reconstruida hacia atrás | Usarla / limitarla | Usarla **desde 2025-03**; antes está sesgada. Test obligatorio: recalcular con `opening = 0` y comprobar que el **ranking de trayectorias no cambia** |
| **D6** | Peso de los pilares | Los de ENGINE §5.8 / iguales | **Los de ENGINE**, y **enseñar V6**. La defensa no es que los pesos sean correctos, es que el ranking es robusto a ellos |
| **D7** | Ventana del *backtest* | Los 24 meses / desde 2025-06 | **Desde 2025-06.** Antes hay menos de 128 grupos con 6 meses: conclusiones sobre humo |
| **D8** | Penalización no compensatoria (λ, τ) | Mantener / quitar | **Mantener.** Las señales son independientes ([LABEL-VIABILITY](LABEL-VIABILITY.md) §3.2): castigar el eslabón más débil es lo correcto con riesgos independientes |
| **D9** | Sociedad como unidad | Ahora / después | **Después.** El panel `company_month` se calcula igual y sirve de drill-down, pero **no se puntúa ni se ordena** en esta entrega |

---

## 7. Orden de construcción (48 h)

Cada bloque termina en algo verificable. **No se pasa al siguiente sin el test.**

| # | Bloque | Sale | Test que lo cierra |
|---|---|---|---|
| 1 | Bronce + silver: fechas, FX, dirección, intercompany, caja reconstruida | `silver_*.parquet` | Reglas de saneado con test unitario; `opening = 0` (D5) |
| 2 | `company_month` → `group_month`, spine denso 250 × 24 | El panel | Cobertura reproduce §1.1–1.3 exactamente |
| 3 | **`exports/` con datos de relleno rotulados** | Contrato | El frontend arranca **aquí**, no al final |
| 4 | Pilares L y A (100 % de cobertura) + `confidence` | Score parcial | **V1 aislamiento** y **V4 monotonía** en verde |
| 5 | `params/reference_v1.json` congelado (los 5 artefactos) | Params | V1 sigue en verde tras congelar |
| 6 | Pilares D y P, con la corrección del feed mudo (§4.3) | Score | **V5 paridad de ramas** (PSI < 0,1) |
| 7 | Pilar C + renormalización por rama | Score completo | V5 de nuevo; **V8 ablación** |
| 8 | *Replay* de 24 meses: trayectoria, régimen, `level_shift` | Panel completo | **V3 estabilidad** (Spearman ≈ 0,9) |
| 9 | Explicabilidad: contribuciones, «qué se movió», *reason codes* | `drivers.parquet` | Σ contribuciones + base − penalizaciones = score, ±1e-9 |
| 10 | Monitor y **V2 anticipación** | `alerts.parquet` + curva | Lead mediano > 0, tasa de alertas acotada |
| 11 | **V6 sensibilidad** + V7 panel de aceptación + casos narrativos | Diapositivas | — |

**Bloques 1–5 son el camino crítico.** Si el tiempo aprieta, se recortan pilares (7) y monitor
(10), nunca los artefactos congelados (5) ni V1.

---

## 8. Qué ve el inversor

El motor solo vale si la pantalla contesta la pregunta de quien paga. Tres vistas, y la primera
es la que importa:

1. **Cartera ordenada** — 250 grupos por score, con banda, flecha de trayectoria, régimen y
   `confidence`. Filtros por rama de cobertura y por banda. **Esta es la pantalla principal**:
   un inversor empieza por «¿a quién miro?», no por una empresa concreta.
2. **Ficha de grupo** — 24 meses de score, descomposición por pilares, los tres *drivers* que más
   se movieron con su valor legible, dispersión entre filiales y la filial más débil.
3. **Bandeja del monitor** — quién se ha movido de verdad este mes, en ambas direcciones, con el
   motivo y el enlace a la evidencia.

El comprador es **Embat**: ya posee este rastro de 400+ grupos, ya tiene el módulo de Risk
Management donde encajarlo, y hoy **no tiene ningún score ni rating** (`PROBLEM.md` §9.1). Lo que
se le vende es la capa que le permite pasar de *mirar* el dinero a *intermediarlo*.
