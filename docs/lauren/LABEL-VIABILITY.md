# ¿Se puede construir un estimador de etiqueta? Evidencia y veredicto

Lauren, 18 de septiembre de 2026. Responde a una propuesta concreta: *buscar un indicador
directo en los datos, hacer ingeniería de variables sobre él y usarlo como estimador de
etiqueta*. Todos los números salen de consultas reproducibles sobre `datasets/`.

**Veredicto corto: la idea no sobrevive al contacto con los datos, pero una versión distinta
de la misma idea sí, y además cambia dos decisiones de [ENGINE.md](ENGINE.md).**

---

## 1. El test: ¿co-varían los indicadores de tensión?

Un estimador de etiqueta presupone que existe un **factor latente de salud** que mueve varias
señales a la vez. Si existe, indicadores independientes deben coincidir en las mismas empresas.
Se construyeron tres, deliberadamente de fuentes distintas:

| Indicador | Definición | Empresas |
|---|---|---|
| `I_cash` | Caja consolidada reconstruida < 0 dos meses seguidos (desde 2025-03, para evitar el sesgo de reconstrucción de 2024) | 187 |
| `I_stop` | Paga SS o `debt_repayment` con regularidad ≥ 60 % durante ≥ 6 meses y luego **falta dos meses seguidos** | 132 |
| `I_ovd` | > 35 % del importe de facturas **a pagar** en estado `overdue` | 230 |

### Cuántos indicadores se disparan por empresa (universo: 1.268)

| Indicadores | Empresas | Esperado si fueran independientes |
|---|---|---|
| 0 | 798 | — |
| 1 | 404 | — |
| 2 | 61 | ~67 |
| 3 | 5 | ~3,5 |

**Observado ≈ esperado bajo independencia.** Los *lifts* por pares lo confirman:

| Par | Lift |
|---|---|
| P(`I_stop` \| `I_cash`) / P(`I_stop`) | **0,98** |
| P(`I_ovd` \| `I_cash`) / P(`I_ovd`) | **0,94** |
| P(`I_ovd` \| `I_stop`) / P(`I_ovd`) | **1,13** |

Un factor latente daría *lifts* muy por encima de 1. Dan 1.

### Versión alineada en el tiempo (la prueba justa)

A nivel empresa-mes, no «alguna vez»:

- P(caja negativa) = 0,065 · P(caja negativa | paró de pagar SS ese mes) = 0,039 → **lift 0,59**
- Como adelantado: P(parón de SS en t+1..t+3 | caja negativa en t) → **lift 0,52**

No solo no correlacionan: **correlacionan al revés**.

---

## 2. Por qué correlacionan al revés: `I_stop` no mide tensión, mide silencio

Contraste de la actividad total de la empresa (número de movimientos) contra su propia base de
3–6 meses antes:

| Situación | Movimientos en el mes | Base 3–6 meses antes | Ratio |
|---|---|---|---|
| Mes normal | 124,9 | 111,7 | 1,12 |
| **Mes de «parón de SS/deuda»** | 55,3 | 118,1 | **0,47** |
| Mes de **caja negativa** | 170,1 | 146,3 | **1,16** |

Lectura, y es inequívoca:

- **Cuando una empresa «deja de pagar la Seguridad Social», su actividad total se parte por la
  mitad.** Eso no es una empresa en tensión: es **una conexión bancaria que se apaga**. Una
  empresa con problemas no deja de transaccionar, transacciona más.
- **Cuando la caja se va a negativo, la actividad sube un 16 %.** Eso sí es tensión de caja real,
  y es coherente con el comportamiento esperado.

Esto explica además el hallazgo de ENGINE §1.6 de que **el 77 % de los eventos duros caen en los
primeros 6 meses observados** de cada empresa: no son eventos financieros, son artefactos de
integración y de cobertura.

---

## 3. Consecuencia directa: dos correcciones a ENGINE.md

### 3.1 `CAP_SSMISS` y `CAP_DEBTSTOP` están mal planteados [corrección]

ENGINE §5.4 aplica **techos de score de 45 y 50 puntos** cuando se interrumpen los pagos de
Seguridad Social o de deuda. Con la evidencia de §2, esos techos **castigan a una empresa porque
su feed bancario se ha quedado mudo**. Es justo el tipo de conclusión equivocada que un jurado
detecta abriendo la demo y mirando una empresa concreta.

