"""Invariantes del dataset mock sobre los CSV generados.

Traduccion literal de `plans/00-reference/mock-data-contract.md` (principio 3 y
§1-§2) y de `plans/XR-001-mock-dataset/PLAN.md` §4.1. Tolerancia numerica 1e-6
en todas las comparaciones de punto flotante.

Estos tests NO importan `simulate.py`, `export.py` ni `generate_mock.py`: se
escriben contra el contrato, no contra la implementacion. Solo se apoyan en
`xray_mock.catalog` (definicion congelada del catalogo de senales y de los
dominios enumerados).

De donde salen los datos (regla de la fixture de sesion):

- Si existe `datasets_mocked/manifest.json` (dataset completo ya generado), se
  corre sobre el.
- Si no existe, la fixture invoca el generador con `--limit 50` sobre un
  directorio temporal, para que la suite sea autocontenida.
- `test_generation_is_deterministic` SIEMPRE genera dos veces, pase lo que pase.

Si el generador todavia no existe, los tests hacen `skip` con un mensaje
explicito en vez de petar con un `ImportError` opaco.
"""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from xray_mock import catalog

# --- Constantes del contrato -------------------------------------------

TOL = 1e-6

REPO_ROOT = Path(__file__).resolve().parents[2]
MOCK_DIR = REPO_ROOT / "datasets_mocked"
GENERATOR = MOCK_DIR / "generate_mock.py"
PYTHON = Path(sys.executable)

#: `--now` fijo: el manifest y cualquier marca temporal tienen que ser
#: reproducibles para poder comparar byte a byte.
NOW = "2026-09-19T00:00:00+00:00"
SEED = 42
LIMIT = 50
GEN_TIMEOUT_S = 600

#: Contrato §1: ficheros que el generador tiene que dejar en `--out`.
REQUIRED_FILES = (
    "manifest.json",
    "signal_catalog.csv",
    "companies.csv",
    "groups.csv",
    "score_timeline.csv",
    "group_timeline.csv",
    "drivers.csv",
    "alerts.csv",
    "narratives.csv",
    "exports/v1/manifest.json",
)
REQUIRED_DIRS = ("frames", "exports/v1/results")

#: `README.md` es parte de `datasets_mocked/` (§1) pero es documentacion escrita
#: a mano, no salida del generador: solo se exige en el dataset completo.
REQUIRED_FILES_FULL_ONLY = ("README.md",)

#: Contrato §2: columnas EXACTAS de cada CSV (ni de mas ni de menos).
EXPECTED_COLUMNS: dict[str, tuple[str, ...]] = {
    # §2.1
    "companies.csv": (
        "company_id", "group_id", "name", "country", "currency", "erp",
        "created_at", "first_activity", "last_activity", "months_hist",
        "has_invoices", "has_debt", "has_debt_repayment", "has_lineofcredit",
        "branch", "n_banking_products", "n_debt_products", "n_invoices",
        "n_transactions", "op_in_12m", "cash_quality",
    ),
    # §2.2
    "groups.csv": (
        "group_id", "name", "erp", "n_companies", "countries", "currencies",
        "consolidation_currency", "op_in_12m_eur", "has_intercompany",
    ),
    # §2.3
    "score_timeline.csv": (
        "company_id", "month", "month_index", "months_hist", "warmup", "branch",
        "pillar_L", "pillar_P", "pillar_C", "pillar_D", "pillar_A",
        "weight_L", "weight_P", "weight_C", "weight_D", "weight_A",
        "level", "penalty", "cap_code", "cap", "score", "band",
        "delta_1m", "delta_3m", "delta_6m", "slope_3m", "slope_6m",
        "z_own", "breadth", "run", "p_change", "level_shift", "regime",
        "outlook_3m", "outlook_6m", "outlook_low", "outlook_high",
        "outlook_label", "confidence", "strength_flags", "base",
    ),
    # §2.4
    "group_timeline.csv": (
        "group_id", "month", "score", "band", "regime", "delta_1m", "delta_3m",
        "outlook_6m", "outlook_low", "outlook_high", "confidence",
        "n_companies_scored", "dispersion", "weakest_company", "weakest_score",
        "strongest_company", "intragroup_dependency_max",
    ),
    # §2.5 (`series_24m` NO es columna: la serie se obtiene filtrando)
    "signals": (
        "company_id", "month", "signal_id", "pillar", "value", "value_fmt",
        "u", "u_smooth", "u_ref", "weight", "contribution", "delta_vs_prev",
        "is_available", "quality_flag",
    ),
    # §2.6
    "drivers.csv": (
        "company_id", "month", "rank", "signal_id", "pillar", "contribution",
        "delta_vs_prev", "value", "value_fmt", "direction",
    ),
    # §2.7
    "alerts.csv": (
        "alert_id", "company_id", "group_id", "event", "severity", "direction",
        "month_detected", "month_evident", "lead_time_months", "trigger_signal",
        "score_before", "score_after", "status", "message",
    ),
    # §2.8
    "narratives.csv": (
        "company_id", "month", "headline", "body", "watch_next",
        "guardrail_passed",
    ),
}

PILLARS = ("L", "P", "C", "D", "A")

#: Senales que necesitan facturas (catalogo congelado, `requires == "invoices"`).
INVOICE_SIGNALS = tuple(
    s["signal_id"] for s in catalog.SIGNALS if s["requires"] == "invoices"
)

#: Contrato principio 3 / ENGINE §5.5.
BAND_RULES = (("solid", 80.0, None), ("healthy", 60.0, 80.0),
              ("watch", 40.0, 60.0), ("stress", None, 40.0))

ALERT_EVENTS = {
    "regime_deteriorating", "regime_improving", "cap_NEGCASH", "cap_SSMISS",
    "cap_DEBTSTOP", "cap_LOCFULL", "level_shift_down", "level_shift_up",
}
QUALITY_FLAGS = {"warmup", "low_history", "cash_quality_low"}

#: Contrato §2.7 / ENGINE §8.
BUDGET_DOWN = 0.05
BUDGET_UP = 0.02
COOLDOWN_MONTHS = 3

WARMUP_MONTHS_DEFAULT = 3
WARMUP_MONTHS_INVOICES = 6


# --- Utilidades numericas y de mensajes --------------------------------

def _num(series) -> np.ndarray:
    """Columna -> `float64` con NaN donde falte el dato."""
    return pd.to_numeric(pd.Series(series), errors="coerce").astype("float64").to_numpy()


def _notclose(a, b, tol: float = TOL) -> np.ndarray:
    """`True` donde `a` y `b` NO coinciden. Un NaN cuenta como incumplimiento."""
    return ~np.isclose(np.asarray(a, dtype="float64"),
                       np.asarray(b, dtype="float64"),
                       rtol=0.0, atol=tol, equal_nan=False)


def _to_bool(value):
    """Booleano tolerante al formato con el que el CSV lo haya escrito."""
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if value is None or value is pd.NA:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip().lower()
    if text in {"true", "1", "1.0", "t", "yes", "y"}:
        return True
    if text in {"false", "0", "0.0", "f", "no", "n"}:
        return False
    if text in {"", "nan", "none", "null", "<na>"}:
        return None
    raise AssertionError(f"valor booleano no reconocido en el CSV: {value!r}")


