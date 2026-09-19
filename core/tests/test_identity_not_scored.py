"""Nombre, pais e industria son apariencia: no entran en el calculo del score.

`entity_profile` existe para que la pantalla deje de enseñar `COMP_1053`. Es
presentacion, y la linea entre presentacion y juicio tiene que poder
comprobarse, no solo prometerse. Si algun dia el sector quisiera usarse para
comparar, tendria que decirse explicitamente que es inferido, no dado.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

CORE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CORE))

#: Lo que el motor no puede nombrar.
#:
#: `country` y `currency` NO estan aqui: el pipeline los usa para resolver la
#: moneda de los cobros, que es un hecho economico y no apariencia.
#:
#: `sector` tampoco, y conviene explicar por que. `signals/sector_benchmark_rank.py`
#: construye su propio agrupamiento a partir de cifras financieras, no de la
#: industria declarada: es otra cosa que comparte palabra. Ademas esta
#: desactivada, y de eso se encarga el segundo test.
FORBIDDEN = (
    re.compile(r"\bentity_profile\b"),
    re.compile(r"\bindustry\b", re.IGNORECASE),
)

#: El motor: lo que convierte señales en un numero. `enrich.py` y
#: `publication_rows.py` son publicacion, no calculo, pero tampoco lo necesitan.
SCORED = (
    CORE / "engine",
    CORE / "signals",
    CORE / "pipeline_embat.py",
    CORE / "engine_contract.py",
)


def _sources() -> list[Path]:
    files: list[Path] = []
    for target in SCORED:
        if target.is_file():
            files.append(target)
        else:
            files.extend(sorted(target.rglob("*.py")))
    return files


def test_el_motor_no_nombra_la_identidad() -> None:
    offenders: list[str] = []
    for source in _sources():
        for number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith("#"):
                continue
            for pattern in FORBIDDEN:
                if pattern.search(line):
                    offenders.append(f"{source.relative_to(CORE)}:{number}: {line.strip()}")
    assert offenders == [], (
        "El calculo del score no puede leer la identidad de la entidad:\n" + "\n".join(offenders))


def test_hay_algo_que_comprobar() -> None:
    """Una guarda que pasa por no mirar nada no es una guarda."""
    sources = _sources()
    assert len(sources) >= 10, sources
    assert any("entity_profile" in s.read_text(encoding="utf-8") for s in _publication_sources()), (
        "Si nadie nombra `entity_profile` en ninguna parte, este test no prueba nada")


def _publication_sources() -> list[Path]:
    """Publicacion y API: ahi si vive la identidad, y por eso la guarda vale."""
    return sorted((CORE.parent / "app" / "api" / "src").rglob("*.ts"))


def test_las_perspectivas_de_cohorte_siguen_desactivadas() -> None:
    """Las dos que ordenan dentro del lote no pueden puntuar.

    `sector_benchmark_rank` clasifica por cifras financieras y
    `data_driven_peer_learning` busca vecinos entre los demas grupos: las dos
    harian que el numero de una entidad dependiera de quien mas este cargado.
    """
    from engine import config

    for name in ("sector_benchmark_rank", "data_driven_peer_learning"):
        assert config.STRATEGIC_MODIFIERS[name]["enabled"] is False, name
