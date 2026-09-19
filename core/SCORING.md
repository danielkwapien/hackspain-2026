# Cálculo del score

El motor genera un score mensual de salud financiera por grupo entre 0 y 100. Un valor mayor representa
mejor salud observada, no una probabilidad de impago.

## Cálculo

1. Cada señal cruda se transforma a puntos de 0 a 100 con umbrales financieros fijos.
2. Las señales disponibles se combinan dentro de sus cinco pilares.
3. Si faltan señales, el pilar se aproxima hacia 50 para no premiar la falta de información.
4. Los pilares se suavizan con una media exponencial para reducir el ruido mensual.
5. Se combinan con estos pesos: liquidez 25 %, pagos 20 %, cobros 15 %, deuda 20 % y actividad 20 %.
6. Si falta algún pilar, el resultado vuelve a aproximarse hacia 50.
7. Un pilar especialmente débil aplica una penalización al resultado final.

Bandas: `solid` ≥ 80, `healthy` ≥ 60, `watch` ≥ 40 y `stress` < 40. No se publica score con menos de
tres meses observados o menos del 50 % de cobertura.

## Trayectoria

La dirección se obtiene de la pendiente reciente del score: `improving`, `stable` o `deteriorating`.
El régimen exige persistencia y puede ser `warmup`, `stable`, `improving`, `deteriorating` o
`shock_pending`. La alerta temprana se calcula aparte usando el colchón de caja.

## Output

`core/outputs/scores_embat.json` contiene los 250 grupos. Para cada grupo incluye el score actual, banda,
24 meses de histórico, trayectoria, cobertura, confianza, pilares, métricas, penalización, principales
drivers y alerta temprana. Los campos `alerts` y `forecast` están reservados para futuras versiones.
