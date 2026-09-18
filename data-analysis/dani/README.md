# Análisis de Dani

Análisis ejecutado del dataset Embat v2: auditoría, EDA, features mensuales, score explicable, sensibilidad, forecasting acotado y exports compatibles con el contrato del dashboard.

## Entorno preparado

Python 3.12 fijado mediante `.python-version`; dependencias en `pyproject.toml` y `uv.lock`.

```bash
cd /ruta/al/repo/data-analysis/dani
uv sync --locked
export EMBAT_DATA_DIR=/ruta/al/output
```

Instalados: pandas, Polars, PyArrow, DuckDB, NumPy, SciPy, scikit-learn, statsmodels, numpy-financial, Pandera, Plotly, Matplotlib, Seaborn, JupyterLab, ipykernel, nbformat, nbconvert, StatsForecast, MLForecast, LightGBM, CatBoost, SHAP, ruptures y pytest. NumPy/Numba/llvmlite quedan resueltos en el lock; Numba y llvmlite tienen mínimos explícitos para evitar resolución a versiones antiguas incompatibles.

En macOS LightGBM necesita `libomp`; instalado mediante Homebrew en esta máquina. Verificados imports de las 24 librerías principales y fit/predict de LightGBM, CatBoost, StatsForecast y MLForecast, más una cuota numpy-financial sobre datos sintéticos de smoke. No son métricas del reto.

No se han instalado PyTorch, TimesFM ni Chronos ni descargado pesos: Codex puede añadirlos con `uv add` si una hipótesis concreta lo justifica, tras comprobar licencia y recursos.

## Reproducción end-to-end

```bash
PYTHONPATH=src uv run --locked python -m embat_analysis.audit
PYTHONPATH=src uv run --locked python -m embat_analysis.features
PYTHONPATH=src uv run --locked python -m embat_analysis.scoring
PYTHONPATH=src uv run --locked python -m embat_analysis.forecast
PYTHONPATH=src uv run --locked python -m embat_analysis.exports
PYTHONPATH=src uv run --locked python -m embat_analysis.contract
uv run --locked python notebook_builder.py
uv run --locked jupyter nbconvert --execute --to notebook --inplace \
  --ExecutePreprocessor.timeout=600 notebooks/*.ipynb
PYTHONPATH=src uv run --locked pytest -q
```

Los módulos usan solo el entorno de `uv`; no se ha modificado el lock ni añadido dependencias. Los cálculos tabulares usan Polars/DuckDB/NumPy/PyArrow, sin pandas.

## Entregables

| Ruta | Contenido |
|---|---|
| `notebooks/01_auditoria.ipynb` | inventario, claves, cobertura, nulos y anomalías |
| `notebooks/02_eda_features.ipynb` | concentración de flujos, casos y features mensuales |
| `notebooks/03_score_forecasting.ipynb` | score, sensibilidad y comparación de forecasts |
| `DATA_QUALITY.md` | dictamen completo de fiabilidad y bloqueos |
| `FEATURE_DICTIONARY.md` | fórmulas, unidad, signo, ventana y look-ahead |
| `RESULTS.md` | resultados ejecutados y recomendación |
| `HANDOFF.md` | resumen operativo para Hermes/dashboard |
| `exports/v1/manifest.json` | versión, hashes, límites y métricas |
| `exports/v1/features.parquet` | features completas, grano sociedad/mes/moneda |
| `exports/v1/scores.parquet` | score, contribuciones, trayectoria y cobertura |
| `exports/v1/results/<company_id>__<currency>.json` | cuatro series reales compatibles con `dashboard-v1`, sin colisión multidivisa |
| `artifacts/notebooks/*.html` | previews renderizados de los notebooks |

`data/` y `artifacts/` están ignorados porque contienen intermedios y artefactos regenerables. Los exports ligeros son la frontera propuesta con el dashboard; la API no debe recalcular finanzas.

## Validación

La suite cubre signos, agregación previa a joins, preservación de moneda, exclusión de pending, ventanas sin look-ahead, cobertura separada de salud, aditividad del score, series discontinuas y serialización de contribuciones ausentes. Los notebooks se ejecutaron desde kernel limpio y sus HTML/figuras fueron inspeccionados.

No hacer commit/push global ni tocar el dashboard desde este workspace. La coordinación final la hace Dani con Hermes.
