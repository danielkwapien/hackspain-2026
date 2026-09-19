"""Motor temporal de salud financiera por GRUPO, con replay de 24 meses.

Ejecucion:  .venv/bin/python core/pipeline_embat.py

Lee los 8 CSV de datasets/ (incluido transactions, que el baseline estatico no
usa) y escribe core/outputs/scores_embat.json con el mismo contrato que
core/pipeline.py, salvo que la entidad es el grupo y `months` trae la serie
mensual completa en vez de una sola foto.

Todo se calcula point-in-time: la fila del mes M solo mira hechos con fecha
<= fin de M. Las anclas son absolutas, asi que el resultado de un grupo no
cambia si el fichero trae menos grupos.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from datastore import DataStore, ParquetCache, validate  # noqa: E402
from signals import attach_group_signals, calculate_signals, specs_by_pillar  # noqa: E402
from engine import (  # noqa: E402
    MODEL_VERSION,
    Trace,
    finalise,
    band_for,
    build_drivers,
    early_warning,
    narrative,
    score_panel as run_scoring,
    trajectory_for,
)
from engine.config import PILLAR_WEIGHTS  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "core" / "outputs"

START_MONTH = "2024-09-01"
END_MONTH = "2026-08-01"          # 2026-09 es un solo dia: se descarta
LIQUIDITY_TYPES = ("checking", "saving", "wallet")
REVOLVING_TYPES = ("lineofcredit", "confirming", "factoring")
DATE_LO, DATE_HI = "2024-01-01", "2028-01-01"


def connect(data_root: str | Path | None = None, use_cache: bool = True,
            strict: bool = True) -> duckdb.DuckDBPyConnection:
    """Abre el dataset y deja sus tablas como vistas.

    `data_root` es lo que permite ejecutar esto sobre los datos de la
    organizacion sin tocar codigo. Por defecto lee EMBAT_DATA_ROOT y, si no
    esta, `datasets/` del repositorio.
    """
    store = DataStore(data_root)
    print(f"Dataset: {store.root}")
    if use_cache:
        cache = ParquetCache(store)
        for name in ("groups", "companies", "banking_products", "debt_products",
                     "balances", "invoices", "transactions"):
            cache.register(name)
    else:
        store.register_all()

    findings = validate(store, strict=strict)
    for finding in findings:
        print(f"  {finding}")

    con = store.con
    con.execute("CREATE OR REPLACE VIEW bank_products AS SELECT * FROM banking_products")
    return con


def build_base(con: duckdb.DuckDBPyConnection) -> None:
    """Spine de meses, mapa sociedad->grupo y movimientos normalizados a EUR."""
    con.sql(f"""
        CREATE TABLE months AS
        SELECT gs.m::DATE AS m FROM generate_series(DATE '{START_MONTH}', DATE '{END_MONTH}',
            INTERVAL 1 MONTH) gs(m);

        CREATE TABLE cmap AS SELECT company_id, group_id FROM companies;

        CREATE TABLE tx AS
        SELECT t.transaction_id, c.group_id, t.company_id, t.product_id,
               date_trunc('month', t.date)::DATE AS m,
               t.date::DATE AS d,
               t.amount * coalesce(t.exchange_rate, 1) AS amt,
               coalesce(nullif(t.category, '-'), 'uncategorised') AS cat
        FROM transactions t JOIN cmap c USING (company_id)
        WHERE t.date >= DATE '{START_MONTH}' AND t.date < DATE '2026-09-01';
    """)
    # Intercompany: transferencias espejo entre dos sociedades del mismo grupo.
    # Se restringe a `transfer` porque es donde vive el flujo interno y mantiene
    # el self-join barato.
    con.sql("""
        CREATE TABLE intercompany AS
        WITH tr AS (SELECT * FROM tx WHERE cat = 'transfer')
        SELECT DISTINCT a.transaction_id
        FROM tr a JOIN tr b
          ON a.group_id = b.group_id
         AND a.company_id <> b.company_id
         AND abs(a.amt + b.amt) < 0.01
         AND abs(date_diff('day', a.d, b.d)) <= 3;
    """)


# Los importes se redondean a centimos en cada agregacion. DuckDB suma en
# paralelo y la suma en coma flotante NO es asociativa, asi que el mismo
# fichero da totales que difieren en ~1e-4 entre ejecuciones. Sobre saldos de
# 1e11 eso es ruido de representacion, pero basta para cruzar un ancla y mover
# el score 25 puntos. El dinero es exacto: se redondea y deja de pasar.
def monthly_flows(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.sql("""
        SELECT group_id, m,
          round(sum(CASE WHEN amt > 0 AND cat <> 'transfer' AND ic.transaction_id IS NULL
                   THEN amt ELSE 0 END), 2) AS op_in,
          round(sum(CASE WHEN amt < 0 AND cat NOT IN ('transfer','debt_repayment') AND ic.transaction_id IS NULL
                   THEN -amt ELSE 0 END), 2) AS op_out,
          round(sum(CASE WHEN cat = 'debt_repayment' THEN abs(amt) ELSE 0 END), 2) AS debt_rep,
          round(sum(CASE WHEN cat IN ('fee','interest_charge') THEN abs(amt) ELSE 0 END), 2) AS feeint,
          max(CASE WHEN cat = 'social_security' THEN 1 ELSE 0 END) AS has_ss,
          max(CASE WHEN cat = 'tax' THEN 1 ELSE 0 END) AS has_tax,
          count(*) AS n_tx
        FROM tx LEFT JOIN intercompany ic USING (transaction_id)
        GROUP BY 1, 2
    """).df()


def monthly_cash(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Caja fin de mes reconstruida hacia atras desde la foto de 2026-09-01."""
    con.sql(f"""
        CREATE TABLE liq AS
        SELECT p.product_id, p.company_id, c.group_id
        FROM bank_products p JOIN cmap c USING (company_id)
        WHERE p.type IN {LIQUIDITY_TYPES};

        CREATE TABLE anchor AS
        SELECT l.product_id, l.group_id, b.balance AS final_bal
        FROM liq l JOIN balances b USING (product_id);

        CREATE TABLE pflow AS
        SELECT t.product_id, t.m, round(sum(t.amt), 2) AS flow
        FROM tx t JOIN liq USING (product_id) GROUP BY 1, 2;
    """)
    return con.sql("""
        WITH grid AS (
          SELECT a.product_id, a.group_id, a.final_bal, mo.m, coalesce(f.flow, 0) AS flow
          FROM anchor a CROSS JOIN months mo
          LEFT JOIN pflow f ON f.product_id = a.product_id AND f.m = mo.m),
        bal AS (
          SELECT product_id, group_id, m,
                 round(final_bal - coalesce(sum(flow) OVER (
                   PARTITION BY product_id ORDER BY m
                   ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING), 0), 2) AS bal_eom
          FROM grid)
        SELECT group_id, m, round(sum(bal_eom), 2) AS cash_eom FROM bal GROUP BY 1, 2
    """).df()


