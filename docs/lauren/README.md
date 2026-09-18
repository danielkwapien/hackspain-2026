# Notas de Lauren

Análisis de datos y motor de score. **Orden de lectura y autoridad**, de mayor a menor: si dos
documentos se contradicen, manda el de más arriba. Por encima de todos, el brief transcrito en
[PROBLEM.md](../../PROBLEM.md) §2.

| # | Documento | Qué es |
|---|---|---|
| 1 | [BUILD-PLAN.md](BUILD-PLAN.md) | **Plan de construcción.** Capas, atípicos, ausentes, validación sin etiqueta, decisiones abiertas y orden de las 48 h. **Empezar aquí** |
| 2 | [UNKNOWNS.md](UNKNOWNS.md) | Qué sabemos y qué asumimos. Auditoría de pasos dependientes de la cohorte |
| 3 | [LABEL-VIABILITY.md](LABEL-VIABILITY.md) | Evidencia de que no hay factor latente de salud, y qué se hace en su lugar |
| 4 | [ENGINE.md](ENGINE.md) | Diseño del motor: señales, fórmula, régimen, monitor, backend. **Vigente con cuatro correcciones** (abajo) |

## Estado en una página

**Cerrado con la organización:** escala **0–100**, más alto = más sano · **la unidad es el GRUPO
(250)**, no la sociedad · **no hay validación numérica contra etiqueta**: se juzgan las
conclusiones vistas en la app · el test oculto son **los mismos 8 CSV con menos grupos**.

**Audiencia:** un **inversor / prestamista** que decide a quién prestar. Pantalla principal =
**cartera ordenada**, no cuadro de mando de tesorería.

**Objetivo:** un **ranking explicable y consistente**, no un score exacto. No hay referencia
contra la que medir error; lo que se demuestra es consistencia, robustez y anticipación.

**El score en `t` usa solo datos ≤ `t`** y se recalcula para los 24 meses. Ese *replay* es a la
vez el producto, la validación y la entrega.

## Correcciones pendientes en ENGINE.md

| # | Qué | Dónde |
|---|---|---|
| 1 | **`CAP_SSMISS` y `CAP_DEBTSTOP` castigan un feed bancario mudo**, no una empresa en tensión. La actividad cae a 0,47× | ENGINE §5.4 → [LABEL-VIABILITY §3.1](LABEL-VIABILITY.md) |
| 2 | **Cinco artefactos hay que congelar, no uno**: percentiles *(ya)*, winsorización, calibración, `u_ref`/`Base`, mediana de churn | ENGINE §5.1/§5.5/§5.8/§7.1 → [UNKNOWNS §4.1](UNKNOWNS.md) |
| 3 | **Coberturas y ramas están por sociedad y quedan obsoletas.** Recalculadas por grupo | ENGINE §4, §4.7 → [BUILD-PLAN §1](BUILD-PLAN.md) |
| 4 | **Winsorización mensual no es viable** con 95 grupos activos en los primeros meses. Límites globales congelados | ENGINE §5.8 → [BUILD-PLAN §3.3](BUILD-PLAN.md) |

## Lo primero que hay que escribir

**El test de aislamiento de 60 grupos** (BUILD-PLAN §5, V1): ejecutar el pipeline sobre 60 grupos
aislados y comprobar que sus scores son **idénticos** a los del universo completo. Es el
escenario confirmado del test oculto, y se escribe **antes** que la fórmula.

## Reproducibilidad

Los números **[D]** salen de consultas DuckDB sobre `datasets/`, con el `.venv/` de la raíz
(Python 3.12 + duckdb + pandas + pyarrow).

**Pendiente:** ENGINE §15.1 referencia análisis en `~/Developer/embat-analysis/`, fuera del
repositorio. Mientras siga fuera, sus **[D]** no son reproducibles por el equipo.

**Aviso:** ENGINE.md dice en su cabecera «Este documento no se sube al repo», pero está aquí y el
brief exige repositorio **público**. Decidir a conciencia.
