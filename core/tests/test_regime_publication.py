"""La publicacion no deja salir una fila que se contradiga, ni senales fantasma.

Estos dos no son tests del calculo: son de la frontera. Lo que aqui pase es lo
que ve la API, y detras de la API ya no hay nadie que compruebe nada.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

CORE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CORE))

from publication_rows import (  # noqa: E402
    PublicationIdentityError,
    _validate_trajectory,
    build_publication_rows,
)
from publication_schema import CATALOG_COLUMNS, SCORE_COLUMNS  # noqa: E402

OUTPUT = CORE / "outputs" / "scores_embat.json"


def test_una_fila_contradictoria_no_se_publica() -> None:
    # Las 240 filas del diagnostico: `stable` con la flecha hacia abajo.
    month = {"month": "2026-08", "trajectory": {"regime": "stable", "direction": "deteriorating"}}
    with pytest.raises(PublicationIdentityError, match="contradice"):
        _validate_trajectory("GROUP_0130", month)

    # `shock_pending` va del propio salto: la direccion lo completa.
    month["trajectory"] = {"regime": "shock_pending", "direction": "deteriorating"}
    _validate_trajectory("GROUP_0130", month)

    month["trajectory"] = {"regime": "deteriorating", "direction": "improving"}
    with pytest.raises(PublicationIdentityError, match="contradice"):
        _validate_trajectory("GROUP_0130", month)

    month["trajectory"] = {"regime": "improving", "direction": "deteriorating"}
    with pytest.raises(PublicationIdentityError, match="contradice"):
        _validate_trajectory("GROUP_0130", month)


@pytest.mark.skipif(not OUTPUT.exists(), reason="hace falta core/outputs/scores_embat.json")
def test_la_publicacion_entera_esta_libre_de_contradicciones() -> None:
    payload = json.loads(OUTPUT.read_text(encoding="utf-8"))
    # Que `build_publication_rows` no lance ya es la prueba: valida fila a fila.
    rows = build_publication_rows(payload, "test")

    regime = SCORE_COLUMNS.index("regime")
    direction = SCORE_COLUMNS.index("direction")
    for table in ("group_scores", "company_scores"):
        emitidos = {(row[regime], row[direction]) for row in rows.tables[table]}
        assert ("stable", "deteriorating") not in {
            (r, d) for r, d in emitidos if r in ("deteriorating", "improving", "recovering")
        }
        for r, d in emitidos:
            assert not (r == "deteriorating" and d == "improving"), table
            assert not (r == "improving" and d == "deteriorating"), table
            assert not (r == "recovering" and d == "deteriorating"), table


@pytest.mark.skipif(not OUTPUT.exists(), reason="hace falta core/outputs/scores_embat.json")
def test_el_catalogo_no_publica_senales_fantasma() -> None:
    payload = json.loads(OUTPUT.read_text(encoding="utf-8"))
    rows = build_publication_rows(payload, "test").tables["signal_catalog"]

    label = CATALOG_COLUMNS.index("label")
    weight = CATALOG_COLUMNS.index("weight_in_pillar")
    assert len(rows) > 0
    for row in rows:
        assert row[label] is not None, row[:3]
        assert row[weight] > 0, row[:3]


@pytest.mark.skipif(not OUTPUT.exists(), reason="hace falta core/outputs/scores_embat.json")
def test_los_casos_del_guion_salen_bien_etiquetados() -> None:
    """GROUP_0130 caia de 76,9 a 35,1 y se publicaba como `stable`."""
    payload = json.loads(OUTPUT.read_text(encoding="utf-8"))
    ultimo = {
        group["entity"]["id"]: group["months"][-1]["trajectory"]
        for group in payload["groups"]
    }
    assert ultimo["GROUP_0130"]["regime"] == "deteriorating"
    assert ultimo["GROUP_0249"]["regime"] == "deteriorating"
    assert ultimo["GROUP_0016"]["regime"] in ("improving", "recovering")
