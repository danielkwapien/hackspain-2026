"""Banco de pruebas comun: mide cualquier version del score siempre igual.

Ejecucion:  .venv/bin/python core/evaluate.py

Cinco metricas, todas sin etiqueta y todas reproducibles. Se ejecuta antes y
despues de cada cambio de formula: si una metrica empeora, el cambio no entra.

  M1  anticipacion   AUC contra un evento observable definido FUERA del score
  M2  estabilidad    Spearman(rank_t, rank_t-1): un ranking que parpadea es ruido
  M3  dispersion     sd y rango: un score que no separa no ordena
  M4  paridad        PSI entre ramas de cobertura: no premiar tener ERP
  M5  aislamiento    60 grupos sueltos dan el mismo score que el universo entero

El evento de M1 es `caja consolidada negativa dos meses seguidos`, y se excluye
a quien ya esta dentro en t: es una prueba hacia delante, no autocorrelacion.
"""

from __future__ import annotations

import json
import math
import statistics as st
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))


# ---------------------------------------------------------------- utilidades
def auc(labels, values) -> tuple[float | None, int, int]:
    """AUC de Mann-Whitney con empates promediados. Valor alto = mas riesgo."""
    pairs = [(v, y) for v, y in zip(values, labels)
             if v is not None and v == v and y is not None and y == y]
    pos = [v for v, y in pairs if y == 1]
    neg = [v for v, y in pairs if y == 0]
    if len(pos) < 5 or len(neg) < 5:
        return None, len(pos), len(neg)
    ordered = sorted(pos + neg)
    rank: dict[float, float] = {}
    i = 0
    while i < len(ordered):
        j = i
        while j + 1 < len(ordered) and ordered[j + 1] == ordered[i]:
            j += 1
        for k in range(i, j + 1):
            rank[ordered[k]] = (i + j) / 2 + 1
        i = j + 1
    total = sum(rank[v] for v in pos)
    return (total - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)), len(pos), len(neg)


def spearman(a: list[float], b: list[float]) -> float | None:
    n = len(a)
    if n < 3:
        return None

    def ranks(xs):
        order = sorted(range(n), key=lambda i: xs[i])
        out = [0.0] * n
        for pos, idx in enumerate(order):
            out[idx] = pos
        return out

    ra, rb = ranks(a), ranks(b)
    ma, mb = sum(ra) / n, sum(rb) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))
    return num / den if den else None


def psi(expected: list[float], actual: list[float], bins: int = 10) -> float | None:
    """Population Stability Index. < 0,1 = distribuciones equivalentes."""
    if len(expected) < 20 or len(actual) < 20:
        return None
    cuts = [st.quantiles(expected, n=bins)[i] for i in range(bins - 1)]
    edges = [-math.inf] + cuts + [math.inf]

    def share(xs):
        counts = [0] * bins
        for x in xs:
            for i in range(bins):
                if edges[i] < x <= edges[i + 1]:
                    counts[i] += 1
                    break
        return [max(c / len(xs), 1e-4) for c in counts]

    e, a = share(expected), share(actual)
    return round(sum((ai - ei) * math.log(ai / ei) for ei, ai in zip(e, a)), 4)


# ------------------------------------------------------------------- metricas
def load_scores(path: Path) -> dict[tuple[str, str], float]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("groups") or payload.get("companies") or []
    out: dict[tuple[str, str], float] = {}
    for row in rows:
        entity = row["entity"]["id"]
        for month in row.get("months", []):
            if month.get("score") is not None:
                out[(entity, month["month"])] = float(month["score"])
    return out


def build_events(panel: pd.DataFrame) -> pd.DataFrame:
    """Evento observable, definido sin mirar ningun score."""
    panel = panel.sort_values(["group_id", "m"]).reset_index(drop=True)
    panel["neg"] = (panel["cash_eom"] < 0).astype(int)
    grouped = panel.groupby("group_id")
    panel["in_event"] = ((panel["neg"] == 1) & (grouped["neg"].shift(1) == 1)).astype(int)

    def forward(series, horizon):
        return series.iloc[::-1].rolling(horizon, min_periods=1).max().iloc[::-1].shift(-1)

    for horizon in (3, 6):
        panel[f"event_{horizon}m"] = panel.groupby("group_id")["in_event"].transform(
            lambda s, h=horizon: forward(s, h))
    return panel


