#!/usr/bin/env python3
"""Genera `datasets_mocked/` completo: CSV, `frames/` y `exports/v1/`.

    .venv/bin/python datasets_mocked/generate_mock.py \\
        --seed 42 --data-dir datasets --out datasets_mocked \\
        --inventory app/exports/v1 --now 2026-09-19T00:00:00+00:00 [--limit N]

Dos ejecuciones con el mismo `--seed` y el mismo `--now` producen todos los
ficheros BYTE A BYTE iguales: un generador por empresa derivado de
`(seed, crc32(company_id))`, orden de filas siempre explicito, floats
redondeados al escribir y JSON con `sort_keys`. Nada depende del reloj ni del
orden de iteracion de un `set`.

El modelo esta en `xray_mock/simulate.py`, las formulas en `xray_mock/core.py`
y la escritura en `xray_mock/export.py`. Este fichero solo orquesta.
"""

from __future__ import annotations

import argparse
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from xray_mock import catalog, export, narrative, real_inputs, simulate  # noqa: E402

#: `generated_at` por defecto. Es una constante, no `datetime.now()`: el mock
#: tiene que salir igual hoy y manana.
DEFAULT_NOW = "2026-09-19T00:00:00+00:00"


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Genera el dataset mock del motor X-Ray (data_kind=mock).")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--data-dir", type=Path, default=Path("datasets"))
    parser.add_argument("--out", type=Path, default=Path("datasets_mocked"))
    parser.add_argument("--inventory", type=Path, default=Path("app/exports/v1"))
    parser.add_argument(
        "--now", default=DEFAULT_NOW,
        help=f"ISO-8601 que fija `generated_at` (por defecto {DEFAULT_NOW}).")
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Primeras N empresas por company_id ascendente, y sus grupos.")
    return parser.parse_args(argv)


def _date(value) -> str | None:
    if value is None or value != value:
        return None
    return str(value)[:10]


def _company_facts(row) -> dict:
    return {key: row[key] for key in (
        "company_id", "group_id", "branch", "months_hist",
        "has_invoices", "has_debt", "has_debt_repayment", "has_lineofcredit",
        "has_ss", "has_salary", "has_tax", "has_invest", "has_intercompany",
    )}


