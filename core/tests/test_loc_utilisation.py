"""La utilizacion de lineas existe mes a mes, no solo en la foto final.

Era la señal peor cubierta del motor y la que mas le importa a un financiador:
327 de 6.000 filas, porque `debt_products` solo trae el dispuesto a fecha de
corte y el pipeline la recortaba a los tres ultimos meses. Se reconstruye de los
movimientos, igual que la caja.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

CORE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CORE))

OUTPUT = CORE / "outputs" / "scores_embat.json"

#: Antes de XR-035. El test protege contra volver a recortarla a la foto.
COVERAGE_BEFORE = 327


def _values() -> list[float]:
    payload = json.loads(OUTPUT.read_text(encoding="utf-8"))
    return [
        signal["value"]
        for group in payload["groups"]
        for month in group["months"]
        for signal in (month.get("raw_signals") or [])
        if signal.get("signal_id") == "loc_utilisation" and signal.get("value") is not None
    ]


@pytest.mark.skipif(not OUTPUT.exists(), reason="hace falta core/outputs/scores_embat.json")
def test_la_cobertura_multiplica_la_de_la_foto() -> None:
    values = _values()
    assert len(values) > 3 * COVERAGE_BEFORE, (
        f"solo {len(values)} filas con utilizacion; antes de reconstruirla habia {COVERAGE_BEFORE}")


@pytest.mark.skipif(not OUTPUT.exists(), reason="hace falta core/outputs/scores_embat.json")
def test_la_utilizacion_es_una_fraccion() -> None:
    """Nunca negativa ni por encima de uno: es dispuesto sobre concedido."""
    for value in _values():
        assert 0.0 <= value <= 1.0, value


@pytest.mark.skipif(not OUTPUT.exists(), reason="hace falta core/outputs/scores_embat.json")
def test_no_se_inventa_el_limite_de_las_lineas_que_no_lo_declaran() -> None:
    """Inferirlo del maximo dispuesto daria 1,0 por construccion en el mes pico.

    Con el limite real, que una linea llegue al 100 % es un hecho raro. Si la
    masa exacta en 1,0 se disparase, seria la señal de que alguien ha vuelto a
    inferir el limite.
    """
    values = _values()
    full = sum(1 for value in values if value >= 0.999)
    assert full / len(values) < 0.20, (
        f"{full} de {len(values)} filas al 100 %: parece un limite inferido, no observado")
