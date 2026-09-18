# Resultados ejecutados — Embat v2

Fecha de corte analítico: 18 de septiembre de 2026. Todos los resultados proceden de los CSV reales. No hay etiquetas oficiales ni lista de test en el ZIP o en las copias locales inspeccionadas.

## Resumen accionable

1. El dataset soporta un baseline de salud de flujo por sociedad/mes/moneda, no un score contable completo ni una probabilidad de default.
2. La mejor primera vertical para el dashboard es: nivel 0–100 provisional + delta 3m + régimen online + dos contribuciones independientes + cobertura temporal y suficiencia financiera separadas.
3. Facturas y FX son el mayor bloqueo de valor: sin dirección emitida/recibida no hay DSO/DPO defendible; sin convención FX no hay consolidación de grupo.
4. El forecasting de flujo neto aporta una señal auxiliar, pero el mejor baseline mantiene una mediana de WAPE por serie de 125,8 %. No debe venderse como validación del score.
5. La siguiente hora de trabajo aporta más valor resolviendo semántica/target con Embat que añadiendo modelos complejos.

## Hechos verificados

- Los ocho CSV y todos los recuentos del diccionario coinciden exactamente.
- Claves principales únicas y relaciones grupo/sociedad limpias.
- 184.941 movimientos no enlazan con productos bancarios; 183.627 de ellos sí enlazan con deuda y 1.314 con ninguno.
- Cobertura por sociedad: 1–25 meses, mediana 19; p10 8, p25 10, p75 24, p90 25.
- Los snapshots de saldo usan cinco fechas; 16 filas son anteriores a 2026-09-01.
- De 87 calendarios de deuda, 87 enlazan con deuda y 77 con cuenta de liquidación.
- La dirección de factura no puede inferirse de forma fiable por signo o `document_type`.
- El 1 % de sociedades concentra 78,8 % del volumen bruto observado; el 5 %, 93,5 %. La escala exige vistas robustas y segmentadas.

## Features y cobertura

Se materializaron 26.261 filas sociedad/mes/moneda. 1.278 de 1.286 sociedades tienen movimientos booked enlazados a producto bancario con moneda demostrable. El baseline puntúa 17.756 filas: 13.826 son `available`, 3.930 `partial` y 8.505 `insufficient_data`. Todas las filas `available` y `partial` tienen score; todas las `insufficient_data` tienen `score = null`.

La cobertura temporal ya no implica señal financiera suficiente. Motivos de insuficiencia: 3.816 ventanas con menos de 3 meses, 2.751 ventanas con actividad operativa en un solo sentido, 1.287 con un lado inferior al 1 % del otro, 619 sin actividad operativa identificada y 32 sin balance operativo calculable. Las 618 filas señaladas por Hermes dejan de puntuar; las 1.109 ventanas con inflow y outflow 3m iguales a cero tienen ahora score nulo, incluyendo las que además carecen de historia mínima.

Las señales puntuadas son:

- balance simétrico de flujo operativo a 3 meses, calculado solo con señal bilateral suficiente;
- estabilidad de salidas a 6 meses.

Se eliminaron todos los floors monetarios. `operating_flow_balance_3m = (inflow - outflow) / (inflow + outflow)` es adimensional y solo existe cuando ambos lados están presentes y el menor alcanza al menos el 1 % del mayor. `inflow_outflow_ratio_3m` permanece descriptivo y es nulo cuando no hay soporte suficiente. Una empresa sin salidas no recibe un resultado negativo ni positivo: recibe `score = null` y `one_sided_operating_activity`.

Cobertura, conciliación, nulos y categorización no restan puntos de salud. La fórmula y los campos bloqueados están en `FEATURE_DICTIONARY.md`.

## Comparación de tesis

| Experimento | Evidencia ejecutada | Resultado | Lectura |
|---|---:|---:|---|
| Score aditivo baseline 70/30 | 17.756 filas puntuadas | media 50,27; mediana 54,20; rango 0,30–98,31 | balance operativo suficiente + estabilidad; no calibrado |
| Pesos balance-heavy 85/15 | mismas filas | correlación 0,973; diferencia absoluta mediana 4,87 | sensibilidad hacia balance operativo |
| Pesos stability-heavy 55/45 | mismas filas | correlación 0,958; diferencia absoluta mediana 4,87 | sensibilidad hacia estabilidad |
| Naive last, 1-step | 2.283 predicciones, 761 series sociedad/moneda | mediana WAPE por serie 160,3 %; mean sMAPE 141,0 % | suelo débil |
| Media móvil 3m, 1-step | mismo conjunto | mediana WAPE por serie 125,8 %; mean sMAPE 138,8 % | mejor agregado normalizado, error todavía alto |
| Estacional 12m, 1-step | mismo conjunto | mediana WAPE por serie 145,6 %; mean sMAPE 152,6 % | no mejora de forma general |