def main(argv=None) -> int:
    args = parse_args(argv)
    started = time.time()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # ---------------------------------------------------------------- reales
    facts = real_inputs.load_company_facts(args.data_dir)
    group_facts = real_inputs.load_group_facts(args.data_dir)
    monthly = real_inputs.load_monthly_activity(args.data_dir)

    facts = facts.sort_values("company_id").reset_index(drop=True)
    if args.limit is not None:
        facts = facts.head(args.limit).copy()
    company_ids = list(facts["company_id"])
    selected = set(company_ids)
    facts_by_id = {row["company_id"]: row for _i, row in facts.iterrows()}

    months_by_company: dict[str, list[str]] = {}
    for cid, group in monthly[monthly["company_id"].isin(selected)].groupby("company_id"):
        months_by_company[cid] = sorted(group["month"])

    rates = facts["currency"].map(real_inputs.FX_TO_EUR).fillna(real_inputs.FX_FALLBACK)
    eur = (facts["op_in_12m"] / rates).clip(lower=0.0)
    op_in_eur = dict(zip(facts["company_id"], eur))
    mayor = max(op_in_eur.values()) if op_in_eur else 1.0
    exposure = {
        cid: (float(v) / mayor) ** 0.25 if mayor > 0 else 0.0
        for cid, v in op_in_eur.items()
    }

    group_ids = sorted({facts_by_id[cid]["group_id"] for cid in company_ids})
    group_rows = {row["group_id"]: row for _i, row in group_facts.iterrows()
                  if row["group_id"] in set(group_ids)}

    # --------------------------------------------------- pasada 1: el modelo
    sims: dict[str, simulate.CompanySim] = {}
    for cid in company_ids:
        meses = months_by_company.get(cid, [])
        if not meses:
            continue
        sims[cid] = simulate.simulate_company(
            cid, _company_facts(facts_by_id[cid]), meses, args.seed)

    u_ref = simulate.universe_reference(list(sims.values()))

    # --------------------------------- pasada 2: core.py y escritura de CSV
    tablas = {
        "score_timeline.csv": export.Table(
            out / "score_timeline.csv", export.SCORE_TIMELINE_COLUMNS),
        "signals.csv": export.Table(out / "signals.csv", export.SIGNALS_COLUMNS),
        "drivers.csv": export.Table(out / "drivers.csv", export.DRIVERS_COLUMNS),
        "narratives.csv": export.Table(
            out / "narratives.csv", export.NARRATIVES_COLUMNS),
    }
    derived: dict[str, simulate.CompanyDerived] = {}
    candidatos: list[dict] = []
    clipped = 0

    for cid in company_ids:
        sim = sims.get(cid)
        if sim is None:
            continue
        hechos = _company_facts(facts_by_id[cid])
        hechos["exposure"] = exposure.get(cid, 0.0)
        der = simulate.derive_company(sim, u_ref, hechos)
        derived[cid] = der
        clipped += sim.clipped
        candidatos.extend(der.alert_candidates)

        tablas["score_timeline.csv"].write_all(der.timeline)
        tablas["signals.csv"].write_all(simulate.signal_rows(sim, der, u_ref))
        for t, fila in enumerate(der.timeline):
            drivers = simulate.month_drivers(sim, der, t)
            tablas["drivers.csv"].write_all(drivers)
            texto = narrative.build(
                score=fila["score"], delta_1m=fila["delta_1m"], band=fila["band"],
                regime=fila["regime"], outlook_label=fila["outlook_label"],
                cap_code=fila["cap_code"], penalty=fila["penalty"],
                drivers=drivers, strength_flags=fila["strength_flags"],
                month_index=fila["month_index"])
            tablas["narratives.csv"].write({
                "company_id": cid, "month": fila["month"], **texto})

    # ------------------------------------------------------------- alertas
    activas_por_mes: dict[str, int] = {}
    for der in derived.values():
        for fila in der.timeline:
            activas_por_mes[fila["month"]] = activas_por_mes.get(fila["month"], 0) + 1
    alerts = simulate.build_alerts(candidatos, sims, activas_por_mes)
    with export.Table(out / "alerts.csv", export.ALERTS_COLUMNS) as tabla:
        tabla.write_all(alerts)
        n_alerts = tabla.rows
    alerts_by_company: dict[str, list[dict]] = {}
    alerts_by_group: dict[str, list[dict]] = {}
    alerts_by_month: dict[str, list[dict]] = {}
    for alerta in alerts:
        alerts_by_company.setdefault(alerta["company_id"], []).append(alerta)
        alerts_by_group.setdefault(alerta["group_id"], []).append(alerta)
        alerts_by_month.setdefault(alerta["month_detected"], []).append(alerta)

    # -------------------------------------------------------------- grupos
    timelines_por_mes: dict[str, dict[str, dict]] = {}
    for cid, der in derived.items():
        sim = sims[cid]
        a5 = sim.value.get("A5")
        timelines_por_mes[cid] = {
            fila["month"]: {
                "score": fila["score"],
                "confidence": fila["confidence"],
                "band": fila["band"],
                "regime": fila["regime"],
                "delta_1m": fila["delta_1m"],
                "intragroup": a5[t] if a5 else None,
            }
            for t, fila in enumerate(der.timeline)
        }

    miembros: dict[str, list[str]] = {}
    for cid in company_ids:
        miembros.setdefault(facts_by_id[cid]["group_id"], []).append(cid)

    group_timeline: dict[str, list[dict]] = {}
    with export.Table(out / "group_timeline.csv", export.GROUP_TIMELINE_COLUMNS) as tabla:
        for gid in group_ids:
            members = sorted(m for m in miembros.get(gid, []) if m in timelines_por_mes)
            if not members:
                continue
            pesos = {cid: op_in_eur.get(cid, 0.0) for cid in members}
            filas = simulate.derive_group(
                gid, {"weights": pesos}, members, timelines_por_mes,
                list(real_inputs.MONTHS))
            if not filas:
                continue
            group_timeline[gid] = filas
            tabla.write_all(filas)
        n_group_rows = tabla.rows

    # ------------------------------------------------------ tablas estaticas
    with export.Table(out / "companies.csv", export.COMPANIES_COLUMNS) as tabla:
        for cid in company_ids:
            row = facts_by_id[cid]
            sim = sims.get(cid)
            tabla.write({
                "company_id": cid,
                "group_id": row["group_id"],
                "name": simulate.company_name(cid),
                "country": row["country"],
                "currency": row["currency"],
                "erp": row["erp"],
                "created_at": _date(row["created_at"]),
                "first_activity": _date(row["first_activity"]),
                "last_activity": _date(row["last_activity"]),
                "months_hist": int(row["months_hist"]),
                "has_invoices": bool(row["has_invoices"]),
                "has_debt": bool(row["has_debt"]),
                "has_debt_repayment": bool(row["has_debt_repayment"]),
                "has_lineofcredit": bool(row["has_lineofcredit"]),
                "branch": row["branch"],
                "n_banking_products": int(row["n_banking_products"]),
                "n_debt_products": int(row["n_debt_products"]),
                "n_invoices": int(row["n_invoices"]),
                "n_transactions": int(row["n_transactions"]),
                "op_in_12m": float(row["op_in_12m"]),
                "cash_quality": sim.cash_quality if sim else None,
            })
        n_companies = tabla.rows

    with export.Table(out / "groups.csv", export.GROUPS_COLUMNS) as tabla:
        for gid in group_ids:
            row = group_rows.get(gid)
            members = sorted(miembros.get(gid, []))
            tabla.write({
                "group_id": gid,
                "name": simulate.group_name(gid),
                "erp": row["erp"] if row is not None else None,
                "n_companies": len(members),
                "countries": sorted(row["countries"]) if row is not None else [],
                "currencies": sorted(row["currencies"]) if row is not None else [],
                "consolidation_currency": "EUR",
                "op_in_12m_eur": sum(op_in_eur.get(c, 0.0) for c in members),
                "has_intercompany": bool(row["has_intercompany"])
                if row is not None else False,
            })
        n_groups = tabla.rows

    n_catalog = export.write_signal_catalog(out / "signal_catalog.csv")

    # -------------------------------------------------------------- frames
    empresas_con_alerta = {
        (a["company_id"], a["month_detected"]) for a in alerts
    }
    n_frames = 0
    for mes in real_inputs.MONTHS:
        filas_empresa = [
            {"company_id": cid, **timelines_por_mes[cid][mes]}
            for cid in company_ids
            if cid in timelines_por_mes and mes in timelines_por_mes[cid]
        ]
        sparklines = {}
        for fila in filas_empresa:
            cid = fila["company_id"]
            meses = [m for m in months_by_company[cid] if m <= mes][-12:]
            sparklines[cid] = [timelines_por_mes[cid][m]["score"] for m in meses]
        filas_grupo = [
            fila for gid in group_ids for fila in group_timeline.get(gid, [])
            if fila["month"] == mes
        ]
        export.write_json(out / "frames" / f"{mes}.json", export.build_frame(
            mes, filas_empresa, filas_grupo, alerts_by_month.get(mes, []),
            sparklines,
            {cid for cid, m in empresas_con_alerta if m == mes},
        ))
        n_frames += 1

    # ----------------------------------------------------------- exports/v1
    exports_dir = out / "exports" / "v1"
    inventario = export.copy_inventory(
        args.inventory, exports_dir, company_ids, group_ids)

    n_results = 0
    for cid in company_ids:
        sim = sims.get(cid)
        if sim is None:
            continue
        der = derived[cid]
        razones = []
        if not sim.coverage["invoices"]:
            razones.append("no_invoices")
        if not sim.coverage["debt"]:
            razones.append("no_debt")
        if sim.cash_quality == "low":
            razones.append("cash_quality_low")
        narrativas = [
            narrative.build(
                score=f["score"], delta_1m=f["delta_1m"], band=f["band"],
                regime=f["regime"], outlook_label=f["outlook_label"],
                cap_code=f["cap_code"], penalty=f["penalty"],
                drivers=simulate.month_drivers(sim, der, t),
                strength_flags=f["strength_flags"], month_index=f["month_index"])
            for t, f in enumerate(der.timeline[-1:], start=len(der.timeline) - 1)
        ]
        export.write_json(
            exports_dir / "results" / f"{cid}.json",
            export.company_result(
                sim, der, u_ref, simulate.company_name(cid),
                alerts_by_company.get(cid, []), narrativas, razones, args.now))
        n_results += 1

    for gid in group_ids:
        filas = group_timeline.get(gid)
        if not filas:
            continue
        members = sorted(m for m in miembros.get(gid, []) if m in timelines_por_mes)
        ultimo_mes = filas[-1]["month"]
        member_last = [
            {"company_id": cid, "name": simulate.company_name(cid),
             **{k: timelines_por_mes[cid][ultimo_mes][k]
                for k in ("score", "band", "regime", "delta_1m")}}
            for cid in members if ultimo_mes in timelines_por_mes[cid]
        ]
        member_deltas: dict[str, list] = {}
        for fila in filas:
            mes = fila["month"]
            member_deltas[mes] = [
                (cid, timelines_por_mes[cid][mes]["delta_1m"] or 0.0)
                for cid in members if mes in timelines_por_mes[cid]
            ]
        export.write_json(
            exports_dir / "results" / f"{gid}.json",
            export.group_result(
                gid, simulate.group_name(gid), filas, members, member_last,
                alerts_by_group.get(gid, []), member_deltas, args.now))
        n_results += 1

    # ------------------------------------------------------------ manifests
    hashes = real_inputs.source_hashes(args.data_dir)
    bases = [
        fila["base"] for der in derived.values() for fila in der.timeline
        if not fila["warmup"]
    ]
    counts = {
        "companies.csv": n_companies,
        "groups.csv": n_groups,
        "signal_catalog.csv": n_catalog,
        "score_timeline.csv": tablas["score_timeline.csv"].rows,
        "group_timeline.csv": n_group_rows,
        "signals.csv": tablas["signals.csv"].rows,
        "drivers.csv": tablas["drivers.csv"].rows,
        "narratives.csv": tablas["narratives.csv"].rows,
        "alerts.csv": n_alerts,
        "frames": n_frames,
        "exports/v1/results": n_results,
        "exports/v1/companies": inventario["companies_files"],
    }
    for tabla in tablas.values():
        tabla.close()

    manifest = {
        "data_kind": "mock",
        "contract_version": export.CONTRACT_VERSION,
        "model_version": export.MODEL_VERSION,
        "data_version": export.DATA_VERSION,
        "generator_version": simulate.GENERATOR_VERSION,
        "params_version": catalog.PARAMS_VERSION,
        "seed": args.seed,
        "limit": args.limit,
        "generated_at": args.now,
        "cutoff_date": export.CUTOFF_DATE,
        "window": dict(catalog.WINDOW),
        "months": list(real_inputs.MONTHS),
        "counts": counts,
        "source": {"data_dir": str(args.data_dir), "files": hashes},
        "reference": {
            "u_ref": u_ref,
            "base_median": statistics.median(bases) if bases else None,
            "percentile_breakpoints": simulate.FROZEN_BREAKPOINTS,
            "pillar_weights": catalog.PILLAR_WEIGHTS,
            "bands": {nombre: [low, high] for nombre, low, high in catalog.BANDS},
        },
        "notes": [
            "Entidades y cobertura REALES (datasets/); scores, senales y alertas "
            "sinteticos (ver datasets_mocked/README.md).",
            "Los balances no reconcilian (ENGINE §1.5): los valores crudos de "
            "liquidez son coherentes con u, no son saldos reales.",
            f"Meses con el objetivo recortado por no alcanzable: {clipped}.",
        ],
    }
    export.write_json(out / "manifest.json", manifest)
    export.write_json(exports_dir / "manifest.json", {
        "contract_version": export.CONTRACT_VERSION,
        "data_kind": "mock",
        "dataset_version": export.DATA_VERSION,
        "model_version": export.MODEL_VERSION,
        "generator_version": simulate.GENERATOR_VERSION,
        "params_version": catalog.PARAMS_VERSION,
        "seed": args.seed,
        "generated_at": args.now,
        "cutoff_date": export.CUTOFF_DATE,
        "window": {"start": "2024-09-01", "end": "2026-09-01"},
        "counts": {
            "n_companies": n_companies,
            "n_groups": n_groups,
            "n_results": n_results,
            "companies_json": inventario["companies_json"],
            "groups_json": inventario["groups_json"],
        },
        "source": {"data_dir": str(args.data_dir), "files": hashes},
    })

    # -------------------------------------------------------------- resumen
    elapsed = time.time() - started
    caps = sum(1 for der in derived.values() for fila in der.timeline
               if fila["cap_code"])
    print(f"mock generado en {elapsed:.1f} s  (seed={args.seed}, now={args.now})")
    print(f"  salida: {out}")
    for nombre, filas in counts.items():
        print(f"  {nombre:<28} {filas:>8}")
    print(f"  {'empresa-mes con techo':<28} {caps:>8}")
    print(f"  {'empresa-mes recortado':<28} {clipped:>8}")
    print(f"  {'u_ref congelados':<28} {len(u_ref):>8}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
