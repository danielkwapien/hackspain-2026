"""M5: el score de un grupo no depende de quien mas venga en el fichero.

Es la prueba que protege la entrega. El test oculto llega en el mismo formato
con menos grupos, asi que cualquier paso que dependa de la distribucion de la
cohorte cargada -un percentil, una winsorizacion por mes, una calibracion por
cuantiles- daria OTRO numero para el MISMO grupo. La generalizacion seria
ficticia y no nos enterariamos.

Aqui se construye un subconjunto de 60 grupos en un directorio aparte, se
ejecuta el pipeline entero contra el, y se exige que los scores mensuales
coincidan EXACTAMENTE con los del universo completo.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

CORE = Path(__file__).resolve().parents[1]
ROOT = CORE.parent
sys.path.insert(0, str(CORE))

TOLERANCE = 1e-9
SUBSET_GROUPS = 60

EXPORTS = {
    "groups.csv": "SELECT * FROM groups WHERE group_id IN (SELECT group_id FROM keep)",
    "companies.csv": "SELECT * FROM companies WHERE company_id IN (SELECT company_id FROM keepc)",
    "banking_products.csv": "SELECT * FROM banking_products WHERE company_id IN (SELECT company_id FROM keepc)",
    "debt_products.csv": "SELECT * FROM debt_products WHERE company_id IN (SELECT company_id FROM keepc)",
    "debt_schedule_config.csv": "SELECT * FROM debt_schedule_config WHERE company_id IN (SELECT company_id FROM keepc)",
    "balances.csv": "SELECT * FROM balances WHERE company_id IN (SELECT company_id FROM keepc)",
    "invoices.csv": "SELECT * FROM invoices WHERE company_id IN (SELECT company_id FROM keepc)",
    "transactions.csv": "SELECT * FROM transactions WHERE company_id IN (SELECT company_id FROM keepc)",
}


def build_subset(target: Path) -> None:
    """Escribe un dataset de 60 grupos, elegidos sin mirar ningun score."""
    from datastore import DataStore, ParquetCache

    store = DataStore()
    cache = ParquetCache(store)
    for name in ("groups", "companies", "banking_products", "debt_products",
                 "debt_schedule_config", "balances", "invoices", "transactions"):
        cache.register(name)
    con = store.con
    con.execute(f"CREATE TABLE keep AS SELECT group_id FROM groups "
                f"ORDER BY md5(group_id) LIMIT {SUBSET_GROUPS}")
    con.execute("CREATE TABLE keepc AS SELECT company_id FROM companies "
                "WHERE group_id IN (SELECT group_id FROM keep)")
    target.mkdir(parents=True, exist_ok=True)
    for filename, query in EXPORTS.items():
        con.execute(f"COPY ({query}) TO '{target / filename}' (HEADER, DELIMITER ',')")


def run_pipeline(data_root: Path | None, output: Path) -> dict:
    command = [sys.executable, str(CORE / "pipeline_embat.py"), "--output", str(output)]
    if data_root is not None:
        command += ["--data-root", str(data_root), "--no-cache"]
    result = subprocess.run(command, capture_output=True, text=True, cwd=ROOT)
    assert result.returncode == 0, f"el pipeline fallo:\n{result.stdout}\n{result.stderr}"
    return json.loads(output.read_text(encoding="utf-8"))


def index(payload: dict) -> dict[str, dict[str, float | None]]:
    return {
        group["entity"]["id"]: {m["month"]: m["score"] for m in group["months"]}
        for group in payload["groups"]
    }


@pytest.fixture(scope="module")
def both_runs(tmp_path_factory) -> tuple[dict, dict]:
    workspace = tmp_path_factory.mktemp("isolation")
    subset_dir = workspace / "subset"
    build_subset(subset_dir)
    full = index(run_pipeline(None, workspace / "full.json"))
    subset = index(run_pipeline(subset_dir, workspace / "subset.json"))
    return full, subset


def test_subset_has_the_expected_groups(both_runs):
    full, subset = both_runs
    assert len(subset) == SUBSET_GROUPS
    assert set(subset) <= set(full), "el subconjunto trae grupos que no estan en el universo"


def test_scores_are_identical_on_the_subset(both_runs):
    """Mismo grupo, mismo mes, mismo numero. Sin margen."""
    full, subset = both_runs
    compared = 0
    differences: list[str] = []
    for group_id, months in subset.items():
        for month, value in months.items():
            reference = full[group_id].get(month)
            if value is None or reference is None:
                if value != reference:
                    differences.append(f"{group_id} {month}: {value!r} vs {reference!r}")
                continue
            compared += 1
            if abs(value - reference) > TOLERANCE:
                differences.append(f"{group_id} {month}: {value} vs {reference}")
    assert compared > 0, "no se comparo ningun score"
    assert not differences, (
        f"{len(differences)} scores cambian al reducir la cohorte "
        f"(de {compared} comparados). El motor depende de quien mas hay en el "
        f"fichero:\n" + "\n".join(differences[:10]))
