"""El vocabulario de severidad lo fija el motor, en un solo sitio.

La banda del colchon (`critical`/`watch`/`adequate`/`strong`) es una lectura
interna de liquidez. La severidad que publica el producto es otra cosa y solo
tiene tres valores. Publicar la banda como severidad fue lo que rompio la
pantalla: el frontal indexaba un diccionario de tres claves con `critical`.
"""

from __future__ import annotations

import sys
from pathlib import Path

CORE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CORE))

from engine.calibrate import ALERT_SEVERITIES, early_warning  # noqa: E402
from publication_schema import ALERT_COLUMNS  # noqa: E402


def test_vocabulario_es_exactamente_el_del_producto() -> None:
    assert ALERT_SEVERITIES == ("urgent", "review", "watch")


def test_colchon_en_critico_es_urgente() -> None:
    warning = early_warning([40.0, 30.0, 5.0])
    assert warning["alert"] is True
    assert warning["band"] == "critical"
    assert warning["severity"] == "urgent"


def test_dos_meses_en_vigilancia_es_revisar() -> None:
    warning = early_warning([40.0, 20.0, 18.0])
    assert warning["alert"] is True
    assert warning["band"] == "watch"
    assert warning["severity"] == "review"


def test_el_primer_mes_en_vigilancia_es_vigilar() -> None:
    """La histeresis gradua, no silencia: por eso `watch` existe de verdad."""
    warning = early_warning([40.0, 40.0, 18.0])
    assert warning["alert"] is True
    assert warning["band"] == "watch"
    assert warning["severity"] == "watch"


def test_sin_colchon_no_hay_severidad() -> None:
    warning = early_warning([None, None])
    assert warning["alert"] is False
    assert warning["severity"] is None


def test_toda_severidad_emitida_esta_en_el_vocabulario() -> None:
    """Barrido sobre el rango de colchones: nunca se escapa una banda."""
    dias = [None, 0.0, 5.0, 9.9, 10.0, 26.9, 27.0, 59.9, 60.0, 200.0]
    for anterior in dias:
        for actual in dias:
            warning = early_warning([anterior, actual])
            severity = warning["severity"]
            assert severity is None or severity in ALERT_SEVERITIES, (anterior, actual, severity)
            assert (severity is not None) == bool(warning["alert"])


def test_el_vocabulario_no_tiene_etiquetas_muertas() -> None:
    """Las TRES se emiten de verdad.

    Una etiqueta que el codigo no puede producir es una mentira del contrato: el
    frontal se prepara para pintarla y nunca la recibe. Este test es el que
    faltaba, y por el que `watch` estuvo muerta.
    """
    dias = [None, 0.0, 5.0, 9.9, 10.0, 15.0, 26.9, 27.0, 59.9, 60.0, 200.0]
    emitidas = {
        early_warning([anterior, actual])["severity"]
        for anterior in dias for actual in dias
    }
    assert set(ALERT_SEVERITIES) <= emitidas, sorted(str(v) for v in emitidas)


def test_la_columna_publicada_se_llama_severity() -> None:
    assert "severity" in ALERT_COLUMNS