def evaluate(panel: pd.DataFrame, scores: dict, label: str) -> dict:
    panel = panel.copy()
    panel["ym"] = panel["m"].dt.strftime("%Y-%m")
    panel["score"] = [scores.get((g, y)) for g, y in zip(panel["group_id"], panel["ym"])]
    panel["slope3"] = panel["score"] - panel.groupby("group_id")["score"].shift(3)
    panel["buffer_days"] = 30 * panel["cash_eom"] / panel["op_out_mean3"].replace(0, float("nan"))

    report: dict = {"label": label}
    eligible = panel[(panel["months_hist"] >= 6) & (panel["in_event"] == 0)]

    # M1 anticipacion
    report["M1"] = {}
    for horizon in (3, 6):
        subset = eligible[eligible[f"event_{horizon}m"].notna()]
        for name, column in (("score", "score"), ("trend", "slope3"), ("buffer_days", "buffer_days")):
            value, npos, nneg = auc(subset[f"event_{horizon}m"].values, (-subset[column]).values)
            report["M1"][f"{name}@{horizon}m"] = None if value is None else round(value, 3)
        report["M1"][f"n_events@{horizon}m"] = int(subset[f"event_{horizon}m"].sum())

    # M2 estabilidad
    months = sorted(panel["ym"].unique())
    rhos = []
    for prev, cur in zip(months, months[1:]):
        ids = [g for g in panel["group_id"].unique()
               if (g, prev) in scores and (g, cur) in scores]
        if len(ids) < 20:
            continue
        rho = spearman([scores[(g, prev)] for g in ids], [scores[(g, cur)] for g in ids])
        if rho is not None:
            rhos.append(rho)
    deltas = []
    for _, sub in panel.groupby("group_id"):
        series = [s for s in sub["score"].tolist() if s is not None and s == s]
        deltas += [abs(b - a) for a, b in zip(series, series[1:])]
    report["M2"] = {
        "rank_stability": round(sum(rhos) / len(rhos), 3) if rhos else None,
        "median_abs_delta": round(st.median(deltas), 2) if deltas else None,
        "p90_abs_delta": round(sorted(deltas)[int(0.9 * len(deltas))], 2) if deltas else None,
    }

    # M3 dispersion (ultimo mes)
    last = months[-1]
    final = [scores[(g, last)] for g in panel["group_id"].unique() if (g, last) in scores]
    report["M3"] = {
        "n_scored": len(final),
        "median": round(st.median(final), 2) if final else None,
        "sd": round(st.pstdev(final), 2) if len(final) > 1 else None,
        "min": round(min(final), 2) if final else None,
        "max": round(max(final), 2) if final else None,
    }

    # M4 paridad entre ramas de cobertura
    with_inv, without_inv = [], []
    for group_id, sub in panel.groupby("group_id"):
        if (group_id, last) not in scores:
            continue
        has_invoices = sub["ar_iss_cum"].fillna(0).max() > 0 or sub["ap_iss_cum"].fillna(0).max() > 0
        (with_inv if has_invoices else without_inv).append(scores[(group_id, last)])
    report["M4"] = {
        "n_with_invoices": len(with_inv),
        "n_without": len(without_inv),
        "psi": psi(with_inv, without_inv),
        "median_with": round(st.median(with_inv), 2) if with_inv else None,
        "median_without": round(st.median(without_inv), 2) if without_inv else None,
    }
    return report


def print_report(report: dict) -> None:
    print(f"\n{'=' * 62}\n  {report['label']}\n{'=' * 62}")
    m1 = report["M1"]
    print("M1  anticipacion (AUC contra evento observable, mayor es mejor)")
    for horizon in (3, 6):
        print(f"      a {horizon}m  score={m1[f'score@{horizon}m']}  "
              f"trend={m1[f'trend@{horizon}m']}  buffer_days={m1[f'buffer_days@{horizon}m']}"
              f"   (n={m1[f'n_events@{horizon}m']})")
    m2 = report["M2"]
    flag = "OK " if (m2["rank_stability"] or 0) >= 0.90 else "BAJO"
    print(f"M2  estabilidad   rho={m2['rank_stability']} [{flag}]  "
          f"mediana|delta|={m2['median_abs_delta']}  p90={m2['p90_abs_delta']}")
    m3 = report["M3"]
    print(f"M3  dispersion    n={m3['n_scored']}  mediana={m3['median']}  sd={m3['sd']}  "
          f"rango=[{m3['min']}, {m3['max']}]")
    m4 = report["M4"]
    flag4 = "OK " if (m4["psi"] is not None and m4["psi"] < 0.1) else "REVISAR"
    print(f"M4  paridad ramas PSI={m4['psi']} [{flag4}]  "
          f"con facturas={m4['median_with']} (n={m4['n_with_invoices']})  "
          f"sin={m4['median_without']} (n={m4['n_without']})")


def main() -> None:
    from pipeline_embat import build_base, build_panel, connect

    print("Reconstruyendo panel para evaluar...")
    con = connect()
    build_base(con)
    panel = build_events(build_panel(con))

    path = ROOT / "core" / "outputs" / "scores_embat.json"
    if not path.exists():
        raise SystemExit(f"Falta {path}: ejecuta antes core/pipeline_embat.py")
    report = evaluate(panel, load_scores(path), f"embat temporal — {path.name}")
    print_report(report)

    out = ROOT / "core" / "outputs" / "evaluation.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nGuardado {out}")
    print("Compara este fichero antes y despues de cada cambio de formula.")


if __name__ == "__main__":
    main()
