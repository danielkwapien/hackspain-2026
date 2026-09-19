# Qué sabemos, qué no sabemos y qué asumimos

Registro de decisiones bajo incertidumbre. Creado el 18/09/2026, **actualizado el 18/09/2026
tras confirmar tres puntos con la organización**.

Fuentes: brief oficial (`PROBLEM.md` §2), inspección propia del dataset, diseño del motor en
[ENGINE.md](ENGINE.md) y evidencia de [LABEL-VIABILITY.md](LABEL-VIABILITY.md).
Marcas: **[PDF]** del brief · **[ORG]** confirmado con la organización · **[D]** verificado en
los datos · **[H]** hipótesis nuestra.

---

## 1. Resumen: el registro se ha cerrado casi entero

| # | Incógnita | Estado |
|---|---|---|
| U1 | Escala del score | ✅ **CERRADA** — 0–100, más alto = más sano [ORG] |
| U2 | Métrica del leaderboard | ✅ **CERRADA** — no hay validación numérica contra etiqueta [ORG] |
| U3 | Unidad: grupo o sociedad | ✅ **CERRADA** — **el GRUPO** (250) [ORG] |
| U4 | Mecanismo del test oculto | ✅ **CERRADA** — mismo formato exacto, menos empresas [ORG] |
| U5 | Qué es «el resultado» | ✅ **CERRADA** — no hay número oculto que reproducir [ORG] |
| U6 | Formato de entrada | ✅ **CERRADA** — los mismos 8 CSV [ORG] |

**El registro está cerrado.** Lo que antes era riesgo de proyecto es ahora riesgo de
ingeniería, y está todo en §4.

---

## 2. Lo confirmado, y qué implica cada cosa

### 2.1 Escala 0–100 [ORG]

Confirmada. Más alto = más sano. Deja de ser inferencia del gráfico del brief.

**Lo que sigue abierto es la distribución dentro de la escala.** La calibración de ENGINE §5.5
(soporte [30, 92], μ 62, σ 13) sigue siendo **hipótesis [H]**: se apoya en los únicos cuatro
números publicados (Northbrook 45→65, Velasco 82→68 [PDF]). Como el mapeo es monótono, el
riesgo es cosmético; pero hay que rotularlo como hipótesis en el repo, no como dato.

### 2.2 No hay validación numérica contra etiqueta [ORG]

No se compara nuestro score contra un score de referencia. **Lo que se juzga son las
conclusiones que extrae el sistema**, vistas en la aplicación web. Coherente con el brief: la
rúbrica de §2.7 son tres bloques que pesan igual y **todos los criterios son preguntas
cualitativas**; el leaderboard aparece una sola vez, en §2.6, y **cero veces en la rúbrica**.

Tres consecuencias, y son grandes:

1. **El score es una definición, no una estimación.** El brief dice *«con él **construís** un
   score»*. No hay número oculto que reproducir. Esto cierra formalmente la cuestión de la
   etiqueta ausente: no falta nada.
2. **La cadena que se juzga es score → conclusión → pantalla.** Un score mediocre arruina las
   conclusiones, así que el score sigue importando; pero **lo que se mira es el eslabón final**.
3. **El modo de fallo ya no es la imprecisión: es una conclusión visiblemente absurda** en una
   empresa concreta que el jurado abra en la demo. De ahí la corrección de §3.2.

### 2.3 El test oculto: mismo formato, menos empresas [ORG]

Los mismos 8 CSV, idéntico esquema, con un subconjunto de empresas. Esto confirma el
**«Mundo B»**: el pipeline tiene que producir resultados correctos sobre una cohorte más
pequeña que nunca ha visto.

> **Esta es ahora la restricción de ingeniería número uno del proyecto.** No es defensiva: es
> el escenario confirmado. Todo lo que se normalice contra «el universo cargado» se desplaza
> cuando el universo pasa de 1.286 empresas a 60. Ver §4.

---

## 3. Lo que SABEMOS

### 3.1 Del brief [PDF]

- Ocho entregables obligatorios (R1–R8, `PROBLEM.md` §7.1).
- Rúbrica: tres bloques que pesan igual, todos cualitativos.
- *«Un modelo sencillo con un producto claro encima nos interesa más que uno sofisticado que se
  queda en el número.»*
- Descalifica (§7.4): detector de quiebras, score de un solo mes, caja negra, un LLM que calcula
  el número, un notebook.

### 3.2 De los datos [D]

- **No hay etiqueta** — y con U2/U5 cerradas, **ya no hace falta**.
- **No hay factor latente de salud.** Tres indicadores de tensión independientes no co-varían:
  *lifts* 0,98 / 0,94 / 1,13, y 0,59 alineado en el tiempo. Detalle en
  [LABEL-VIABILITY.md](LABEL-VIABILITY.md).
- **«Dejar de pagar SS/deuda» es silencio de feed, no tensión**: la actividad total cae a **0,47×**
  su propia base. La caja negativa sí es tensión real: actividad **1,16×** y persistencia
  *lift* 11,8.
- Cobertura desigual: mediana 18 meses; 29 % con 24; 29 % con menos de 12.
- **39 % de las sociedades sin facturas** (501 de 1.286); 463 de ellas tampoco tienen ERP.
- `payment_date` rellena en facturas no pagadas, con fechas imposibles → estado as-of obligatorio.
- `balances`: `balance` viene en las 7.996 filas y **`available` esta vacia por completo**.
  **Correccion (19/09): `granted` (2.648 filas, 33 %), `liquidity` (1.896, 24 %) y `countable`
  (664, 8 %) SI traen valores.** Una version previa de este documento decia que las cuatro
  estaban vacias; era falso. `granted` en `balances` es headroom de credito utilizable.
