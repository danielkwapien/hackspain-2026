# La fórmula: score bancario vs score Embat

Lauren, 19/09/2026. Plan de la fórmula «mejorada» que se construye en paralelo al pipeline
bancario de un compañero. **Las dos puntúan de 0 a 100 y tienen que ser comparables.**

Contexto: [BUILD-PLAN.md](BUILD-PLAN.md) · Señales: [ENGINE.md](ENGINE.md) §4–5.

---

## 1. La decisión que lo gobierna todo: un motor, dos configuraciones

> **Los dos scores comparten máquina. Lo único que cambia es qué datos puede ver cada uno.**

Si el score bancario usara otras anclas, otra normalización u otra calibración, la diferencia
entre ambos sería un **artefacto de construcción** y no diría nada. Con la misma máquina, la
diferencia es exactamente lo que queremos medir: **el valor de la información extra**. Deja de
ser «dos modelos» y pasa a ser una **ablación**, que es defendible ante cualquier jurado técnico.

En la práctica:

```
engine/score.py          una sola implementación
params/bank_v1.yaml      apertura = 1 banco · máscara de señales = sin facturas
params/wide_v1.yaml      apertura = todos los bancos · máscara = sin facturas   ← intermedio
params/embat_v1.yaml     apertura = todos · máscara = todo
```

Idénticos: anclas, winsorización, percentiles congelados, regla de renormalización,
penalización no compensatoria, **mapa de calibración a 0–100**.
Distintos: **apertura** y **máscara de señales**. Nada más.

Esto además hace trivial el *merge* con el compañero: él es dueño de `bank_v1.yaml` y de validar
que la vista bancaria es honesta; el motor es común.

---

## 2. Qué ve cada uno

| | **Banco** (steelman) | **Embat** |
|---|---|---|
| Cuentas | **Un solo banco**, el mayor del grupo | Todos |
| Entidad | Las cuentas del grupo en ese banco | Grupo consolidado, intercompany neteado |
| Facturas | **Ninguna** | Capa completa de obligaciones |
| Deuda | Solo sus propias facilidades | Todas, con `granted` / `drawn` / headroom |
| Divisa | Lo que pase por sus cuentas | Todo, normalizado a EUR |

**«Steelman» es deliberado:** se le da al banco su mejor caso posible — el banco principal del
grupo, no uno cualquiera. Así la conclusión es conservadora y nadie puede decir que amañamos la
comparación.

### 2.1 Cuánto se pierde con una sola ventana [D]

| Hecho | Valor |
|---|---|
| Bancos por grupo | mediana **5**; **86,8 %** de grupos multibanco |
| Lo que ve el **banco principal** | mediana **59,3 %** de los movimientos (71 % del volumen de cobros) |
| Lo que ve un banco **cualquiera** | mediana **5,2 %** de los movimientos |
| Grupos donde el banco principal **no ve ni un `debt_repayment`** | **47 de 249** |
| Grupos donde el banco principal **no ve `tax`/`social_security`/`salary`** | **25** |
| Grupos con deuda repartida en **2+ bancos** | **76 %** (mediana 3 bancos) |

La cobertura temporal **no** es el problema (el banco principal ve la mediana del 100 % de los
meses). **El problema es la apertura.** Y lo que es peor para el banco: en 47 grupos concluiría
«esta empresa no tiene deuda» cuando sí la tiene en otro banco.

---

## 3. Los cinco pilares y quién puede calcular qué

Se mantiene la estructura L/P/C/D/A de ENGINE §4. La columna nueva es quién ve cada señal.