def monthly_invoices(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Agregados de factura as-of, por acumulados de altas y bajas.

    Una factura esta viva desde que se emite hasta que se cobra/paga; esta
    vencida desde su vencimiento hasta ese mismo momento. Acumular altas y
    bajas por mes reproduce el estado en cada corte sin usar `pending_amount`,
    que es una foto final y no sirve para meses pasados.
    """
    con.sql(f"""
        CREATE TABLE iv AS
        SELECT c.group_id,
               CASE WHEN i.amount > 0 THEN 'ar' ELSE 'ap' END AS side,
               abs(i.amount * coalesce(i.exchange_rate, 1)) AS amt,
               date_trunc('month', i.issuance_date)::DATE AS m_iss,
               date_trunc('month', i.due_date)::DATE AS m_due,
               CASE WHEN i.status = 'paid'
                     AND i.payment_date BETWEEN DATE '{DATE_LO}' AND DATE '{DATE_HI}'
                    THEN date_trunc('month', i.payment_date)::DATE END AS m_pay,
               CASE WHEN i.status = 'paid'
                     AND i.payment_date BETWEEN DATE '{DATE_LO}' AND DATE '{DATE_HI}'
                    THEN greatest(date_diff('day', i.due_date, i.payment_date), 0) END AS days_late
        FROM invoices i JOIN cmap c USING (company_id)
        WHERE i.document_type IN ('invoice','invoiceGroup')
          AND i.amount <> 0
          AND i.issuance_date BETWEEN DATE '{DATE_LO}' AND DATE '{DATE_HI}'
          AND i.due_date BETWEEN DATE '{DATE_LO}' AND DATE '{DATE_HI}';
    """)
    issued = con.sql("SELECT group_id, side, m_iss AS m, round(sum(amt), 2) v FROM iv GROUP BY 1,2,3").df()
    paid = con.sql("SELECT group_id, side, m_pay AS m, round(sum(amt), 2) v FROM iv WHERE m_pay IS NOT NULL GROUP BY 1,2,3").df()
    due = con.sql("SELECT group_id, side, m_due AS m, round(sum(amt), 2) v FROM iv GROUP BY 1,2,3").df()
    # solo deja de estar vencida la que se pago despues de vencer
    cured = con.sql("""SELECT group_id, side, m_pay AS m, round(sum(amt), 2) v FROM iv
                       WHERE m_pay IS NOT NULL AND days_late > 0 GROUP BY 1,2,3""").df()
    late = con.sql("""SELECT group_id, side, m_pay AS m,
                        round(sum(amt), 2) paid_amt,
                        round(sum(CASE WHEN days_late > 0 THEN amt ELSE 0 END), 2) late_amt,
                        round(sum(days_late * amt) / nullif(sum(amt), 0), 4) AS days_late_w
                      FROM iv WHERE m_pay IS NOT NULL GROUP BY 1,2,3""").df()
    return {"issued": issued, "paid": paid, "due": due, "cured": cured, "late": late}


def loc_utilisation(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.sql(f"""
        SELECT c.group_id,
               sum(abs(coalesce(d.outstanding, 0))) / nullif(sum(abs(d.granted)), 0) AS loc_utilisation
        FROM debt_products d JOIN cmap c USING (company_id)
        WHERE d.type IN {REVOLVING_TYPES} AND d.granted IS NOT NULL AND abs(d.granted) > 0
        GROUP BY 1
    """).df()


def pivot_cum(frame: pd.DataFrame, spine: pd.DataFrame, side: str, name: str) -> pd.DataFrame:
    """Acumulado por grupo y mes de una serie de altas/bajas."""
    sub = frame[frame["side"] == side][["group_id", "m", "v"]] if "side" in frame else frame
    out = spine.merge(sub, on=["group_id", "m"], how="left").fillna({"v": 0.0})
    out = out.sort_values(["group_id", "m"])
    out[name] = out.groupby("group_id")["v"].cumsum()
    return out[["group_id", "m", name]]


def build_panel(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    flows = monthly_flows(con)
    cash = monthly_cash(con)
    inv = monthly_invoices(con)
    loc = loc_utilisation(con)
    # Moneda dominante y tamaño societario aportan contexto estable para formar
    # sectores financieros comparables, aun cuando el reto no proporciona CNAE.
    profile = con.sql("""
        SELECT group_id, mode(currency) AS group_currency,
               count(*) AS group_company_count
        FROM companies GROUP BY group_id
    """).df()

    all_groups = con.sql("SELECT group_id FROM groups").df()
    months = con.sql("SELECT m FROM months").df()
    spine = all_groups.merge(months, how="cross")
    spine["m"] = pd.to_datetime(spine["m"])
    for frame in (flows, cash, loc):
        if "m" in frame:
            frame["m"] = pd.to_datetime(frame["m"])
    for key in inv:
        inv[key]["m"] = pd.to_datetime(inv[key]["m"])

    p = spine.merge(flows, on=["group_id", "m"], how="left").merge(cash, on=["group_id", "m"], how="left")
    p = p.sort_values(["group_id", "m"]).reset_index(drop=True)
    for col in ("op_in", "op_out", "debt_rep", "feeint", "has_ss", "has_tax", "n_tx"):
        p[col] = p[col].fillna(0.0)

    # meses observados hasta el corte (historia disponible en ese mes)
    p["active"] = (p["n_tx"] > 0).astype(int)
    p["months_hist"] = p.groupby("group_id")["active"].cumsum()

    g = p.groupby("group_id")
    p["op_in_3m"] = g["op_in"].transform(lambda s: s.rolling(3, min_periods=1).sum())
    p["op_out_3m"] = g["op_out"].transform(lambda s: s.rolling(3, min_periods=1).sum())
    p["op_out_mean3"] = g["op_out"].transform(lambda s: s.rolling(3, min_periods=1).mean())
    p["op_in_prev3"] = g["op_in_3m"].transform(lambda s: s.shift(3))
    p["debt_rep_3m"] = g["debt_rep"].transform(lambda s: s.rolling(3, min_periods=1).sum())
    p["feeint_3m"] = g["feeint"].transform(lambda s: s.rolling(3, min_periods=1).sum())
    p["inflow_std3"] = g["op_in"].transform(lambda s: s.rolling(3, min_periods=3).std())
    p["inflow_mean3"] = g["op_in"].transform(lambda s: s.rolling(3, min_periods=3).mean())
    p["ss_6m"] = g["has_ss"].transform(lambda s: s.rolling(6, min_periods=1).sum())
    p["ss_hist"] = g["has_ss"].transform(lambda s: s.cumsum())
    p["tax_12m"] = g["has_tax"].transform(lambda s: s.rolling(12, min_periods=1).sum())
    p["tax_hist"] = g["has_tax"].transform(lambda s: s.cumsum())
    p["active_6m"] = g["active"].transform(lambda s: s.rolling(6, min_periods=1).sum())
    p["cash_neg"] = (p["cash_eom"] < 0).astype(float)
    p["neg_cash_share"] = g["cash_neg"].transform(lambda s: s.rolling(3, min_periods=1).mean())
    p["cash_mean3"] = g["cash_eom"].transform(lambda s: s.rolling(3, min_periods=1).mean())
    p["cash_prev3"] = g["cash_mean3"].transform(lambda s: s.shift(3))

    # facturas: acumulados as-of
    base = p[["group_id", "m"]].copy()
    for side in ("ar", "ap"):
        iss = pivot_cum(inv["issued"], base, side, f"{side}_iss_cum")
        pay = pivot_cum(inv["paid"], base, side, f"{side}_pay_cum")
        due = pivot_cum(inv["due"], base, side, f"{side}_due_cum")
        cur = pivot_cum(inv["cured"], base, side, f"{side}_cured_cum")
        for frame in (iss, pay, due, cur):
            p = p.merge(frame, on=["group_id", "m"], how="left")
        p[f"{side}_open"] = (p[f"{side}_iss_cum"] - p[f"{side}_pay_cum"]).clip(lower=0)
        p[f"{side}_overdue"] = (p[f"{side}_due_cum"] - p[f"{side}_cured_cum"]
                                - (p[f"{side}_pay_cum"] - p[f"{side}_cured_cum"]).clip(lower=0)).clip(lower=0)
        p[f"{side}_overdue"] = p[[f"{side}_overdue", f"{side}_open"]].min(axis=1)
        lt = inv["late"][inv["late"]["side"] == side][["group_id", "m", "paid_amt", "late_amt", "days_late_w"]]
        lt = lt.rename(columns={c: f"{side}_{c}" for c in ("paid_amt", "late_amt", "days_late_w")})
        p = p.merge(lt, on=["group_id", "m"], how="left")
        gg = p.groupby("group_id")
        p[f"{side}_paid3"] = gg[f"{side}_paid_amt"].transform(lambda s: s.rolling(3, min_periods=1).sum())
        p[f"{side}_late3"] = gg[f"{side}_late_amt"].transform(lambda s: s.rolling(3, min_periods=1).sum())
        p[f"{side}_dlw3"] = gg[f"{side}_days_late_w"].transform(lambda s: s.rolling(3, min_periods=1).mean())
        p[f"{side}_iss3"] = gg[f"{side}_iss_cum"].transform(lambda s: s - s.shift(3))

    p["buffer_days_raw"] = (30.0 * p["cash_eom"] / p["op_out_mean3"].where(p["op_out_mean3"] > 0)).clip(lower=0.0)
    p = p.merge(loc, on="group_id", how="left").merge(profile, on="group_id", how="left")
    last3 = sorted(p["m"].unique())[-3:]
    p["loc_utilisation"] = p["loc_utilisation"].where(p["m"].isin(last3))
    return p


def score_panel(panel: pd.DataFrame) -> pd.DataFrame:
    """Delega en el paquete `scoring`.

    El pipeline prepara el panel y calcula las senales; decidir que significan
    esos numeros es trabajo de `engine/`, donde cada capa es un modulo y todo
    lo ajustable vive en `engine/config.py`.
    """
    ordered = panel.sort_values(["group_id", "m"])
    calculated = calculate_signals(ordered)
    return run_scoring(ordered, calculated, specs_by_pillar(),
                       extras={"buffer_days": "buffer_days_raw",
                               "loc_utilisation": "loc_utilisation"})


def build_results(scored: pd.DataFrame) -> list[dict]:
    results = []
    for group_id, sub in scored.groupby("group_id"):
        sub = sub.sort_values("m")
        series = [None if r["score"] is None or pd.isna(r["score"]) else float(r["score"])
                  for _, r in sub.iterrows()]
        months = [{"month": r["m"].strftime("%Y-%m"),
                   "score": None if r["score"] is None or pd.isna(r["score"]) else float(r["score"]),
                   "confidence": float(r["confidence"]),
                   "basis": "point_in_time",
                   "signals": r["strategic_signals"]}
                  for _, r in sub.iterrows()]
        last = sub.iloc[-1]
        score = None if last["score"] is None or pd.isna(last["score"]) else float(last["score"])
        factors = last["factors"] or {}
        effective = last["effective"] or {}
        trace = last["trace"] if isinstance(last["trace"], list) else []
        reasons = [f"{n}: {f.reason}" for n, f in factors.items() if f.score is None and f.reason]
        status = "insufficient_data" if score is None else (
            "available" if last["coverage"] >= 0.99 else "partial")
        results.append({
            "contract_version": "dashboard-v1",
            "entity": {"kind": "group", "id": group_id},
            "cutoff_date": last["m"].strftime("%Y-%m-%d"),
            "model_version": MODEL_VERSION,
            "data_version": "embat-v2",
            "status": status,
            "score": score,
            "band": band_for(score),
            "months": months,
            "trajectory": trajectory_for(series),
            # Las perspectivas estratégicas se publican por separado. El score
            # oficial conserva su fórmula mientras el equipo valida cómo debe
            # combinar nivel, trayectoria y las siguientes señales avanzadas.
            "signals": last["strategic_signals"],
            "quality": {
                "coverage_ratio": float(last["coverage"]),
                "confidence": float(last["confidence"]),
                "months_history": int(last["months_hist"]),
                "reasons": reasons,
                "warnings": [],
            },
            "factors": {
                name: {"score": f.score, "weight": PILLAR_WEIGHTS[name],
                       "effective_weight": effective.get(name),
                       "metrics": f.metrics, "reason": f.reason}
                for name, f in factors.items()
            },
            "penalty": float(last["penalty"]),
            "level": None if last["level"] is None or pd.isna(last["level"]) else float(last["level"]),
            "caps": list(last["caps"]) if isinstance(last["caps"], list) else [],
            "explanation": narrative(Trace.from_list(trace), score, band_for(score)),
            "early_warning": early_warning(
                [None if pd.isna(b) else float(b) for b in sub["buffer_days"].tolist()]),
            "drivers": build_drivers(factors, effective) if factors else [],
            "alerts": [],
            "forecast": None,
        })
    results.sort(key=lambda r: r["entity"]["id"])
    return results


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score de salud financiera por grupo.")
    parser.add_argument("--data-root", default=None,
                        help="Directorio del dataset. Por defecto EMBAT_DATA_ROOT o datasets/.")
    parser.add_argument("--output", default=None, help="Fichero JSON de salida.")
    parser.add_argument("--no-cache", action="store_true",
                        help="Lee los CSV directamente, sin materializar Parquet.")
    parser.add_argument("--allow-invalid", action="store_true",
                        help="Sigue aunque la validacion encuentre errores.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    con = connect(args.data_root, use_cache=not args.no_cache, strict=not args.allow_invalid)
    build_base(con)
    print("Construyendo panel grupo x mes...")
    panel = build_panel(con)
    print(f"Panel: {len(panel)} filas ({panel['group_id'].nunique()} grupos x {panel['m'].nunique()} meses)")
    scored = score_panel(panel)                 # 1a pasada: nivel por grupo y mes
    scored = attach_group_signals(panel, scored)  # perspectivas sobre ese nivel
    scored = finalise(scored)                     # 2a pasada: ajustes y techos
    results = build_results(scored)

    output_path = Path(args.output) if args.output else OUTPUT_DIR / "scores_embat.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": "score-results-v1",
        "model_version": MODEL_VERSION,
        "data_version": "embat-v2",
        "cutoff_date": END_MONTH,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(results),
        "unit": "group",
        "groups": results,
    }
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
    with_score = sum(r["score"] is not None for r in results)
    print(f"Generado {output_path} con {len(results)} grupos ({with_score} con score)")
    return scored


if __name__ == "__main__":
    main()