Las métricas transversales se calculan primero por serie sociedad/moneda y luego se agregan con igual peso por serie. Los periodos con denominador cero producen WAPE/sMAPE nulos, no un ratio fabricado. La media de WAPE por serie sigue dominada por denominadores pequeños, por lo que la mediana es la lectura principal. MAE solo se publica dentro de cada moneda. Por ejemplo, WAPE within-currency de la media móvil es 71,5 % en EUR, 124,8 % en USD y 125,4 % en GBP; el mejor modelo no es uniforme en todas las monedas.

## Trayectoria y bache frente a cambio persistente

En el último punto puntuable de 1.390 series sociedad/moneda: 350 mejoran, 545 deterioran, 264 están estables y 231 no tienen historia puntuable para delta 3m. El filtro clasifica 241 como mejora persistente, 422 como deterioro persistente, 584 estables y 143 como posible bache.

Se identifican 471 reversiones retrospectivas candidatas a lo largo de la historia. Esta etiqueta usa meses futuros exclusivamente para evaluación; no se exporta como conocimiento online. En tiempo real solo se muestra `possible_blip` hasta observar la reversión.

Las alertas exigen régimen persistente y |delta 3m| ≥ 8: 6.347 alertas históricas, 3.051 de deterioro y 3.296 de mejora. Alertas fuera de regímenes persistentes: 0. Los shocks y `possible_blip` no generan alertas.

## Hipótesis comprobadas o refutadas

- **Comprobada:** los flujos se pueden agregar de forma reproducible a sociedad/mes/moneda sin cruzar tablas de hechos ni multiplicar importes.
- **Comprobada:** nivel y trayectoria se separan; existen casos con niveles parecidos y deltas opuestos.
- **Comprobada:** cobertura temporal sin actividad operativa identificada no basta para puntuar; las 618 filas señaladas dejan de recibir estabilidad favorable.
- **Comprobada:** los ratios simétricos y los umbrales relativos son invariantes a la escala de la moneda; los floors absolutos no lo eran.
- **Refutada:** una estacionalidad anual simple no mejora el forecast; es peor que naive y media móvil.
- **Refutada:** `balances.date` no es una fecha única para todo el snapshot.
- **Bloqueada:** DSO/DPO y aging direccional por falta de sentido de factura.
- **Bloqueada:** consolidación de grupo y caja transferible por FX/semántica intercompany no resueltos.
- **Bloqueada:** evaluación predictiva oficial por ausencia de target, formato y test.

## Recomendación para producto y contrato del dashboard

Usar `score-v0.3-operating-sufficiency` como motor provisional y rotularlo explícitamente. En empresa mostrar:

- score actual y serie mensual por moneda;
- trayectoria/delta 3m separado del nivel;
- `online_regime` y alertas solo para cambios persistentes;
- dos contribuciones, intercepto, ajuste de clipping y sus deltas mensuales;
- `quality_status`, `coverage_ratio`, `operating_signal_status`, corte y `basis = observed`;
- ninguna consolidación de grupo ni conversión FX;
- `data_cutoff` separado de `score_as_of`; si difieren, estado `partial` y motivo explícito;
- forecast en bloque separado y solo cuando la serie cumpla cobertura.

Los resultados usan clave y fichero `<company_id>__<currency>` para evitar colisiones. El exportador elimina JSON obsoletos y el validador comprueba enums, estados, nulos y reconstrucción exacta de nivel/cambio contra `dashboard-v1`. La revisión encontró cinco nombres antiguos: cuatro casos previos y un `COMP_1122.json` obsoleto. Tras dos ejecuciones consecutivas quedan exactamente cuatro ficheros y la segunda no elimina ninguno.

No mostrar umbrales de riesgo “sano/tensión”, probabilidad de impago, DSO/DPO, runway o deuda histórica hasta resolver los bloqueos. El contrato `dashboard-v1` se respeta en los cuatro JSON de ejemplo; el dataset completo queda en Parquet para que la sesión del dashboard decida su ingestión sin duplicar cálculos.

## Preguntas a la organización

1. Campo/regla de emitida frente a recibida.
2. Dirección/base de `exchange_rate` y moneda de `transactions.amount`.
3. Target, unidad, métrica y formato del leaderboard oculto.
4. Semántica de movimientos que apuntan a deuda y productos ausentes.
5. Tratamiento esperado de fechas imposibles, pendientes negativos y outliers extremos del generador.
