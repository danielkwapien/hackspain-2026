"""`exports/v1/` cumple el contrato dashboard-v1 mas la extension `xray`.

Fuentes: `docs/dani/contrato-dashboard-v1.md` §3 (forma de `results/<id>.json`),
`plans/00-reference/mock-data-contract.md` §2.10 (que anade el mock) y §1
(manifest con `data_kind`, seed y hashes de origen).

Como en `test_mock_invariants.py`, estos tests se escriben contra el contrato:
no importan `export.py` ni `generate_mock.py`. Solo se apoyan en
`xray_mock.catalog` (dominios congelados) y en `xray_mock.real_inputs`
(`source_hashes`, que es la definicion de los hashes de origen).

De donde salen los datos: si existe `datasets_mocked/manifest.json` se corre
sobre el dataset completo; si no, la fixture genera uno con `--limit 50` en un
directorio temporal. Si el generador aun no existe, `skip` con mensaje claro.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
import sys
from pathlib import Path

import pytest

from xray_mock import catalog, real_inputs

REPO_ROOT = Path(__file__).resolve().parents[2]
MOCK_DIR = REPO_ROOT / "datasets_mocked"
DATA_DIR = REPO_ROOT / "datasets"
GENERATOR = MOCK_DIR / "generate_mock.py"
PYTHON = Path(sys.executable)

NOW = "2026-09-19T00:00:00+00:00"
SEED = 42
LIMIT = 50
GEN_TIMEOUT_S = 600

#: Muestra determinista de `results/COMP_*.json`.
SAMPLE_SIZE = 25

CONTRACT_VERSION = "dashboard-v1"
MODEL_VERSION = "mock-v1"      # contrato mock §2.10
DATA_VERSION = "embat-v2"      # contrato mock §2.10
BASIS = "mock"                 # contrato mock §2.10

STATUS_DOMAIN = {"available", "partial", "insufficient_data"}
STATUS_FORBIDDEN = "pending_engine"
STATUS_WITHOUT_SCORE = {"insufficient_data", "pending_engine"}

TRAJECTORY_DIRECTIONS = {"improving", "stable", "deteriorating", "unknown"}
ALERT_KINDS = {"deterioration", "improvement"}
BANDS = {name for name, _, _ in catalog.BANDS}
PILLARS = {"L", "P", "C", "D", "A"}
HEADLINE_MAX = 70

MONTH_RE = re.compile(r"^\d{4}-\d{2}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")

TOL = 1e-6

Number = (int, float)


# --- Bootstrap del dataset ---------------------------------------------
# Duplicado a proposito con `test_mock_invariants.py`: esta tarea solo puede
# escribir estos dos ficheros (no hay `conftest.py` propio de `tests/`) y el
# check ejecuta cada fichero en su propia invocacion de pytest.

def _require_generator() -> None:
    if not GENERATOR.exists():
        pytest.skip(
            f"el generador todavia no existe: {GENERATOR} no esta en disco. "
            "Los tests de contrato corren en cuanto el builder lo escriba "
            "(no es un fallo de este fichero)."
        )


def _run_generator(out_dir: Path) -> None:
    _require_generator()
    cmd = [
        str(PYTHON), str(GENERATOR),
        "--seed", str(SEED),
        "--data-dir", "datasets",
        "--out", str(out_dir),
        "--inventory", "app/exports/v1",
        "--now", NOW,
        "--limit", str(LIMIT),
    ]
    try:
        proc = subprocess.run(
            cmd, cwd=REPO_ROOT, capture_output=True, text=True,
            timeout=GEN_TIMEOUT_S, check=False,
        )
    except subprocess.TimeoutExpired:
        raise AssertionError(
            f"el generador no termino en {GEN_TIMEOUT_S}s con --limit {LIMIT}"
        ) from None
    if proc.returncode != 0:
        raise AssertionError(
            "el generador fallo (exit {}):\n  cmd: {}\n  stderr:\n{}".format(
                proc.returncode, " ".join(cmd), proc.stderr[-4000:]
            )
        )


class MockRoot:
    def __init__(self, root: Path, is_full: bool):
        self.root = root
        self.is_full = is_full

    @property
    def exports(self) -> Path:
        path = self.root / "exports" / "v1"
        assert path.is_dir(), f"falta `exports/v1/` en {self.root} (contrato §1)"
        return path

    @property
    def results(self) -> Path:
        path = self.exports / "results"
        assert path.is_dir(), f"falta `exports/v1/results/` en {self.root} (contrato §1)"
        return path


@pytest.fixture(scope="session")
def mock_root(tmp_path_factory) -> MockRoot:
    if (MOCK_DIR / "manifest.json").exists():
        return MockRoot(MOCK_DIR, is_full=True)
    _require_generator()
    out = tmp_path_factory.mktemp("mock_limit50")
    _run_generator(out)
    return MockRoot(out, is_full=False)


@pytest.fixture(scope="session")
def company_results(mock_root: MockRoot) -> list[Path]:
    """Muestra determinista de hasta 25 `results/COMP_*.json`, repartida."""
    paths = sorted(mock_root.results.glob("COMP_*.json"))
    assert paths, f"no hay ningun `results/COMP_*.json` en {mock_root.results}"
    if len(paths) <= SAMPLE_SIZE:
        return paths
    step = len(paths) // SAMPLE_SIZE
    return [paths[i * step] for i in range(SAMPLE_SIZE)]


def _load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise AssertionError(f"{path.name} no es JSON valido: {exc}") from None


def _fail(problems: list[str], what: str) -> None:
    assert not problems, f"{what}:\n  " + "\n  ".join(problems[:20])


def _is_number(value) -> bool:
    return isinstance(value, Number) and not isinstance(value, bool) and not (
        isinstance(value, float) and math.isnan(value)
    )


def _check_keys(where: str, payload: dict, keys, problems: list[str]) -> None:
    if not isinstance(payload, dict):
        problems.append(f"{where}: se esperaba un objeto, hay {type(payload).__name__}")
        return
    for key in keys:
        if key not in payload:
            problems.append(f"{where}: falta la clave `{key}` (presentes: {sorted(payload)})")


# =======================================================================
# §3 del contrato dashboard-v1
# =======================================================================

def test_results_json_matches_dashboard_v1_contract(company_results: list[Path]) -> None:
    """Claves, tipos y dominios de §3 sobre una muestra determinista de 25 ids.

    `forecast` se valida SOLO si esta presente: el contrato mock §2.10 enumera
    lo que el mock escribe y no lo incluye (el horizonte vive en `xray.outlook`).
    """
    problems: list[str] = []

    for path in company_results:
        name = path.name
        payload = _load(path)
        _check_keys(
            name, payload,
            ("contract_version", "entity", "cutoff_date", "model_version",
             "data_version", "status", "score", "months", "trajectory",
             "quality", "alerts"),
            problems,
        )
        if not isinstance(payload, dict):
            continue

        if payload.get("contract_version") != CONTRACT_VERSION:
            problems.append(
                f"{name}: contract_version={payload.get('contract_version')!r}, esperado {CONTRACT_VERSION!r}"
            )
        if payload.get("model_version") != MODEL_VERSION:
            problems.append(
                f"{name}: model_version={payload.get('model_version')!r}, esperado {MODEL_VERSION!r} (§2.10)"
            )
        if payload.get("data_version") != DATA_VERSION:
            problems.append(
                f"{name}: data_version={payload.get('data_version')!r}, esperado {DATA_VERSION!r} (§2.10)"
            )

        entity = payload.get("entity")
        if not isinstance(entity, dict):
            problems.append(f"{name}: `entity` deberia ser objeto, es {type(entity).__name__}")
        else:
            if entity.get("kind") != "company":
                problems.append(f"{name}: entity.kind={entity.get('kind')!r}, esperado 'company'")
            if entity.get("id") != path.stem:
                problems.append(f"{name}: entity.id={entity.get('id')!r}, esperado {path.stem!r}")

        cutoff = payload.get("cutoff_date")
        if not isinstance(cutoff, str) or not DATE_RE.match(cutoff):
            problems.append(f"{name}: cutoff_date={cutoff!r}, esperado 'YYYY-MM-DD'")

        status = payload.get("status")
        if status == STATUS_FORBIDDEN:
            problems.append(
                f"{name}: status={STATUS_FORBIDDEN!r}, que el mock nunca debe publicar (§2.10)"
            )
        elif status not in STATUS_DOMAIN:
            problems.append(f"{name}: status={status!r} fuera de {sorted(STATUS_DOMAIN)}")

        score = payload.get("score")
        if status in STATUS_WITHOUT_SCORE:
            if score is not None:
                problems.append(f"{name}: status={status!r} exige score null, hay {score!r}")
        elif status in STATUS_DOMAIN:
            if not _is_number(score):
                problems.append(f"{name}: status={status!r} exige score numerico, hay {score!r}")
            elif not (0.0 - TOL <= float(score) <= 100.0 + TOL):
                problems.append(f"{name}: score={score!r} fuera de [0, 100]")

        months = payload.get("months")
        if not isinstance(months, list) or not months:
            problems.append(f"{name}: `months` deberia ser una lista no vacia, es {months!r}")
        else:
            seen: list[str] = []
            for i, month in enumerate(months):
                where = f"{name} months[{i}]"
                _check_keys(
                    where, month,
                    ("month", "score", "basis", "coverage", "contributions", "change_vs_prev"),
                    problems,
                )
                if not isinstance(month, dict):
                    continue
                label = month.get("month")
                if not isinstance(label, str) or not MONTH_RE.match(label):
                    problems.append(f"{where}: month={label!r}, esperado 'YYYY-MM'")
                else:
                    seen.append(label)
                if month.get("basis") != BASIS:
                    problems.append(f"{where}: basis={month.get('basis')!r}, esperado {BASIS!r} (§2.10)")
                m_score = month.get("score")
                if m_score is not None and not _is_number(m_score):
                    problems.append(f"{where}: score={m_score!r} no es numero ni null")

                coverage = month.get("coverage")
                if not isinstance(coverage, dict):
                    problems.append(f"{where}: `coverage` deberia ser objeto, es {type(coverage).__name__}")
                else:
                    _check_keys(f"{where}.coverage", coverage, ("months_observed", "reason"), problems)
                    observed = coverage.get("months_observed")
                    if observed is not None and not _is_number(observed):
                        problems.append(f"{where}.coverage: months_observed={observed!r} no es numero ni null")

                contributions = month.get("contributions")
                if not isinstance(contributions, list):
                    problems.append(f"{where}: `contributions` deberia ser lista, es {type(contributions).__name__}")
                else:
                    if _is_number(m_score) and not contributions:
                        problems.append(f"{where}: score={m_score!r} pero `contributions` esta vacio")
                    for j, contribution in enumerate(contributions[:3]):
                        _check_keys(
                            f"{where}.contributions[{j}]", contribution,
                            ("signal", "value", "weight", "contribution", "direction"),
                            problems,
                        )
                        if isinstance(contribution, dict):
                            if not isinstance(contribution.get("signal"), str):
                                problems.append(
                                    f"{where}.contributions[{j}]: signal={contribution.get('signal')!r} no es texto"
                                )
                            for key in ("weight", "contribution"):
                                val = contribution.get(key)
                                if val is not None and not _is_number(val):
                                    problems.append(
                                        f"{where}.contributions[{j}]: {key}={val!r} no es numero ni null"
                                    )

                change = month.get("change_vs_prev")
                if not isinstance(change, dict):
                    problems.append(f"{where}: `change_vs_prev` deberia ser objeto, es {type(change).__name__}")
                else:
                    _check_keys(f"{where}.change_vs_prev", change, ("delta", "drivers"), problems)
                    delta = change.get("delta")
                    if delta is not None and not _is_number(delta):
                        problems.append(f"{where}.change_vs_prev: delta={delta!r} no es numero ni null")
                    drivers = change.get("drivers")
                    if not isinstance(drivers, list):
                        problems.append(
                            f"{where}.change_vs_prev: `drivers` deberia ser lista, es {type(drivers).__name__}"
                        )
                    else:
                        for j, driver in enumerate(drivers[:3]):
                            _check_keys(
                                f"{where}.change_vs_prev.drivers[{j}]", driver,
                                ("signal", "delta", "contribution"), problems,
                            )
            if seen != sorted(seen):
                problems.append(f"{name}: `months` no esta ordenado cronologicamente ({seen[:5]}...)")
            if len(set(seen)) != len(seen):
                problems.append(f"{name}: `months` repite algun mes")

        trajectory = payload.get("trajectory")
        if not isinstance(trajectory, dict):
            problems.append(f"{name}: `trajectory` deberia ser objeto, es {type(trajectory).__name__}")
        else:
            _check_keys(f"{name}.trajectory", trajectory, ("direction", "months_in_direction", "regime"), problems)
            if trajectory.get("direction") not in TRAJECTORY_DIRECTIONS:
                problems.append(
                    f"{name}.trajectory: direction={trajectory.get('direction')!r} "
                    f"fuera de {sorted(TRAJECTORY_DIRECTIONS)}"
                )
            regime = trajectory.get("regime")
            if regime is not None and regime not in set(catalog.REGIMES):
                problems.append(
                    f"{name}.trajectory: regime={regime!r} fuera de {sorted(catalog.REGIMES)}"
                )
            mid = trajectory.get("months_in_direction")
            if mid is not None and not _is_number(mid):
                problems.append(f"{name}.trajectory: months_in_direction={mid!r} no es numero ni null")

        quality = payload.get("quality")
        if not isinstance(quality, dict):
            problems.append(f"{name}: `quality` deberia ser objeto, es {type(quality).__name__}")
        else:
            _check_keys(f"{name}.quality", quality, ("coverage_ratio", "reasons"), problems)
            ratio = quality.get("coverage_ratio")
            if ratio is not None and (not _is_number(ratio) or not (0.0 - TOL <= float(ratio) <= 1.0 + TOL)):
                problems.append(f"{name}.quality: coverage_ratio={ratio!r} fuera de [0, 1]")
            if not isinstance(quality.get("reasons"), list):
                problems.append(f"{name}.quality: `reasons` deberia ser lista, es {quality.get('reasons')!r}")

        alerts = payload.get("alerts")
        if not isinstance(alerts, list):
            problems.append(f"{name}: `alerts` deberia ser lista, es {type(alerts).__name__}")
        else:
            for j, alert in enumerate(alerts):
                where = f"{name} alerts[{j}]"
                _check_keys(where, alert, ("id", "month", "kind", "severity", "signal", "message", "evidence"), problems)
                if isinstance(alert, dict):
                    if alert.get("kind") not in ALERT_KINDS:
                        problems.append(f"{where}: kind={alert.get('kind')!r} fuera de {sorted(ALERT_KINDS)}")
                    month_label = alert.get("month")
                    if not isinstance(month_label, str) or not MONTH_RE.match(month_label):
                        problems.append(f"{where}: month={month_label!r}, esperado 'YYYY-MM'")
                    if not isinstance(alert.get("message"), str):
                        problems.append(f"{where}: message={alert.get('message')!r} no es texto")

        forecast = payload.get("forecast")
        if forecast is not None:
            if not isinstance(forecast, dict):
                problems.append(f"{name}: `forecast` deberia ser objeto o null, es {type(forecast).__name__}")
            else:
                _check_keys(
                    f"{name}.forecast", forecast,
                    ("origin", "horizon_months", "currency", "points"), problems,
                )
                points = forecast.get("points")
                if not isinstance(points, list):
                    problems.append(f"{name}.forecast: `points` deberia ser lista, es {points!r}")
                else:
                    for j, point in enumerate(points[:3]):
                        _check_keys(f"{name}.forecast.points[{j}]", point, ("month", "p10", "p50", "p90"), problems)

    _fail(problems, f"results/*.json no cumplen dashboard-v1 §3 ({len(company_results)} ficheros revisados)")


def test_results_json_has_xray_extension(company_results: list[Path]) -> None:
    """Extension `xray` del contrato mock §2.10: banda, outlook, confianza, narrativa."""
    problems: list[str] = []
    with_values = 0

    for path in company_results:
        name = path.name
        payload = _load(path)
        xray = payload.get("xray")
        if not isinstance(xray, dict):
            problems.append(f"{name}: falta el bloque `xray` (o no es objeto): {type(xray).__name__}")
            continue
        _check_keys(
            f"{name}.xray", xray,
            ("band", "outlook", "confidence", "pillars", "strength_flags", "narrative"),
            problems,
        )

        band = xray.get("band")
        if band is not None:
            if band not in BANDS:
                problems.append(f"{name}.xray: band={band!r} fuera de {sorted(BANDS)}")
            else:
                with_values += 1

        outlook = xray.get("outlook")
        if not isinstance(outlook, dict):
            problems.append(f"{name}.xray: `outlook` deberia ser objeto, es {type(outlook).__name__}")
        else:
            _check_keys(f"{name}.xray.outlook", outlook, ("low", "h6", "high"), problems)
            low, h6, high = outlook.get("low"), outlook.get("h6"), outlook.get("high")
            if all(v is not None for v in (low, h6, high)):
                if not all(_is_number(v) for v in (low, h6, high)):
                    problems.append(f"{name}.xray.outlook: low/h6/high no son numeros: {low!r}, {h6!r}, {high!r}")
                elif not (float(low) <= float(h6) + TOL and float(h6) <= float(high) + TOL):
                    problems.append(
                        f"{name}.xray.outlook: no se cumple low <= h6 <= high "
                        f"(low={low!r}, h6={h6!r}, high={high!r})"
                    )

        confidence = xray.get("confidence")
        if confidence is not None:
            if not _is_number(confidence) or not (0.0 - TOL <= float(confidence) <= 1.0 + TOL):
                problems.append(f"{name}.xray: confidence={confidence!r} fuera de [0, 1]")

        pillars = xray.get("pillars")
        if not isinstance(pillars, dict) or not pillars:
            problems.append(f"{name}.xray: `pillars` deberia ser un objeto no vacio, es {pillars!r}")
        else:
            unknown = sorted(set(pillars) - PILLARS)
            if unknown:
                problems.append(f"{name}.xray.pillars: claves fuera de L/P/C/D/A: {unknown}")
            for key, value in pillars.items():
                raw = value.get("value") if isinstance(value, dict) else value
                if raw is not None and (not _is_number(raw) or not (0.0 - TOL <= float(raw) <= 1.0 + TOL)):
                    problems.append(f"{name}.xray.pillars[{key}]: valor {raw!r} fuera de [0, 1]")

        flags = xray.get("strength_flags")
        if not isinstance(flags, (list, str)):
            problems.append(
                f"{name}.xray: `strength_flags` deberia ser lista o cadena (§2.3), es {type(flags).__name__}"
            )

        narrative = xray.get("narrative")
        if not isinstance(narrative, dict):
            problems.append(f"{name}.xray: `narrative` deberia ser objeto, es {type(narrative).__name__}")
            continue
        _check_keys(f"{name}.xray.narrative", narrative, ("headline", "guardrail_passed"), problems)
        headline = narrative.get("headline")
        if not isinstance(headline, str) or not headline.strip():
            problems.append(f"{name}.xray.narrative: headline={headline!r} no es texto util")
        elif len(headline) > HEADLINE_MAX:
            problems.append(
                f"{name}.xray.narrative: headline de {len(headline)} caracteres "
                f"(maximo {HEADLINE_MAX}, §2.8): {headline!r}"
            )
        if narrative.get("guardrail_passed") is not True:
            problems.append(
                f"{name}.xray.narrative: guardrail_passed={narrative.get('guardrail_passed')!r}, esperado true"
            )

    _fail(problems, f"la extension `xray` no cumple §2.10 ({len(company_results)} ficheros revisados)")
    assert with_values > 0, (
        "ningun fichero de la muestra trae `xray.band` con valor: un bloque `xray` "
        "entero a null no cumple la extension del contrato"
    )


def test_manifest_marks_data_kind_mock(mock_root: MockRoot) -> None:
    """`manifest.json` (raiz y exports) etiqueta el mock y traza los CSV de origen."""
    problems: list[str] = []
    manifests = {
        "manifest.json": mock_root.root / "manifest.json",
        "exports/v1/manifest.json": mock_root.exports / "manifest.json",
    }
    for label, path in manifests.items():
        assert path.exists(), f"falta `{label}` en {mock_root.root} (contrato §1 y §5)"

    payloads = {label: _load(path) for label, path in manifests.items()}

    for label, payload in payloads.items():
        if payload.get("data_kind") != "mock":
            problems.append(f"{label}: data_kind={payload.get('data_kind')!r}, esperado 'mock' (principio 5)")
        for key in ("seed", "generator_version", "model_version", "generated_at"):
            if key not in payload:
                problems.append(f"{label}: falta la clave `{key}` (presentes: {sorted(payload)})")
        seed = payload.get("seed")
        if seed is not None and not isinstance(seed, int):
            problems.append(f"{label}: seed={seed!r} deberia ser entero")
        if payload.get("model_version") not in (None, MODEL_VERSION):
            problems.append(f"{label}: model_version={payload.get('model_version')!r}, esperado {MODEL_VERSION!r}")
        generated_at = payload.get("generated_at")
        if not isinstance(generated_at, str) or not DATE_RE.match(generated_at):
            problems.append(f"{label}: generated_at={generated_at!r} no parece una marca ISO-8601")

    if not mock_root.is_full:
        # Este dataset lo ha generado la fixture: `--seed 42 --now` fijo.
        for label, payload in payloads.items():
            if payload.get("seed") != SEED:
                problems.append(f"{label}: seed={payload.get('seed')!r}, generado con --seed {SEED}")
            if payload.get("generated_at") != NOW:
                problems.append(
                    f"{label}: generated_at={payload.get('generated_at')!r}, generado con --now {NOW}"
                )

    # Hashes de los CSV de `datasets/`: el manifest tiene que traer los mismos
    # que `real_inputs.source_hashes` calcula ahora mismo.
    expected = real_inputs.source_hashes(DATA_DIR)
    assert expected, f"no hay CSV de origen en {DATA_DIR}: el test no puede comprobar nada"

    found: set[str] = set()

    def _walk(node) -> None:
        if isinstance(node, dict):
            for value in node.values():
                _walk(value)
        elif isinstance(node, list):
            for value in node:
                _walk(value)
        elif isinstance(node, str) and SHA256_RE.match(node):
            found.add(node)

    _walk(payloads["manifest.json"])
    missing = [
        f"{item['file']} ({item['sha256'][:12]}...)"
        for item in expected
        if item["sha256"] not in found
    ]
    if missing:
        problems.append(
            "manifest.json no trae el SHA-256 de origen de: "
            + ", ".join(missing)
            + f"; hashes encontrados en el manifest: {len(found)}"
        )

    results = mock_root.results
    groups = sorted(results.glob("GROUP_*.json"))
    if not groups:
        problems.append(f"no hay ningun `results/GROUP_*.json` en {results} (contrato §1)")
    else:
        payload = _load(groups[0])
        entity = payload.get("entity")
        if not isinstance(entity, dict) or entity.get("kind") != "group":
            problems.append(f"{groups[0].name}: entity={entity!r}, esperado kind 'group'")
        if entity and entity.get("id") != groups[0].stem:
            problems.append(f"{groups[0].name}: entity.id={entity.get('id')!r}, esperado {groups[0].stem!r}")

    _fail(problems, "el manifest del mock no cumple el contrato §1/§5")
