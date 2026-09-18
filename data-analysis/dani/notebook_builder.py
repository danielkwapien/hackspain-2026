from collections.abc import Sequence
from pathlib import Path

import nbformat
from nbformat.notebooknode import NotebookNode


def _markdown(text: str) -> NotebookNode:
    return nbformat.v4.new_markdown_cell(text.strip())


def _code(text: str) -> NotebookNode:
    return nbformat.v4.new_code_cell(text.strip())


def _write(path: Path, cells: Sequence[NotebookNode]) -> None:
    notebook = nbformat.v4.new_notebook(
        cells=list(cells),
        metadata={
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {"name": "python", "version": "3.12"},
        },
    )
    nbformat.write(notebook, path)


def main() -> None:
    output = Path("notebooks")
    output.mkdir(parents=True, exist_ok=True)
    setup = """
from pathlib import Path
import duckdb
import matplotlib.pyplot as plt
import numpy as np
import plotly.graph_objects as go
import polars as pl
import pyarrow as pa

ROOT = next(path for path in (Path.cwd(), Path.cwd().parent) if (path / "artifacts").is_dir())
plt.style.use("seaborn-v0_8-whitegrid")
COLORS = {"blue": "#3568D4", "gold": "#C8942F", "orange": "#D96C2F", "charcoal": "#262B33"}
"""
    _write(
        output / "01_auditoria.ipynb",
        [
            _markdown("""
# Auditoría real del dataset Embat v2

## tl;dr

Los recuentos y claves principales cuadran, pero la cobertura temporal es desigual, parte de los movimientos apunta a productos de deuda, los snapshots de saldo usan cinco fechas y la semántica de facturas/FX no permite DSO, DPO ni consolidación fiable. El detalle normativo está en `DATA_QUALITY.md`.
"""),
            _markdown("""
## Context & Methods

### Key Assumptions

- Una ausencia de mes no es actividad cero.
- `created_at` es onboarding, no constitución.
- La auditoría usa los CSV reales y preserva importes por moneda.
"""),
            _code(setup),
            _markdown("## Data\n\nInventario, hashes y controles de clave generados por `embat_analysis.audit`."),
            _code("""
inventory = pl.read_parquet(ROOT / "artifacts/audit/inventory.parquet")
keys = pl.read_parquet(ROOT / "artifacts/audit/primary_keys.parquet")
orphans = pl.read_parquet(ROOT / "artifacts/audit/referential_integrity.parquet")
inventory.select("file", "rows", "bytes"), keys, orphans
"""),
            _markdown("## Results\n\n### Cobertura mensual observada"),
            _code("""
coverage = pl.read_parquet(ROOT / "artifacts/audit/transaction_coverage.parquet")
fig, ax = plt.subplots(figsize=(9, 4.5))
ax.hist(coverage["observed_months"].to_numpy(), bins=np.arange(0.5, 26.5, 1), color=COLORS["blue"], edgecolor="white")
ax.set(title="Meses con movimientos por sociedad", xlabel="Meses observados (máximo calendario: 25)", ylabel="Sociedades")
ax.axvline(19, color=COLORS["orange"], linestyle="--", label="Mediana = 19")
ax.legend()
plt.tight_layout()
plt.show()
coverage["observed_months"].describe()
"""),
            _markdown("### Faltantes estructurales"),
            _code("""
nulls = pl.read_parquet(ROOT / "artifacts/audit/null_profile.parquet")
top_nulls = nulls.filter(pl.col("null_rate") > 0.05).sort("null_rate").tail(12)
fig, ax = plt.subplots(figsize=(9, 5))
labels = (top_nulls["table"] + "." + top_nulls["column"]).to_list()
ax.barh(labels, top_nulls["null_rate"].to_numpy() * 100, color=COLORS["gold"])
ax.set(title="Campos con más del 5 % de nulos", xlabel="Nulos (%)")
ax.set_xlim(0, 105)
plt.tight_layout()
plt.show()
top_nulls.sort("null_rate", descending=True)
"""),
            _markdown("""
## Takeaways

1. El dataset permite análisis de flujo observado por sociedad/mes/moneda.
2. No permite tratar toda ausencia como cero ni asumir 24 meses homogéneos.
3. DSO/DPO, FX consolidado y caja histórica quedan bloqueados hasta resolver semántica y anomalías.
4. La calidad se exporta separada del score financiero.
"""),
        ],
    )
    _write(
        output / "02_eda_features.ipynb",
        [
            _markdown("""
# EDA financiero y features mensuales

## tl;dr

Los flujos están extremadamente concentrados: el 1 % de sociedades concentra aproximadamente el 78,8 % del volumen bruto observado. El análisis evita sumar monedas y usa tres señales de flujo de alta trazabilidad; no interpreta cobros como ingresos ni pagos como gastos.
"""),
            _markdown("""
## Context & Methods

### Key Assumptions

- Solo movimientos `booked` enlazados a un producto bancario con moneda.
- Categorías de financiación, inversión y transferencias no son flujo operativo.
- Las vistas son agregadas; no se incrustan millones de puntos.
"""),
            _code(setup),
            _markdown("## Data\n\nFeatures en grano sociedad/mes/moneda, con meses ausentes explícitos."),
            _code("""
features = pl.read_parquet(ROOT / "data/processed/monthly_features.parquet")
scores = pl.read_parquet(ROOT / "artifacts/score/scores.parquet")
features.shape, scores.shape
"""),
            _markdown("## Results\n\n### Concentración del volumen bruto"),
            _code("""
company_volume = (features.filter(pl.col("is_observed") == 1).group_by("company_id").agg(pl.col("gross_flow").sum().alias("gross_flow")).sort("gross_flow", descending=True).with_row_index("rank"))
company_volume = company_volume.with_columns(((pl.col("gross_flow").cum_sum() / pl.col("gross_flow").sum()) * 100).alias("cumulative_share"))
fig, ax = plt.subplots(figsize=(9, 4.5))
ax.plot((company_volume["rank"] + 1).to_numpy() / company_volume.height * 100, company_volume["cumulative_share"].to_numpy(), color=COLORS["blue"], linewidth=2)
ax.set(title="Concentración acumulada del volumen bruto", xlabel="Sociedades ordenadas por volumen (%)", ylabel="Volumen acumulado (%)", xlim=(0, 100), ylim=(0, 101))
plt.tight_layout()
plt.show()
"""),
            _markdown("### Casos reales de trayectoria del baseline"),
            _code("""
latest = scores.filter(pl.col("score_delta_3m").is_not_null()).sort("company_id", "currency", "month").group_by(["company_id", "currency"], maintain_order=True).tail(1)
stable = latest.filter(pl.col("online_regime") == "stable")
selected = pl.concat([latest.sort("score_delta_3m", "company_id", "currency", descending=[True, False, False]).head(1), latest.sort("score_delta_3m", "company_id", "currency").head(1), stable.sort("score", "company_id", "currency", descending=[True, False, False]).head(1), stable.sort("score", "company_id", "currency").head(1)]).unique(subset=["company_id", "currency"], maintain_order=True)
fig = go.Figure()
for row in selected.iter_rows(named=True):
    case = scores.filter((pl.col("company_id") == row["company_id"]) & (pl.col("currency") == row["currency"]) & pl.col("score").is_not_null()).sort("month")
    fig.add_trace(go.Scatter(x=case["month"].to_list(), y=case["score"].to_list(), mode="lines+markers", name=f"{row['company_id']} · {row['currency']}"))
fig.update_layout(title="Nivel y trayectoria: cuatro escalas y regímenes", xaxis_title="Mes", yaxis_title="Score provisional (0–100)", template="plotly_white", height=480)
fig.show()
selected.select("company_id", "currency", "month", "score", "score_delta_3m", "online_regime", "coverage_ratio")
"""),
            _markdown("""
## Takeaways

1. Las comparaciones deben usar transformaciones robustas; medias de importe crudas quedan dominadas por muy pocas sociedades.
2. Nivel y trayectoria se muestran por separado: una sociedad puede conservar buen nivel y deteriorarse.
3. Los casos extremos son candidatos de revisión, no eventos de default ni verdad supervisada.
"""),
        ],
    )
    _write(
        output / "03_score_forecasting.ipynb",
        [
            _markdown("""
# Score, sensibilidad y forecasting acotado

## tl;dr

El baseline usa balance operativo simétrico y estabilidad de salidas, pero solo cuando existe actividad identificada suficiente en ambos sentidos. Las ventanas sin flujo, unilaterales o casi unilaterales conservan datos observados y reciben score nulo. En forecasting one-step sobre 761 series continuas, la media móvil de 3 meses obtiene la menor mediana de WAPE por serie (125,8 %), todavía insuficiente para prometer previsión precisa.
"""),
            _markdown("""
## Context & Methods

### Key Assumptions

- No hay target oficial: la evaluación del score es sensibilidad y coherencia, no accuracy.
- Cobertura temporal y suficiencia de señal financiera son dimensiones separadas.
- No se usan floors monetarios; el soporte mínimo es relativo e invariante a la escala de moneda.
- Las métricas agregadas de forecasting se normalizan dentro de cada serie sociedad/moneda antes de agregarse.
- El forecasting usa solo historia anterior a cada origen y exige 15 meses consecutivos.
- Las métricas se calculan por sociedad/moneda; no se mezclan divisas.
"""),
            _code(setup),
            _markdown("## Data"),
            _code("""
scores = pl.read_parquet(ROOT / "artifacts/score/scores.parquet")
sensitivity = pl.read_parquet(ROOT / "artifacts/score/sensitivity.parquet")
forecast_metrics = pl.read_parquet(ROOT / "artifacts/forecast/metrics.parquet")
forecast_currency_metrics = pl.read_parquet(ROOT / "artifacts/forecast/metrics_by_currency.parquet")
quality = scores.group_by("quality_status").agg(pl.len().alias("rows"), pl.col("score").is_null().sum().alias("null_scores")).sort("quality_status")
reasons = scores.filter(pl.col("score").is_null()).group_by("score_reason").len().sort("len", descending=True)
quality, reasons, forecast_metrics
"""),
            _markdown("## Results\n\n### Sensibilidad a pesos"),
            _code("""
wide = sensitivity.filter(pl.col("score").is_not_null()).select("company_id", "month", "currency", "score_variant", "score").pivot(on="score_variant", index=["company_id", "month", "currency"], values="score")
fig, axes = plt.subplots(1, 2, figsize=(11, 4.5), sharex=True, sharey=True)
for axis, variant, color in zip(axes, ["balance_heavy", "stability_heavy"], [COLORS["blue"], COLORS["gold"]]):
    axis.scatter(wide["baseline"].to_numpy(), wide[variant].to_numpy(), s=5, alpha=0.15, color=color)
    axis.plot([0, 100], [0, 100], color=COLORS["charcoal"], linestyle="--")
    axis.set(title=variant, xlabel="Baseline", ylabel="Variante", xlim=(0, 100), ylim=(0, 100))
plt.tight_layout()
plt.show()
wide.select(pl.corr("baseline", "balance_heavy").alias("corr_balance"), pl.corr("baseline", "stability_heavy").alias("corr_stability"), (pl.col("baseline")-pl.col("balance_heavy")).abs().median().alias("median_abs_diff_balance"), (pl.col("baseline")-pl.col("stability_heavy")).abs().median().alias("median_abs_diff_stability"))
"""),
            _markdown("### Forecasting one-step: 3 meses finales"),
            _code("""
metrics = forecast_metrics.sort("median_series_wape")
fig, ax = plt.subplots(figsize=(8, 4.5))
ax.bar(metrics["model"].to_list(), metrics["median_series_wape"].to_numpy() * 100, color=[COLORS["blue"], COLORS["gold"], COLORS["orange"]])
ax.set(title="Error normalizado por serie", xlabel="Modelo", ylabel="Mediana WAPE por serie (%)")
ax.set_ylim(0, max(metrics["median_series_wape"].to_numpy() * 100) * 1.15)
plt.tight_layout()
plt.show()
metrics, forecast_currency_metrics.filter(pl.col("currency").is_in(["EUR", "USD", "GBP"])).sort("currency", "wape_within_currency")
"""),
            _markdown("""
## Takeaways

1. Recomendación: usar el score de dos pilares como baseline explicable provisional y exponer nivel, trayectoria, cobertura y suficiencia operativa.
2. No puntuar ventanas sin actividad bilateral identificable; la ausencia de salidas no es mala salud ni fortaleza.
3. No vender forecasting de flujo neto como validación de salud: el mejor baseline sigue teniendo error alto y cubre solo series continuas. MAE solo se interpreta dentro de cada moneda.
4. La siguiente decisión que más valor aporta es resolver dirección de facturas y target oficial, no añadir modelos complejos.
"""),
        ],
    )


if __name__ == "__main__":
    main()