- 87 cuadros de amortización para 2.239 productos de deuda.

---

## 4. La única decisión de ingeniería que importa ahora: artefactos congelados

Con U4 confirmada, **todo paso que dependa de la distribución de la cohorte cargada es un bug**.
Con 60 empresas en lugar de 1.286, esos pasos devuelven otro número para la misma empresa.

### 4.1 Auditoría de ENGINE.md: qué es seguro y qué no

| Paso | Referencia | ¿Depende de la cohorte? |
|---|---|---|
| Anclas de dominio (L1, D1, P1…) | §5.1 | ✅ No. Absolutas |
| *Hard caps* | §5.4 | ✅ No. Absolutos |
| Penalización λ, τ | §5.3 | ✅ No. Absolutos |
| `confidence` | §5.6 | ✅ No. Absoluta |
| Cortes de percentil | §5.1 | ✅ **Ya declarados congelados** |
| **Winsorización p1/p99 «dentro de cada mes»** | §3, §5.8 `scope: month` | ❌ **Sí. No congelada** |
| **Calibración por cuantiles a [30, 92]** | §5.5 | ❌ **Sí. No declarada congelada** |
| **`u_i^ref` (mediana del universo) y `Base`** | §7.1 | ❌ **Sí. Hay que almacenarlas** |
| **`customer_churn_rel`, «relativo a la mediana del universo»** | §4.3 C6 | ❌ **Sí. No congelada** |
| **Exclusión del top 1 % en consolidados de grupo** | §14 | ❌ **Sí. No congelada** |

**Cinco pasos hay que congelar**, no uno. Con 60 empresas, la winsorización mensual calcularía
p1/p99 sobre ~60 valores en vez de ~1.200, y la calibración por cuantiles recalcularía su mapa:
la distribución entera se desliza y la generalización es ficticia.

### 4.2 Qué hacer

1. **Un único artefacto versionado**, `params/reference_v1.json`, que contenga: cortes de
   percentil, **límites de winsorización por señal y mes**, **el mapa monótono de calibración**,
   **`u_ref` por señal y `Base`**, y la mediana de churn del universo. Se genera una vez con el
   universo completo, se commitea y **jamás se recalcula en ejecución**.
2. **Preferir anclas sobre percentiles** donde la señal tenga umbral interpretable: son absolutas
   y no necesitan universo de referencia.
3. **Cero acoplamiento a IDs**: ningún `company_id` ni `group_id` en código, umbrales ni casos
   especiales.
4. **Robustez con N pequeño**: pilar con cobertura cero, grupo de una sola sociedad, agregado
   vacío, división por cero. Con 60 empresas todos estos casos aparecen.
5. **Un solo comando**, de CSV crudos a salida, sin reentrenar y sin red.

### 4.3 El test que lo demuestra (el más importante del repo)

> Ejecutar el pipeline sobre **una muestra aislada de 60 grupos** y comprobar que los scores de
> esos grupos son **idénticos** a los que salen del universo completo. Tolerancia `1e-9`.

Si difieren, hay fuga de distribución y la afirmación de generalización es falsa. **Va en CI y
se escribe antes que el §5 del motor**, porque es el escenario confirmado del test oculto.

---

## 5. U3 cerrada: la unidad es el GRUPO [ORG]

Se puntúan y se ordenan **los 250 grupos**. La sociedad se calcula igual y sirve de *drill-down*
en la ficha, pero **no se puntúa ni entra en el ranking** en esta entrega.

Consecuencias:

- **Las coberturas de ENGINE §4 y §4.7 están calculadas por sociedad y quedan obsoletas.** A
  nivel de grupo: 167 de 250 con facturas, 150 con deuda, 101 en rama completa.
- **Los percentiles congelados se estiman sobre la distribución de grupos (n = 250)**, no de
  sociedades. Con 250 puntos, p01/p99 se apoyan en 2–3 observaciones: usar **p05/p95**.
- **La winsorización mensual de ENGINE §5.8 deja de ser viable**: en los primeros meses solo hay
  95 grupos activos. Límites globales congelados por señal.
- El panel de salida son **250 × 24 = 6.000 filas**.

---

## 6. Corrección pendiente en ENGINE.md

De [LABEL-VIABILITY.md](LABEL-VIABILITY.md) §3.1, y urgente porque afecta a lo que el jurado ve:

**`CAP_SSMISS` (techo 45) y `CAP_DEBTSTOP` (techo 50) castigan a una empresa porque su feed
bancario se ha quedado mudo**, no porque esté en tensión. Con U2 cerrada —lo que se juzga son
las conclusiones vistas en pantalla— este es exactamente el error que hunde una demo.

**Arreglo:** la ausencia de obligaciones recurrentes pasa de señal de salud a señal de
cobertura; alimenta `confidence` y un estado `stale_feed`. El techo se mantiene **solo si la
actividad total no cae** (ratio ≥ 0,8), que es el caso de empresa viva que ha dejado de pagar.

---

## 7. Preguntas restantes para Embat

1. **¿La unidad es el grupo o la sociedad?** (U3 — la única que cambia algo)
2. ¿La predicción se refiere al último mes o al panel completo de meses?
3. Hora de cierre de la entrega del track.
