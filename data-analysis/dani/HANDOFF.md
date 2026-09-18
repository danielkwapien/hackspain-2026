# Handoff a Hermes

## Qué está listo

- Auditoría completa en `DATA_QUALITY.md` y `notebooks/01_auditoria.ipynb`.
- Features trazables sociedad/mes/moneda en `exports/v1/features.parquet`.
- Score aditivo v0.3, trayectoria, régimen, cobertura temporal, suficiencia operativa y dos contribuciones independientes en `exports/v1/scores.parquet`.
- Sensibilidad y forecasting ejecutados en `notebooks/03_score_forecasting.ipynb` y `RESULTS.md`.
- Cuatro series reales en `exports/v1/results/<company_id>__<currency>.json`, compatibles con `dashboard-v1` y sin colisiones multidivisa.
- Previews HTML en `artifacts/notebooks/`.

## Comandos verificados

```bash
cd data-analysis/dani
export EMBAT_DATA_DIR=/ruta/al/output
PYTHONPATH=src uv run --locked python -m embat_analysis.audit
PYTHONPATH=src uv run --locked python -m embat_analysis.features
PYTHONPATH=src uv run --locked python -m embat_analysis.scoring
PYTHONPATH=src uv run --locked python -m embat_analysis.forecast
PYTHONPATH=src uv run --locked python -m embat_analysis.exports
PYTHONPATH=src uv run --locked python -m embat_analysis.contract
uv run --locked python notebook_builder.py
uv run --locked jupyter nbconvert --execute --to notebook --inplace --ExecutePreprocessor.timeout=600 notebooks/*.ipynb
PYTHONPATH=src uv run --locked pytest -q
```

## Resultados para transmitir

- 26.261 filas de features; 17.756 puntuadas.
- 13.826 filas disponibles, 3.930 parciales con score y 8.505 insuficientes con score nulo.
- Las 618 filas señaladas con cero inflow/outflow 3m dejan de puntuar; las 1.109 ventanas de flujo cero conservan datos y tienen score nulo.
- Score 70/30: balance operativo simétrico + estabilidad; no usa floors monetarios.
- Sensibilidad: corr 0,973 balance-heavy; 0,958 stability-heavy; diferencia mediana 4,87 puntos en ambas.
- Alertas: 6.347 persistentes; 0 fuera de regímenes persistentes. `possible_blip` no alerta.
- Forecast: media móvil 3m con mediana WAPE por serie 125,8 %; denominadores cero producen null y las métricas monetarias solo se interpretan por moneda.
- Conclusión: score explicable provisional; forecasting auxiliar, no validación de salud.

## Riesgos que deben verse en UI

- No hay dirección fiable de facturas: bloquear DSO/DPO.
- No hay FX verificable: no consolidar grupos ni monedas.
- No hay target oficial: no usar “accuracy”, “probabilidad” ni “default”.
- Ausencia de datos no es cero ni mala salud; siempre mostrar cobertura.
- Cobertura temporal no implica señal financiera suficiente; mostrar `operating_signal_status` y `score_reason`.
- Actividad unilateral o casi unilateral produce score nulo, no salud positiva o negativa.
- `possible_blip` es online; una reversión solo se confirma retrospectivamente.
- `data_cutoff` y `score_as_of` son fechas distintas; no etiquetar un score antiguo como score del corte.

## Siguiente decisión

Integrar primero los cuatro JSON de `exports/v1/results/` y revisar juntos las trayectorias. Cada mes incluye cobertura temporal, suficiencia de señal con inflow/outflow observados, intercepto, contribuciones, clipping y drivers suficientes para reconstruir exactamente nivel y cambio. El exportador limpia resultados obsoletos y `embat_analysis.contract` valida enums, nulos, fechas y aritmética. Si el dashboard acepta el contrato, decidir si genera JSON para todas las series desde `scores.parquet`. Antes de ampliar el motor, preguntar a Embat por dirección de facturas, FX y target del leaderboard.