**Propuesta:** la ausencia de obligaciones recurrentes pasa de **señal de salud** a **señal de
cobertura**. Alimenta `confidence` y un estado `stale_feed`, no el score. Se mantiene el techo
**solo si la actividad total NO cae** (ratio ≥ 0,8): ahí sí es una empresa viva que ha dejado de
pagar, que es el evento que se quería capturar.

### 3.2 Los pilares independientes son la arquitectura correcta [confirmación]

Que las señales **no** co-varíen valida la decisión #5 de ENGINE: cinco pilares con agregación
**no compensatoria** y penalización del pilar más débil. Si las señales fueran colineales,
sobraría con un factor. Como son independientes, cada pilar aporta información propia y el
castigo al eslabón más débil es justo lo que corresponde a fuentes de riesgo independientes.
**Los datos respaldan el diseño.**

---

## 4. Por qué el estimador de etiqueta no es viable — y qué ponemos en su lugar

No hay factor latente que estimar. Eso explica, sin necesidad de culpar al modelado, el
resultado de ENGINE §1.6: **AUC fuera de fold 0,44–0,53 no es un modelo malo, es la ausencia de
un target.** Entrenar sobre una etiqueta proxy aquí aprendería nuestra propia regla y la
presentaría como validación. Es circular y además frágil.

**El replanteamiento correcto: el score es una definición, no una estimación.** El brief dice
*«con él **construís** un score de salud financiera»*. No pide reproducir un número oculto. Y
como la rúbrica (§2.7) es cualitativa, lo que se juzga es si **las conclusiones se siguen de la
definición**. En ese marco, no tener etiqueta deja de ser un problema.

> **Confirmado con la organización (18/09/2026):** no hay validación numérica contra una
> etiqueta; lo que se evalúa son las conclusiones del sistema vistas en la aplicación. El
> replanteamiento de este apartado deja de ser propuesta y pasa a ser el marco de trabajo.
> Ver [UNKNOWNS.md](UNKNOWNS.md) §2.2.

Lo que sustituye al estimador, que es lo que de verdad hacía falta:

### 4.1 Panel de aceptación (no de entrenamiento)

Las **66 empresas con 2+ indicadores** y un grupo de control de empresas activas con 0
indicadores. No se ajustan pesos con ellas. Se usan para **aseverar** que el score las separa,
como test de regresión en CI. Una etiqueta con 5 % de cobertura no sirve para entrenar y es
excelente para validar.

### 4.2 El indicador directo que sí funciona: caja

De los tres, **solo `I_cash` se comporta como un estado financiero real**:

- Cobertura útil: 254 empresas con caja negativa alguna vez, **200 de forma persistente** (16 %).
- **Persistencia: lift 11,8** — P(negativa en t | negativa en t−1) = 0,75. Es un estado, no ruido.
- La actividad **sube** durante el episodio: coherente con tensión, no con silencio.
- Concuerda con ENGINE §1.6, donde runway daba AUC 0,83 coincidente.

Es el ancla del pilar de liquidez y la base de los casos narrativos. **Coincidente, no
anticipador**, y hay que venderlo como tal.

### 4.3 Tests de sentido sin etiqueta

Comprobables y deterministas: monotonía (peor utilización *ceteris paribus* ⇒ score menor),
suma de contribuciones = score, invariancia de los casos narrativos de ENGINE §10.4, y el test
de aislamiento de 60 grupos de `UNKNOWNS.md` §6.

---

## 5. Advertencias sobre estos números

- **La caja reconstruida hacia atrás está sesgada** en los primeros meses (ENGINE §14). Se
  mitigó restringiendo a partir de 2025-03, no se eliminó.
- 209 de 4.898 productos de liquidez **no tienen ancla** en `balances.csv` y quedan fuera de la
  reconstrucción; 2.808 productos con saldo y sin movimientos aportan una constante.
- Los tres indicadores son **deliberadamente crudos**, construidos en minutos para responder
  una pregunta de sí/no. Sirven para concluir que **no hay factor latente**; no son el catálogo
  de señales, que es el de ENGINE §4.
- El contraste de actividad (§2) es el resultado más robusto de este documento: el efecto es
  grande (0,47 vs 1,16) y va en direcciones opuestas.