def _bools(series) -> pd.Series:
    return pd.Series(series).map(_to_bool)


def _month_idx(month: str) -> int:
    year, mon = str(month).split("-")[:2]
    return int(year) * 12 + int(mon)


def _check(bad_mask, frame: pd.DataFrame, fmt, what: str, limit: int = 5) -> None:
    """Falla con las primeras filas culpables ya formateadas."""
    mask = np.asarray(bad_mask, dtype=bool)
    n_bad = int(mask.sum())
    if n_bad == 0:
        return
    sample = frame.loc[mask].head(limit)
    lines = [fmt(row) for _, row in sample.iterrows()]
    raise AssertionError(
        f"{what}: {n_bad} de {len(frame)} filas incumplen.\n  "
        + "\n  ".join(lines)
    )


def _band_of(score: float) -> str:
    for name, low, high in BAND_RULES:
        if (low is None or score >= low) and (high is None or score < high):
            return name
    raise AssertionError(f"score fuera de la recta real: {score!r}")  # pragma: no cover


# --- Generacion --------------------------------------------------------

def _require_generator() -> None:
    if not GENERATOR.exists():
        pytest.skip(
            f"el generador todavia no existe: {GENERATOR} no esta en disco. "
            "Los tests de invariantes corren en cuanto el builder lo escriba "
            "(no es un fallo de este fichero)."
        )


def run_generator(out_dir: Path, limit: int | None = LIMIT, seed: int = SEED) -> Path:
    """Invoca el CLI del contrato y devuelve el directorio de salida."""
    _require_generator()
    cmd = [
        str(PYTHON), str(GENERATOR),
        "--seed", str(seed),
        "--data-dir", "datasets",
        "--out", str(out_dir),
        "--inventory", "app/exports/v1",
        "--now", NOW,
    ]
    if limit is not None:
        cmd += ["--limit", str(limit)]
    try:
        proc = subprocess.run(
            cmd, cwd=REPO_ROOT, capture_output=True, text=True,
            timeout=GEN_TIMEOUT_S, check=False,
        )
    except subprocess.TimeoutExpired:
        raise AssertionError(
            f"el generador no termino en {GEN_TIMEOUT_S}s con --limit {limit}: "
            + " ".join(cmd)
        ) from None
    if proc.returncode != 0:
        raise AssertionError(
            "el generador fallo (exit {}):\n  cmd: {}\n  stderr:\n{}".format(
                proc.returncode, " ".join(cmd), proc.stderr[-4000:]
            )
        )
    return out_dir


# --- Carga del dataset -------------------------------------------------