| Pilar | Señales | Banco | Embat |
|---|---|---|---|
| **L** Liquidez | `buffer_days`, `cash_min_ratio`, `neg_cash_days`, `runway` | ⚠️ Solo su propio saldo | ✅ Caja consolidada de todos los bancos |
| **P** Disciplina de pago | `ss_regularity`, `tax_regularity`, `salary_regularity` | ⚠️ Solo si pasan por él (25 grupos ciegos) | ✅ |
| | **`ap_pct_paid_late`, `ap_days_late_w`, `ap_overdue`** | ❌ **Imposible: no tiene vencimientos** | ✅ **La señal estrella** |
| **C** Cobros y clientes | `ar_*_late`, `ar_overdue`, `collection_ratio`, `customer_breadth` | ❌ **Pilar entero imposible** | ✅ |
| **D** Deuda | `debtrep_regularity`, `debt_service_ratio`, `feeint_share` | ⚠️ Solo lo suyo (47 grupos ciegos) | ✅ |
| | **`loc_utilisation`** (dispuesto/concedido) | ❌ Necesita `granted` de **todos** los bancos | ✅ |
| **A** Actividad | `op_in_growth`, `inflow_cv`, `net_ocf_ratio`, `activity_trend` | ⚠️ Sobre su rodaja | ✅ Neto de intercompany |

Tres tipos de ventaja, y conviene no confundirlos:

1. **Apertura** (⚠️): *la misma señal*, calculada sobre datos completos en vez de una rodaja.
2. **Señales nuevas** (❌ en P y C): lo que **no existe** sin la capa de facturas.
3. **Estructura** (`loc_utilisation`): necesita `granted` agregado entre bancos.

---

## 4. Lo que solo Embat puede meter en la fórmula

### 4.1 El desfase obligación → caja (la joya)

Un banco ve **«entraron 50.000 € de ACME»**. Embat ve **«la factura vencía el 3 de marzo y se
cobró el 12: nueve días tarde, y es la cuarta vez seguida»**.

Medido aquí [D]: **el 37,3 % de las facturas a cobrar se pagan tarde** (p90 = 38 días) y el
**35,1 % de las que se pagan** salen tarde (p90 = 30 días). Plazos medianos: 10 días a cobrar,
16 a pagar. **Nada de esto es derivable de un extracto bancario**, porque el extracto no tiene
fecha de vencimiento.

Es exactamente el fundamento de **PAYDEX** (D&B), uno de los scores comerciales más antiguos que
existen. Entra en P1/P2 y C1/C2.

### 4.2 El libro futuro comprometido

Facturas vivas con vencimiento posterior al corte: **12.758 a cobrar y 15.475 a pagar** en ~494
sociedades. Es **caja contratada, no una extrapolación**. Un banco solo tiene histórico y tiene
que proyectar.

Señal nueva propuesta, **fuera de las de ENGINE**:

```
committed_cover_3m = (caja_eom + cobros_comprometidos_90d) / (pagos_comprometidos_90d + servicio_deuda_90d)
```

Es un *runway* anclado en contratos en vez de en medias móviles. Ancla propuesta:
≤ 0,8 → 0 · 1,0 → 0,5 · 1,3 → 0,8 · ≥ 2,0 → 1. Va al pilar **L**, peso 20, **solo en la rama con
facturas**; en el resto se renormaliza.

### 4.3 Consolidación de grupo y neteo intercompany

Un banco financia **una sociedad**. Lee una transferencia de la matriz como «ingreso». El 25,9 %
de las transferencias son espejos intercompany [D]: sin netearlas, una filial sostenida por su
matriz parece sana. Afecta a todo el pilar **A** y a `leverage_flow`.

### 4.4 Headroom real de las líneas

`granted` − `drawn` **sumado entre todos los bancos**. Con el 76 % de los grupos con deuda en 2+
bancos, ningún banco conoce el headroom total. CIRBE da a los bancos españoles el **dispuesto**
agregado, con retraso mensual — **no el concedido ni la estructura por facilidad**.

### 4.5 Lo que NO vamos a decir que tenemos

**No hay efecto red.** 124.030 contrapartes, **0 % compartidas entre grupos**, máximo 1 grupo por
contraparte [D]. La ventaja tipo «Plaid network insights» **no existe en estos datos**. Y el
**90,2 % de los movimientos no tiene `counterparty_id`**: la identidad vive en la capa de
facturas, no en el extracto. Afirmarlo sería exactamente el tipo de promesa hinchada que hunde
una demo.

---

## 5. Cómo se calcula (idéntico en los dos)

Es la maquinaria de *scorecard* estándar (ENGINE §5), aplicada dos veces con distinta máscara.