class Dataset:
    """Vista perezosa de un directorio `datasets_mocked/`-like."""

    def __init__(self, root: Path, is_full: bool):
        self.root = Path(root)
        self.is_full = is_full
        self._cache: dict[str, pd.DataFrame] = {}

    # `signals` admite CSV o Parquet (PLAN §9: si pasa de 100 MB va en Parquet).
    def _path(self, name: str) -> Path:
        if name == "signals":
            for candidate in ("signals.csv", "signals.parquet"):
                path = self.root / candidate
                if path.exists():
                    return path
            raise AssertionError(
                f"falta `signals.csv` (o `signals.parquet`) en {self.root}"
            )
        path = self.root / name
        if not path.exists():
            raise AssertionError(f"falta `{name}` en {self.root}")
        return path

    def table(self, name: str) -> pd.DataFrame:
        if name not in self._cache:
            path = self._path(name)
            if path.suffix == ".parquet":
                frame = pd.read_parquet(path)
            else:
                frame = pd.read_csv(path, low_memory=False)
            self._cache[name] = frame
        return self._cache[name]

    @property
    def companies(self) -> pd.DataFrame:
        return self.table("companies.csv")

    @property
    def groups(self) -> pd.DataFrame:
        return self.table("groups.csv")

    @property
    def score_timeline(self) -> pd.DataFrame:
        return self.table("score_timeline.csv")

    @property
    def group_timeline(self) -> pd.DataFrame:
        return self.table("group_timeline.csv")

    @property
    def signals(self) -> pd.DataFrame:
        return self.table("signals")

    @property
    def drivers(self) -> pd.DataFrame:
        return self.table("drivers.csv")

    @property
    def alerts(self) -> pd.DataFrame:
        return self.table("alerts.csv")

    @property
    def narratives(self) -> pd.DataFrame:
        return self.table("narratives.csv")

    def frame_files(self) -> dict[str, Path]:
        frames_dir = self.root / "frames"
        if not frames_dir.is_dir():
            raise AssertionError(f"falta el directorio `frames/` en {self.root}")
        return {p.stem: p for p in sorted(frames_dir.glob("*.json"))}

    def frame(self, month: str) -> dict:
        return json.loads(self.frame_files()[month].read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def dataset(tmp_path_factory) -> Dataset:
    """Dataset completo si existe; si no, uno generado con `--limit 50`."""
    if (MOCK_DIR / "manifest.json").exists():
        return Dataset(MOCK_DIR, is_full=True)
    _require_generator()
    out = tmp_path_factory.mktemp("mock_limit50")
    run_generator(out, limit=LIMIT)
    return Dataset(out, is_full=False)


# =======================================================================
# Invariantes (contrato principio 3 + PLAN §4.1)
# =======================================================================

def inv_files_and_dirs_exist(ds: Dataset) -> None:
    """§1: la estructura de carpetas del contrato esta completa."""
    required = REQUIRED_FILES + (REQUIRED_FILES_FULL_ONLY if ds.is_full else ())
    missing = [name for name in required if not (ds.root / name).exists()]
    missing += [name for name in REQUIRED_DIRS if not (ds.root / name).is_dir()]
    if not (ds.root / "signals.csv").exists() and not (ds.root / "signals.parquet").exists():
        missing.append("signals.csv|signals.parquet")
    assert not missing, (
        f"faltan ficheros del contrato §1 en {ds.root}: {sorted(missing)}"
    )
    frames = ds.frame_files()
    assert frames, f"`frames/` esta vacio en {ds.root}"


def inv_csv_columns_are_exactly_the_contract(ds: Dataset) -> None:
    """§2: cada CSV tiene EXACTAMENTE las columnas del contrato."""
    problems = []
    for name, expected in EXPECTED_COLUMNS.items():
        got = tuple(ds.table(name).columns)
        missing = [c for c in expected if c not in got]
        extra = [c for c in got if c not in expected]
        if missing or extra:
            problems.append(
                f"{name}: faltan={missing} sobran={extra} (esperadas {len(expected)}, hay {len(got)})"
            )
    assert not problems, "columnas que no coinciden con el contrato §2:\n  " + "\n  ".join(problems)

    # `signal_catalog.csv`: el contrato §1 fija su contenido (28 senales), no
    # una lista cerrada de columnas; se comprueba lo que si esta fijado.
    cat = ds.table("signal_catalog.csv")
    assert "signal_id" in cat.columns, (
        f"`signal_catalog.csv` no tiene columna `signal_id`; tiene {list(cat.columns)}"
    )
    expected_ids = {s["signal_id"] for s in catalog.SIGNALS}
    got_ids = set(cat["signal_id"].astype(str))
    assert expected_ids <= got_ids, (
        "`signal_catalog.csv` no contiene las 28 senales del catalogo; "
        f"faltan {sorted(expected_ids - got_ids)}"
    )
    for column in ("pillar", "name", "unit", "direction"):
        assert column in cat.columns, (
            f"`signal_catalog.csv` deberia describir `{column}` (§1); columnas: {list(cat.columns)}"
        )
    # §1 pide "pesos" y "anclas" sin fijar el nombre de la columna.
    for concept, needle in (("pesos", "weight"), ("anclas", "anchor")):
        assert any(needle in str(c).lower() for c in cat.columns), (
            f"`signal_catalog.csv` deberia describir los {concept} (§1); "
            f"columnas: {list(cat.columns)}"
        )


def inv_score_is_clipped_level(ds: Dataset) -> None:
    """1. `score == clip(level, 0, cap)` en `score_timeline.csv`."""
    st = ds.score_timeline
    level = _num(st["level"])
    cap = np.where(np.isnan(_num(st["cap"])), 100.0, _num(st["cap"]))
    expected = np.minimum(np.maximum(level, 0.0), cap)
    bad = _notclose(_num(st["score"]), expected)
    _check(
        bad, st,
        lambda r: (
            f"{r['company_id']} {r['month']}: score={r['score']!r} "
            f"esperado clip(level={r['level']!r}, 0, cap={r['cap']!r})"
        ),
        "score != clip(level, 0, cap)",
    )


def inv_level_from_pillars_and_weights(ds: Dataset) -> None:
    """2. `level == 100·Σ w_k^eff·P_k − penalty` con los pesos de la fila."""
    st = ds.score_timeline
    weighted = np.zeros(len(st))
    weight_sum = np.zeros(len(st))
    null_pillar_with_weight = np.zeros(len(st), dtype=bool)
    for pillar in PILLARS:
        p = _num(st[f"pillar_{pillar}"])
        w = _num(st[f"weight_{pillar}"])
        w_filled = np.where(np.isnan(w), 0.0, w)
        weight_sum += w_filled
        weighted += np.where(np.isnan(p), 0.0, p) * w_filled
        null_pillar_with_weight |= np.isnan(p) & (np.abs(w_filled) > TOL)

    expected = 100.0 * weighted - np.where(
        np.isnan(_num(st["penalty"])), 0.0, _num(st["penalty"])
    )
    st_dbg = st.assign(_wsum=weight_sum, _expected=expected)
    _check(
        _notclose(_num(st["level"]), expected), st_dbg,
        lambda r: (
            f"{r['company_id']} {r['month']}: level={r['level']!r} "
            f"esperado {r['_expected']!r} = 100·Σw·P − penalty={r['penalty']!r} "
            f"(Σw de la fila = {r['_wsum']!r}; el contrato §2.3 dice que los pesos suman 1)"
        ),
        "level != 100·Σ w_eff·P − penalty",
    )
    _check(
        _notclose(weight_sum, np.ones(len(st))), st_dbg,
        lambda r: f"{r['company_id']} {r['month']}: Σ weight_k = {r['_wsum']!r}, esperado 1",
        "los pesos efectivos de pilar no suman 1 (§2.3)",
    )
    _check(
        null_pillar_with_weight, st_dbg,
        lambda r: (
            f"{r['company_id']} {r['month']}: hay un pilar nulo con peso > 0 "
            f"(pesos L/P/C/D/A = {[r[f'weight_{k}'] for k in PILLARS]}, "
            f"pilares = {[r[f'pillar_{k}'] for k in PILLARS]})"
        ),
        "pilar no disponible con peso efectivo distinto de 0",
    )


def _score_index(ds: Dataset) -> pd.DataFrame:
    st = ds.score_timeline.copy()
    st["_key"] = st["company_id"].astype(str) + "|" + st["month"].astype(str)
    return st


def _available_signals(ds: Dataset) -> pd.DataFrame:
    sig = ds.signals.copy()
    sig["_avail"] = _bools(sig["is_available"]).fillna(False).astype(bool)
    sig["_key"] = sig["company_id"].astype(str) + "|" + sig["month"].astype(str)
    return sig


def inv_contributions_sum_to_score(ds: Dataset) -> None:
    """3. `Σ contribution_i + base − penalty − cap_adj == score` por empresa-mes.

    `cap_adj` no es columna del contrato: es el recorte aplicado por el techo,
    `cap_adj := level − score` (§2.3). La invariante es entonces que las
    contribuciones de las senales disponibles descomponen exactamente el nivel.
    """
    st = _score_index(ds)
    sig = _available_signals(ds)
    avail = sig[sig["_avail"]]

    nan_contrib = avail["contribution"].isna()
    _check(
        nan_contrib.to_numpy(), avail,
        lambda r: f"{r['company_id']} {r['month']} {r['signal_id']}: is_available=true pero contribution es nulo",
        "senal disponible sin contribucion",
    )

    agg = avail.groupby("_key")["contribution"].sum()
    st = st.join(agg.rename("_contrib_sum"), on="_key")
    missing = st["_contrib_sum"].isna()
    _check(
        missing.to_numpy(), st,
        lambda r: f"{r['company_id']} {r['month']}: no hay ninguna fila en signals.csv para esta empresa-mes",
        "empresa-mes de score_timeline.csv sin senales disponibles",
    )

    level = _num(st["level"])
    score = _num(st["score"])
    cap_adj = level - score
    expected = _num(st["_contrib_sum"]) + _num(st["base"]) - _num(st["penalty"]) - cap_adj
    st_dbg = st.assign(_expected=expected, _cap_adj=cap_adj)
    _check(
        _notclose(score, expected), st_dbg,
        lambda r: (
            f"{r['company_id']} {r['month']}: score={r['score']!r} pero "
            f"Σcontrib={r['_contrib_sum']!r} + base={r['base']!r} − penalty={r['penalty']!r} "
            f"− cap_adj={r['_cap_adj']!r} = {r['_expected']!r}"
        ),
        "Σ contribution + base − penalty − cap_adj != score",
    )


def inv_contribution_formula(ds: Dataset) -> None:
    """§2.5: `contribution == 100 · weight · (u_smooth − u_ref)`."""
    sig = _available_signals(ds)
    avail = sig[sig["_avail"]].copy()
    expected = 100.0 * _num(avail["weight"]) * (_num(avail["u_smooth"]) - _num(avail["u_ref"]))
    avail = avail.assign(_expected=expected)
    _check(
        _notclose(_num(avail["contribution"]), expected), avail,
        lambda r: (
            f"{r['company_id']} {r['month']} {r['signal_id']}: contribution={r['contribution']!r} "
            f"esperado 100·weight({r['weight']!r})·(u_smooth({r['u_smooth']!r}) − u_ref({r['u_ref']!r})) "
            f"= {r['_expected']!r}"
        ),
        "contribution != 100·weight·(u_smooth − u_ref)",
    )


def inv_delta_1m_and_its_decomposition(ds: Dataset) -> None:
    """4. `delta_1m == score_t − score_{t−1}` y su descomposicion por senal.

    Convenio de signo (forzado por la invariante 3): `Δpenalty = −(penalty_t −
    penalty_{t−1})` y `Δcap = −(cap_adj_t − cap_adj_{t−1})`, de forma que
    `Σ delta_vs_prev_i + Δpenalty + Δcap = delta_1m`.
    """
    st = _score_index(ds).sort_values(["company_id", "month"]).reset_index(drop=True)
    grp = st.groupby("company_id", sort=False)
    prev_score = grp["score"].shift(1)
    prev_penalty = grp["penalty"].shift(1)
    prev_level = grp["level"].shift(1)
    is_first = prev_score.isna().to_numpy()

    delta = _num(st["delta_1m"])
    first_bad = is_first & ~(np.isnan(delta) | np.isclose(delta, 0.0, atol=TOL))
    _check(
        first_bad, st,
        lambda r: f"{r['company_id']} {r['month']}: primer mes con delta_1m={r['delta_1m']!r} (esperado nulo o 0)",
        "delta_1m del primer mes no es nulo ni 0",
    )

    expected_delta = _num(st["score"]) - _num(prev_score)
    bad = (~is_first) & _notclose(delta, expected_delta)
    st_dbg = st.assign(_prev_score=prev_score, _expected=expected_delta)
    _check(
        bad, st_dbg,
        lambda r: (
            f"{r['company_id']} {r['month']}: delta_1m={r['delta_1m']!r} pero "
            f"score={r['score']!r} − score_prev={r['_prev_score']!r} = {r['_expected']!r}"
        ),
        "delta_1m != score_t − score_{t−1}",
    )

    # Descomposicion del delta.
    sig = _available_signals(ds)
    avail = sig[sig["_avail"]]
    d_sum = avail.groupby("_key")["delta_vs_prev"].sum(min_count=1)
    st2 = st.join(d_sum.rename("_dsum"), on="_key")
    cap_adj = _num(st2["level"]) - _num(st2["score"])
    prev_cap_adj = _num(prev_level) - _num(prev_score)
    penalty_term = -(_num(st2["penalty"]) - _num(prev_penalty))
    cap_term = -(cap_adj - prev_cap_adj)
    expected = _num(st2["_dsum"]) + penalty_term + cap_term
    st_dbg2 = st2.assign(_expected=expected, _pen=penalty_term, _cap=cap_term)
    bad2 = (~is_first) & _notclose(delta, expected)
    _check(
        bad2, st_dbg2,
        lambda r: (
            f"{r['company_id']} {r['month']}: delta_1m={r['delta_1m']!r} pero "
            f"Σdelta_vs_prev={r['_dsum']!r} + Δpenalty={r['_pen']!r} + Δcap={r['_cap']!r} = {r['_expected']!r}"
        ),
        "Σ delta_vs_prev + Δpenalty + Δcap != delta_1m",
    )


def inv_delta_vs_prev_matches_contribution_diff(ds: Dataset) -> None:
    """§2.5: `delta_vs_prev` es el cambio de la contribucion vs el mes anterior."""
    sig = _available_signals(ds).sort_values(["company_id", "signal_id", "month"])
    sig = sig.reset_index(drop=True)
    grp = sig.groupby(["company_id", "signal_id"], sort=False)
    prev_contrib = grp["contribution"].shift(1)
    prev_avail = grp["_avail"].shift(1)
    comparable = sig["_avail"].to_numpy() & (prev_avail.fillna(False).to_numpy().astype(bool))
    expected = _num(sig["contribution"]) - _num(prev_contrib)
    sig_dbg = sig.assign(_prev=prev_contrib, _expected=expected)
    bad = comparable & _notclose(_num(sig["delta_vs_prev"]), expected)
    _check(
        bad, sig_dbg,
        lambda r: (
            f"{r['company_id']} {r['month']} {r['signal_id']}: delta_vs_prev={r['delta_vs_prev']!r} "
            f"pero contribution={r['contribution']!r} − prev={r['_prev']!r} = {r['_expected']!r}"
        ),
        "delta_vs_prev != contribution_t − contribution_{t−1}",
    )


def inv_outlook_band_is_ordered(ds: Dataset) -> None:
    """5. `outlook_low <= outlook_6m <= outlook_high`."""
    st = ds.score_timeline
    low, mid, high = _num(st["outlook_low"]), _num(st["outlook_6m"]), _num(st["outlook_high"])
    present = ~(np.isnan(low) & np.isnan(mid) & np.isnan(high))
    partial = present & (np.isnan(low) | np.isnan(mid) | np.isnan(high))
    _check(
        partial, st,
        lambda r: (
            f"{r['company_id']} {r['month']}: outlook incompleto "
            f"(low={r['outlook_low']!r}, h6={r['outlook_6m']!r}, high={r['outlook_high']!r})"
        ),
        "banda de outlook a medias (o los tres nulos, o los tres presentes)",
    )
    bad = present & ~partial & ((low > mid + TOL) | (mid > high + TOL))
    _check(
        bad, st,
        lambda r: (
            f"{r['company_id']} {r['month']}: low={r['outlook_low']!r} "
            f"h6={r['outlook_6m']!r} high={r['outlook_high']!r}"
        ),
        "no se cumple outlook_low <= outlook_6m <= outlook_high",
    )


def inv_band_matches_score(ds: Dataset) -> None:
    """6. `band` coherente: solid >= 80, healthy 60-79, watch 40-59, stress < 40.

    Nota para el revisor: ENGINE §6.2 menciona histeresis de banda (cruzar por
    >= 2 puntos y mantener 2-3 meses). El contrato mock (principio 3) fija la
    banda como funcion pura del score y es lo que se testea aqui.
    """
    st = ds.score_timeline
    score = _num(st["score"])
    expected = pd.Series([None if math.isnan(s) else _band_of(s) for s in score], index=st.index)
    st_dbg = st.assign(_expected=expected)
    bad = (st["band"].astype("object") != expected).to_numpy()
    _check(
        bad, st_dbg,
        lambda r: f"{r['company_id']} {r['month']}: score={r['score']!r} band={r['band']!r} esperado {r['_expected']!r}",
        "band no corresponde al score",
    )


def inv_invoice_signals_unavailable_without_invoices(ds: Dataset) -> None:
    """7. Senales de factura no disponibles sin facturas; ningun `u` imputado a 0."""
    companies = ds.companies.copy()
    companies["_has_inv"] = _bools(companies["has_invoices"]).fillna(False).astype(bool)
    has_inv = dict(zip(companies["company_id"].astype(str), companies["_has_inv"]))

    sig = _available_signals(ds)
    sig = sig.assign(_company_has_invoices=sig["company_id"].astype(str).map(has_inv))
    unknown = sig["_company_has_invoices"].isna()
    _check(
        unknown.to_numpy(), sig,
        lambda r: f"{r['company_id']} {r['month']}: la empresa no esta en companies.csv",
        "signals.csv referencia empresas que no existen en companies.csv",
    )

    invoice_rows = sig[sig["signal_id"].isin(INVOICE_SIGNALS)]
    bad = (
        (~invoice_rows["_company_has_invoices"].fillna(True).astype(bool))
        & invoice_rows["_avail"]
    ).to_numpy()
    _check(
        bad, invoice_rows,
        lambda r: (
            f"{r['company_id']} {r['month']} {r['signal_id']}: la empresa no tiene facturas "
            f"pero is_available={r['is_available']!r}"
        ),
        f"senal de factura disponible sin facturas (requires=='invoices': {list(INVOICE_SIGNALS)})",
    )

    not_avail = sig[~sig["_avail"]]
    imputed = (~not_avail["u"].isna()).to_numpy()
    _check(
        imputed, not_avail,
        lambda r: (
            f"{r['company_id']} {r['month']} {r['signal_id']}: is_available=false pero u={r['u']!r} "
            "(tiene que ser nulo, nunca 0)"
        ),
        "senal no disponible con `u` imputado",
    )
    imputed_smooth = (~not_avail["u_smooth"].isna()).to_numpy()
    _check(
        imputed_smooth, not_avail,
        lambda r: f"{r['company_id']} {r['month']} {r['signal_id']}: is_available=false pero u_smooth={r['u_smooth']!r}",
        "senal no disponible con `u_smooth` imputado",
    )


def inv_warmup_flags_and_no_alerts(ds: Dataset) -> None:
    """8. `warmup ⇔ month_index <= 3`, `warmup` de factura hasta 6, sin alertas."""
    st = _score_index(ds)
    mi = _num(st["month_index"])
    warm = _bools(st["warmup"])
    expected = mi <= WARMUP_MONTHS_DEFAULT
    st_dbg = st.assign(_expected=expected)
    bad = (warm.fillna(False).to_numpy().astype(bool) != expected)
    _check(
        bad, st_dbg,
        lambda r: (
            f"{r['company_id']} {r['month']}: month_index={r['month_index']!r} warmup={r['warmup']!r} "
            f"esperado {r['_expected']!r}"
        ),
        f"warmup != (month_index <= {WARMUP_MONTHS_DEFAULT})",
    )

    sig = _available_signals(ds)
    sig = sig.merge(
        st[["_key", "month_index"]], on="_key", how="left", validate="many_to_one"
    )
    orphan = sig["month_index"].isna()
    _check(
        orphan.to_numpy(), sig,
        lambda r: f"{r['company_id']} {r['month']} {r['signal_id']}: empresa-mes ausente de score_timeline.csv",
        "signals.csv tiene empresa-mes que score_timeline.csv no tiene",
    )

    flags = sig["quality_flag"].astype("object")
    unknown_flag = ~(flags.isna() | flags.isin(QUALITY_FLAGS)).to_numpy()
    _check(
        unknown_flag, sig,
        lambda r: f"{r['company_id']} {r['month']} {r['signal_id']}: quality_flag={r['quality_flag']!r} fuera de {sorted(QUALITY_FLAGS)}",
        "quality_flag fuera del dominio §2.5",
    )

    inv_rows = sig[sig["signal_id"].isin(INVOICE_SIGNALS) & sig["_avail"]]
    warm_inv = (_num(inv_rows["month_index"]) <= WARMUP_MONTHS_INVOICES)
    bad_flag = warm_inv & (inv_rows["quality_flag"].astype("object") != "warmup").to_numpy()
    _check(
        bad_flag, inv_rows,
        lambda r: (
            f"{r['company_id']} {r['month']} {r['signal_id']}: month_index={r['month_index']!r} "
            f"quality_flag={r['quality_flag']!r} esperado 'warmup'"
        ),
        f"senal de factura sin quality_flag='warmup' con month_index <= {WARMUP_MONTHS_INVOICES}",
    )

    alerts = ds.alerts.copy()
    if len(alerts):
        alerts["_key"] = alerts["company_id"].astype(str) + "|" + alerts["month_detected"].astype(str)
        warm_keys = set(st.loc[warm.fillna(False).to_numpy().astype(bool), "_key"])
        bad_alert = alerts["_key"].isin(warm_keys).to_numpy()
        _check(
            bad_alert, alerts,
            lambda r: f"{r['company_id']} {r['month_detected']}: alerta {r['alert_id']} ({r['event']}) en warm-up",
            "hay alertas emitidas en warm-up",
        )


def inv_signal_weights_sum_to_one(ds: Dataset) -> None:
    """9. `Σ weight_i` de las senales disponibles de una empresa-mes == 1."""
    sig = _available_signals(ds)
    avail = sig[sig["_avail"]]
    sums = avail.groupby(["company_id", "month"])["weight"].sum(min_count=1).reset_index()
    bad = _notclose(_num(sums["weight"]), np.ones(len(sums)))
    _check(
        bad, sums,
        lambda r: f"{r['company_id']} {r['month']}: Σ weight = {r['weight']!r}, esperado 1",
        "los pesos de las senales disponibles no suman 1",
    )


def inv_regime_domain_and_warmup(ds: Dataset) -> None:
    """10. `regime` en el dominio del catalogo y `regime=='warmup' ⇔ warmup`.

    Nota para el revisor: ENGINE §6.2 y `core.regime(warmup_until=7)` mantienen
    `regime='warmup'` hasta `month_index < 7`, mientras que la columna `warmup`
    es `month_index <= 3`. El contrato mock (PLAN §4.1) pide la equivalencia y
    es lo que se comprueba aqui; si falla, el conflicto es del contrato, no del
    generador.
    """
    st = ds.score_timeline
    domain = set(catalog.REGIMES)
    bad_domain = (~st["regime"].astype("object").isin(domain)).to_numpy()
    _check(
        bad_domain, st,
        lambda r: f"{r['company_id']} {r['month']}: regime={r['regime']!r} fuera de {sorted(domain)}",
        "regime fuera del dominio de ENGINE §6.2",
    )
    warm = _bools(st["warmup"]).fillna(False).to_numpy().astype(bool)
    is_warm_regime = (st["regime"].astype("object") == "warmup").to_numpy()
    st_dbg = st.assign(_warm=warm)
    _check(
        warm != is_warm_regime, st_dbg,
        lambda r: (
            f"{r['company_id']} {r['month']}: month_index={r['month_index']!r} "
            f"warmup={r['warmup']!r} regime={r['regime']!r} (deben coincidir)"
        ),
        "regime=='warmup' no equivale a warmup==true",
    )


def inv_alert_budget_and_cooldown(ds: Dataset) -> None:
    """11. Presupuesto <= 5 % deterioro / 2 % mejora por mes y cool-down de 3 meses."""
    alerts = ds.alerts.copy()
    st = ds.score_timeline

    bad_event = (~alerts["event"].astype("object").isin(ALERT_EVENTS)).to_numpy()
    _check(
        bad_event, alerts,
        lambda r: f"{r['alert_id']}: event={r['event']!r} fuera de {sorted(ALERT_EVENTS)}",
        "event de alerta fuera del dominio §2.7",
    )
    bad_dir = (~alerts["direction"].astype("object").isin({"down", "up"})).to_numpy()
    _check(
        bad_dir, alerts,
        lambda r: f"{r['alert_id']}: direction={r['direction']!r} fuera de {{down, up}}",
        "direction de alerta fuera del dominio §2.7",
    )
    bad_sev = (~alerts["severity"].astype("object").isin({"watch", "review", "urgent"})).to_numpy()
    _check(
        bad_sev, alerts,
        lambda r: f"{r['alert_id']}: severity={r['severity']!r} fuera de {{watch, review, urgent}}",
        "severity de alerta fuera del dominio §2.7",
    )

    active = st.groupby("month")["company_id"].nunique()
    if len(alerts):
        counts = alerts.groupby(["month_detected", "direction"])["company_id"].nunique()
        problems = []
        for (month, direction), n in counts.items():
            n_active = int(active.get(month, 0))
            budget = BUDGET_DOWN if direction == "down" else BUDGET_UP
            allowed = budget * n_active
            if n > allowed + TOL:
                problems.append(
                    f"{month} direction={direction}: {n} empresas con alerta sobre "
                    f"{n_active} activas = {100.0 * n / max(n_active, 1):.2f} % "
                    f"(maximo {100.0 * budget:.0f} % => {allowed:.2f})"
                )
        assert not problems, "presupuesto de alertas superado:\n  " + "\n  ".join(problems)

        problems = []
        ordered = alerts.assign(_mi=alerts["month_detected"].map(_month_idx))
        ordered = ordered.sort_values(["company_id", "event", "_mi"])
        for (company_id, event), block in ordered.groupby(["company_id", "event"], sort=False):
            months = block["_mi"].tolist()
            raw = block["month_detected"].tolist()
            for i in range(1, len(months)):
                gap = months[i] - months[i - 1]
                if gap < COOLDOWN_MONTHS:
                    problems.append(
                        f"{company_id} causa={event}: {raw[i - 1]} -> {raw[i]} "
                        f"son {gap} mes(es), cool-down minimo {COOLDOWN_MONTHS}"
                    )
        assert not problems, "cool-down de alertas incumplido:\n  " + "\n  ".join(problems[:10])


def inv_frames_match_active_companies(ds: Dataset) -> None:
    """12. `frames/YYYY-MM.json` = exactamente las empresas activas ese mes."""
    st = ds.score_timeline
    by_month = {
        str(month): set(block["company_id"].astype(str))
        for month, block in st.groupby("month", sort=True)
    }
    files = ds.frame_files()
    missing = sorted(set(by_month) - set(files))
    extra = sorted(set(files) - set(by_month))
    assert not missing and not extra, (
        f"meses de frames/ != meses de score_timeline.csv; faltan={missing} sobran={extra}"
    )

    problems = []
    for month, expected in sorted(by_month.items()):
        payload = ds.frame(month)
        assert payload.get("month") == month, (
            f"frames/{month}.json declara month={payload.get('month')!r}"
        )
        entries = payload.get("companies")
        assert isinstance(entries, list), (
            f"frames/{month}.json: `companies` deberia ser una lista, es {type(entries).__name__}"
        )
        got = {str(entry["company_id"]) for entry in entries}
        if got != expected:
            problems.append(
                f"{month}: sobran {sorted(got - expected)[:5]} faltan {sorted(expected - got)[:5]} "
                f"(frame={len(got)}, activas={len(expected)})"
            )
        if len(got) != len(entries):
            problems.append(f"{month}: `companies` tiene company_id repetidos ({len(entries)} filas, {len(got)} ids)")
    assert not problems, "frames/ no coincide con las empresas activas:\n  " + "\n  ".join(problems[:10])


def inv_group_score_requires_scored_subsidiary(ds: Dataset) -> None:
    """Principio 3: un grupo tiene `score` solo si al menos una filial lo tiene."""
    companies = ds.companies
    group_of = dict(zip(companies["company_id"].astype(str), companies["group_id"].astype(str)))
    st = ds.score_timeline.copy()
    st["_group"] = st["company_id"].astype(str).map(group_of)
    scored = st[~st["score"].isna()]
    with_score = set(zip(scored["_group"], scored["month"].astype(str)))

    gt = ds.group_timeline.copy()
    gt["_key"] = list(zip(gt["group_id"].astype(str), gt["month"].astype(str)))
    has_score = ~gt["score"].isna()
    bad = (has_score & ~gt["_key"].isin(with_score)).to_numpy()
    _check(
        bad, gt,
        lambda r: f"{r['group_id']} {r['month']}: score={r['score']!r} sin ninguna filial con score ese mes",
        "grupo con score sin filial puntuada",
    )


def inv_group_weakest_company_is_the_minimum(ds: Dataset) -> None:
    """Principio 3: `weakest_company` es de verdad la filial de menor score."""
    companies = ds.companies
    group_of = dict(zip(companies["company_id"].astype(str), companies["group_id"].astype(str)))
    st = ds.score_timeline.copy()
    st["_group"] = st["company_id"].astype(str).map(group_of)
    scored = st[~st["score"].isna()]

    mins = scored.groupby(["_group", "month"])["score"].min()
    by_company = {
        (g, str(m), str(c)): s
        for g, m, c, s in zip(scored["_group"], scored["month"], scored["company_id"], scored["score"])
    }

    gt = ds.group_timeline
    problems = []
    for _, row in gt.iterrows():
        weakest = row["weakest_company"]
        if pd.isna(weakest):
            continue
        key = (str(row["group_id"]), str(row["month"]))
        if key not in mins.index:
            problems.append(f"{key[0]} {key[1]}: weakest_company={weakest!r} pero no hay filiales puntuadas")
            continue
        expected_min = float(mins.loc[key])
        got = by_company.get((key[0], key[1], str(weakest)))
        if got is None:
            problems.append(
                f"{key[0]} {key[1]}: weakest_company={weakest!r} no es una filial puntuada del grupo"
            )
            continue
        if abs(float(got) - expected_min) > TOL:
            problems.append(
                f"{key[0]} {key[1]}: weakest_company={weakest!r} con score {got!r}, "
                f"pero el minimo del grupo es {expected_min!r}"
            )
        declared = row["weakest_score"]
        if not pd.isna(declared) and abs(float(declared) - float(got)) > TOL:
            problems.append(
                f"{key[0]} {key[1]}: weakest_score={declared!r} != score de {weakest!r} ({got!r})"
            )
    assert not problems, "weakest_company mal calculado:\n  " + "\n  ".join(problems[:10])


INVARIANTS = (
    ("00-contract-files-exist", inv_files_and_dirs_exist),
    ("00-csv-columns-exact", inv_csv_columns_are_exactly_the_contract),
    ("01-score-is-clip-level-0-cap", inv_score_is_clipped_level),
    ("02-level-is-100-sum-w-pillar-minus-penalty", inv_level_from_pillars_and_weights),
    ("03-contributions-plus-base-minus-penalty-minus-cap-is-score", inv_contributions_sum_to_score),
    ("03b-contribution-is-100-w-times-u-minus-uref", inv_contribution_formula),
    ("04-delta-1m-and-its-decomposition", inv_delta_1m_and_its_decomposition),
    ("04b-delta-vs-prev-is-contribution-diff", inv_delta_vs_prev_matches_contribution_diff),
    ("05-outlook-low-le-h6-le-high", inv_outlook_band_is_ordered),
    ("06-band-matches-score-thresholds", inv_band_matches_score),
    ("07-invoice-signals-unavailable-and-u-null", inv_invoice_signals_unavailable_without_invoices),
    ("08-warmup-flags-and-no-alerts-in-warmup", inv_warmup_flags_and_no_alerts),
    ("09-signal-weights-sum-to-one", inv_signal_weights_sum_to_one),
    ("10-regime-domain-and-warmup-equivalence", inv_regime_domain_and_warmup),
    ("11-alert-budget-and-cooldown", inv_alert_budget_and_cooldown),
    ("12-frames-match-active-companies", inv_frames_match_active_companies),
    ("13-group-score-requires-scored-subsidiary", inv_group_score_requires_scored_subsidiary),
    ("14-group-weakest-company-is-minimum", inv_group_weakest_company_is_the_minimum),
)


@pytest.mark.parametrize(
    "invariant",
    [pytest.param(fn, id=name) for name, fn in INVARIANTS],
)
def test_all_invariants_hold_on_generated_csv(dataset: Dataset, invariant) -> None:
    """Cada invariante del contrato, una por id de parametrizacion."""
    invariant(dataset)


# =======================================================================
# Casos fijados (contrato §3)
# =======================================================================

def _series(ds: Dataset, company_id: str, column: str = "score") -> pd.Series:
    st = ds.score_timeline
    block = st[st["company_id"].astype(str) == company_id].sort_values("month")
    assert len(block) >= 12, (
        f"{company_id}: solo {len(block)} meses en score_timeline.csv; "
        "los casos fijados del contrato §3 necesitan la serie completa"
    )
    return pd.Series(_num(block[column]).tolist(), index=block["month"].tolist())


def _thirds(values: np.ndarray) -> tuple[float, float]:
    k = max(1, len(values) // 3)
    return float(np.nanmean(values[:k])), float(np.nanmean(values[-k:]))


def _slope(values: np.ndarray) -> float:
    from scipy.stats import theilslopes

    x = np.arange(len(values), dtype="float64")
    ok = ~np.isnan(values)
    return float(theilslopes(values[ok], x[ok])[0])


def _rises(name: str, s: pd.Series) -> None:
    v = s.to_numpy()
    first, last = _thirds(v)
    slope = _slope(v)
    assert last >= first + 8.0 and slope > 0.0, (
        f"{name} deberia subir de forma sostenida: media del primer tercio={first:.2f}, "
        f"del ultimo={last:.2f} (se exige +8 puntos), pendiente Theil-Sen={slope:.3f} pts/mes "
        f"(se exige > 0). Serie: {np.round(v, 1).tolist()}"
    )


#: Tamano minimo del escalon del contrato §3 (`±U(6, 18)`).
STEP_GAP = 6.0


def _best_split(values: np.ndarray, min_side: int = 4) -> tuple[int, float]:
    """Corte que maximiza `media(antes) − media(despues)`."""
    best_k, best_gap = min_side, -math.inf
    for k in range(min_side, len(values) - min_side + 1):
        gap = float(np.nanmean(values[:k]) - np.nanmean(values[k:]))
        if gap > best_gap:
            best_k, best_gap = k, gap
    return best_k, best_gap


def _sse_step(values: np.ndarray, k: int) -> float:
    """Residuo del modelo "dos niveles" (escalon en `k`)."""
    a, b = values[:k], values[k:]
    return float(np.nansum((a - np.nanmean(a)) ** 2) + np.nansum((b - np.nanmean(b)) ** 2))


def _sse_line(values: np.ndarray) -> float:
    """Residuo del modelo "recta" (tendencia lineal)."""
    x = np.arange(len(values), dtype="float64")
    slope, intercept = np.polyfit(x, values, 1)
    return float(np.nansum((values - (slope * x + intercept)) ** 2))


def _steps_down(name: str, s: pd.Series) -> None:
    v = s.to_numpy()
    k, gap = _best_split(v)
    sse_step, sse_line = _sse_step(v, k), _sse_line(v)
    assert gap >= STEP_GAP, (
        f"{name} deberia tener un escalon a la baja: el mejor corte esta en {s.index[k]} "
        f"y solo baja el nivel medio {gap:.2f} puntos (se exige >= {STEP_GAP:.0f}, el escalon "
        f"minimo del contrato §3). Serie: {np.round(v, 1).tolist()}"
    )
    assert sse_step < sse_line, (
        f"{name} deberia ser un ESCALON, no una tendencia: el modelo de dos niveles en "
        f"{s.index[k]} deja residuo {sse_step:.1f} y la recta {sse_line:.1f} (la recta explica "
        f"la serie igual o mejor). Serie: {np.round(v, 1).tolist()}"
    )


def _declines_gradually(name: str, s: pd.Series) -> None:
    v = s.to_numpy()
    first, last = _thirds(v)
    slope = _slope(v)
    k, gap = _best_split(v)
    sse_step, sse_line = _sse_step(v, k), _sse_line(v)
    assert slope <= -0.3 and last <= first - 5.0, (
        f"{name} deberia caer gradualmente: pendiente Theil-Sen={slope:.3f} pts/mes "
        f"(se exige <= -0,3; la tendencia minima del contrato §3 es 0,4) y "
        f"media primer tercio={first:.2f} vs ultimo={last:.2f} (se exige -5 puntos). "
        f"Serie: {np.round(v, 1).tolist()}"
    )
    assert not (gap >= STEP_GAP and sse_step < sse_line), (
        f"{name} deberia caer gradualmente, no por escalon: en {s.index[k]} el nivel medio baja "
        f"{gap:.2f} puntos y el modelo de dos niveles (residuo {sse_step:.1f}) explica la serie "
        f"mejor que la recta (residuo {sse_line:.1f}). Serie: {np.round(v, 1).tolist()}"
    )


def _dips_and_reverts(name: str, s: pd.Series) -> None:
    v = s.to_numpy()
    median = float(np.nanmedian(v))
    interior = v[1:-1]
    m = int(np.nanargmin(interior)) + 1
    after_win = v[m + 1: m + 4]
    after = float(np.nanmax(after_win)) if len(after_win) else float("nan")
    first, last = _thirds(v)
    assert median - v[m] >= 7.0, (
        f"{name} deberia tener un bache: el minimo interior es {v[m]:.2f} en {s.index[m]}, "
        f"solo {median - v[m]:.2f} puntos por debajo de la mediana {median:.2f} "
        f"(el bache del contrato §3 es -U(8, 20); se exige >= 7, un punto de margen por el "
        f"ruido N(0,2)). Serie: {np.round(v, 1).tolist()}"
    )
    assert not math.isnan(after) and after >= median - 3.0, (
        f"{name}: el bache de {s.index[m]} no revierte; el maximo de los 3 meses siguientes es "
        f"{after:.2f} y la mediana de la serie {median:.2f} (se exige recuperar a -3 puntos). "
        f"Serie: {np.round(v, 1).tolist()}"
    )
    assert abs(last - first) <= 8.0, (
        f"{name} deberia ser un bache, no una tendencia: media primer tercio={first:.2f}, "
        f"ultimo={last:.2f} (se exige |diferencia| <= 8). Serie: {np.round(v, 1).tolist()}"
    )


def test_fixed_cases_have_expected_shapes(dataset: Dataset) -> None:
    """Los 14 casos fijados del contrato §3, por FORMA de la serie, no por valor.

    Umbrales elegidos (calibrados con el modelo generador del contrato §3:
    escalon +-U(6,18), tendencia +-U(0,4, 1,0) pts/mes, bache -U(8,20), ruido
    N(0,2) con AR(1) 0,3):

    - "sube de forma sostenida": media del ultimo tercio >= media del primero
      + 8 puntos Y pendiente Theil-Sen > 0.
    - "escalon a la baja": en el corte que maximiza `media(antes) - media(despues)`
      esa diferencia es >= 6 puntos (escalon minimo del contrato) Y el modelo de
      dos niveles deja menos residuo que una recta. Se mira el nivel medio y no
      la mayor caida mensual porque con ruido N(0,2) + AR(1) un solo mes no
      distingue escalon de tendencia.
    - "cae gradualmente": pendiente Theil-Sen <= -0,3 pts/mes Y ultimo tercio
      <= primero - 5 Y la serie NO se explica mejor como escalon que como recta.
    - "bache que revierte": minimo interior >= 7 puntos por debajo de la mediana
      de la serie (el bache del contrato es -U(8, 20), con un punto de margen
      por el ruido), recuperacion hasta -3 puntos de esa mediana en <= 3 meses,
      y deriva neta |ultimo tercio - primer tercio| <= 8. Una serie plana con
      ruido N(0,2)+AR(1) pasa este filtro menos del 1 % de las veces.
    - "tension de caja" (COMP_1267): pilar P (pago propio) al menos 0,10 por
      debajo del pilar C (cobros) en la media de los ultimos 6 meses -- cobra
      antes de lo que paga -- y score no creciente por tercios.
    - "caida de caja en un mes" (COMP_0905, COMP_1250): algun mes con caida del
      pilar L >= 0,15 acompanada de una caida de score >= 4 puntos.
    - "desapalancamiento sano" (COMP_0354): pilar D del ultimo tercio >= primer
      tercio + 0,08 y `strength_flags` con el codigo de desapalancamiento en
      algun mes.
    - "solida" (COMP_0016): ultimo mes en banda `solid` (score >= 80).
    """
    if not dataset.is_full:
        pytest.skip(
            "los casos fijados del contrato §3 solo existen en el dataset completo; "
            "esta sesion corre sobre una generacion `--limit 50`"
        )

    for company_id in ("COMP_0108", "COMP_1061", "COMP_0866"):
        _rises(company_id, _series(dataset, company_id))

    for company_id in ("COMP_0519", "COMP_0766"):
        _steps_down(company_id, _series(dataset, company_id))

    for company_id in ("COMP_1015", "COMP_0651"):
        _declines_gradually(company_id, _series(dataset, company_id))

    for company_id in ("COMP_0099", "COMP_1022"):
        _dips_and_reverts(company_id, _series(dataset, company_id))

    # COMP_1267: tension de caja (cobra antes, paga tarde).
    pillar_p = _series(dataset, "COMP_1267", "pillar_P").to_numpy()[-6:]
    pillar_c = _series(dataset, "COMP_1267", "pillar_C").to_numpy()[-6:]
    mean_p, mean_c = float(np.nanmean(pillar_p)), float(np.nanmean(pillar_c))
    assert mean_p <= mean_c - 0.10, (
        f"COMP_1267 deberia mostrar tension de caja (cobra antes, paga tarde): media de "
        f"pillar_P en los ultimos 6 meses={mean_p:.3f} frente a pillar_C={mean_c:.3f} "
        "(se exige P <= C - 0,10)"
    )
    first, last = _thirds(_series(dataset, "COMP_1267").to_numpy())
    assert last <= first, (
        f"COMP_1267 esta en tension: su score no deberia mejorar por tercios "
        f"(primer tercio={first:.2f}, ultimo={last:.2f})"
    )

    # COMP_0905, COMP_1250: caida de caja en un mes.
    for company_id in ("COMP_0905", "COMP_1250"):
        liquidity = _series(dataset, company_id, "pillar_L").to_numpy()
        scores = _series(dataset, company_id).to_numpy()
        d_liq = np.diff(liquidity)
        d_score = np.diff(scores)
        hit = np.where((d_liq <= -0.15) & (d_score <= -4.0))[0]
        assert len(hit), (
            f"{company_id} deberia tener una caida de caja en un mes: no hay ningun mes con "
            f"caida de pillar_L <= -0,15 y de score <= -4 a la vez. "
            f"Peor mes de pillar_L={np.nanmin(d_liq):.3f}, peor mes de score={np.nanmin(d_score):.2f}"
        )

    # COMP_0354: desapalancamiento sano.
    pillar_d = _series(dataset, "COMP_0354", "pillar_D").to_numpy()
    first_d, last_d = _thirds(pillar_d)
    assert last_d >= first_d + 0.08, (
        f"COMP_0354 deberia desapalancarse: pillar_D primer tercio={first_d:.3f}, "
        f"ultimo={last_d:.3f} (se exige +0,08)"
    )
    st = dataset.score_timeline
    flags = st.loc[st["company_id"].astype(str) == "COMP_0354", "strength_flags"]
    joined = " ".join(str(f) for f in flags.dropna()).lower()
    assert "delever" in joined, (
        "COMP_0354 deberia llevar el flag de desapalancamiento en `strength_flags` "
        f"(§2.3 lo llama DELEVERAGING, catalog.py `debt_serviced_and_deleveraging`); "
        f"valores vistos: {sorted(set(str(f) for f in flags.dropna()))[:5]}"
    )

    # COMP_0016: solida.
    solid = dataset.score_timeline
    block = solid[solid["company_id"].astype(str) == "COMP_0016"].sort_values("month")
    last_row = block.iloc[-1]
    assert str(last_row["band"]) == "solid" and float(last_row["score"]) >= 80.0, (
        f"COMP_0016 deberia acabar en banda solid: ultimo mes {last_row['month']} "
        f"score={last_row['score']!r} band={last_row['band']!r}"
    )


# =======================================================================
# Determinismo
# =======================================================================

def _digest_tree(root: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1 << 20), b""):
                digest.update(chunk)
        out[str(path.relative_to(root))] = digest.hexdigest()
    return out


def test_generation_is_deterministic(tmp_path_factory) -> None:
    """Dos ejecuciones con `--seed 42 --limit 50 --now <fijo>` son iguales byte a byte."""
    _require_generator()
    first = tmp_path_factory.mktemp("determinism_a")
    second = tmp_path_factory.mktemp("determinism_b")
    run_generator(first, limit=LIMIT, seed=SEED)
    run_generator(second, limit=LIMIT, seed=SEED)

    a, b = _digest_tree(first), _digest_tree(second)
    only_a = sorted(set(a) - set(b))
    only_b = sorted(set(b) - set(a))
    assert not only_a and not only_b, (
        "las dos generaciones no producen el mismo conjunto de ficheros:\n"
        f"  solo en la primera: {only_a[:10]}\n  solo en la segunda: {only_b[:10]}"
    )
    different = [name for name in sorted(a) if a[name] != b[name]]
    assert not different, (
        f"{len(different)} fichero(s) difieren byte a byte entre dos generaciones con "
        f"--seed {SEED} --limit {LIMIT} --now {NOW}: {different[:10]}"
    )