```
1. señal cruda            s_i(grupo, t)     solo datos ≤ t
2. winsorizar             límites globales CONGELADOS por señal
3. normalizar             u_i ∈ [0,1]   anclas de dominio, o percentil congelado (base: 250 grupos, p05/p95)
4. pilar                  P_k = Σ w_i·u_i / Σ w_i     solo señales disponibles
5. renormalizar pilares   w_k^eff = w_k·avail_k / Σ w_j·avail_j
6. nivel                  Level = 100·Σ w_k^eff·P_k − λ·100·max(0, τ − min_k P_k)
7. techos duros           Score = min(Level, cap)      caps absolutos
8. calibrar               mapa monótono CONGELADO → 0–100
```

### 5.1 La trampa de la calibración [crítica]

> **El mapa de calibración se ajusta UNA vez, sobre la distribución del score Embat, y se aplica
> a los dos.**

Si cada score se calibrase por separado, los dos tendrían media ~62 **por construcción** y la
diferencia media sería cero: destruiríamos nuestro propio hallazgo antes de medirlo.

Consecuencia esperada y que hay que **reportar, no esconder**: el score bancario tendrá
**menos dispersión**, porque con menos señales y más ruido tira hacia la media. Eso *es* el
resultado — un banco discrimina peor — y se enseña como `sd(bank)` vs `sd(embat)`.

### 5.2 Descomponer la ventaja en tres

Con la config intermedia `wide_v1` (todos los bancos, aún sin facturas):

```
Δ_apertura   = Score(wide)  − Score(bank)     valor de ver todos los bancos y netear el grupo
Δ_información = Score(embat) − Score(wide)     valor de la capa de facturas y del headroom
Δ_total       = Score(embat) − Score(bank)
```

Tres ejecuciones del mismo motor. Es la diapositiva: **«cuánto vale cada trozo de dato extra»**,
en puntos, no en adjetivos.

---

## 6. Validación de la comparación

| # | Prueba | Criterio |
|---|---|---|
| **C1** | **Grupos sin facturas, sin deuda y con un solo banco**: los dos scores deben ser **casi idénticos** | Si difieren, hay un bug en la máscara. Es el mejor test de la comparación |
| **C2** | Spearman(rank_bank, rank_embat) sobre los 250 | Se reporta; se espera alta pero no 1 |
| **C3** | **Desacuerdos de ranking**: grupos en el cuartil alto para el banco y en la mitad baja para Embat | **La diapositiva.** Son los créditos que un banco daría mal. Cada uno con su explicación |
| **C4** | Dispersión: `sd(bank)` vs `sd(embat)` | Se espera menor en el banco (§5.1) |
| **C5** | `Δ` por rama de cobertura | Debe crecer con la cobertura de facturas. Si no, la ventaja es ruido |
| **C6** | Aislamiento de 60 grupos (BUILD-PLAN V1) | Idéntico, tol. 1e-9, **en las dos configs** |

**C1 y C6 van a CI.** C3 es lo que se enseña.

---

## 7. Orden de trabajo

| # | Paso | Cierra con |
|---|---|---|
| 1 | Panel `group_month` con columna `bank_name` por movimiento, para poder filtrar apertura | Cobertura reproduce §2.1 |
| 2 | Motor con máscara de señales y apertura como parámetros | La misma función devuelve los 3 scores |
| 3 | Señales del banco (L, A, D parcial, P4–P6) | **C1 en verde** |
| 4 | Congelar `reference_v1.json` sobre la distribución **Embat** | C6 en verde en las 3 configs |
| 5 | Señales de facturas: P1–P3, C1–C6, `committed_cover_3m` | C5 |
| 6 | `loc_utilisation` y neteo intercompany | Δ descompuesto en tres (§5.2) |
| 7 | *Replay* de 24 meses en las 3 configs | C2, C3, C4 |

**Contrato con el compañero** (acordar antes de escribir código): el motor lee un panel de
señales `(unit_id, month, signal_id, value, available)` y un YAML de config. Él produce el panel
bancario con la misma firma; el resto es común. Así el *merge* es cambiar un fichero de
parámetros, no reconciliar dos implementaciones.
