"""La identidad es apariencia, pero tiene que ser estable y coherente.

Dos ejecuciones seguidas deben dar el mismo nombre (si no, las capturas de la
demo caducan), la industria solo puede salir de los diez sectores acordados y el
pais inferido nunca puede contradecir la moneda en la que se mueve el dinero.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

CORE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CORE))

from entity_profile import (  # noqa: E402
    EURO_MIX,
    INDUSTRIES,
    INDUSTRY_NOUNS,
    LEGAL_FORMS,
    classify_industry,
    company_name,
    group_name,
    infer_country,
    normalise_country,
)

EURO_COUNTRIES = {country for country, _ in EURO_MIX}


def _company(**overrides: float) -> pd.Series:
    """Una sociedad sin rasgo alguno; cada test enciende solo el suyo."""
    base = {
        "outflow": 1_000_000.0, "inflow": 1_000_000.0, "salary": 0.0, "pos_cash": 0.0,
        "bulk_collection": 0.0, "utility": 0.0, "supplier_payments": 0.0,
        "mean_inflow": 100_000.0, "sd_inflow": 80_000.0, "n_counterparties": 5,
    }
    return pd.Series({**base, **overrides})


def test_el_nombre_solo_depende_del_identificador() -> None:
    primero = company_name("COMP_0001", "transporte y logística", set())
    segundo = company_name("COMP_0001", "transporte y logística", set())
    assert primero == segundo


def test_dos_sociedades_del_mismo_sector_nunca_comparten_nombre() -> None:
    taken: set[str] = set()
    for numero in range(1, 60):
        name = company_name(f"COMP_{numero:04d}", "transporte y logística", taken)
        assert name not in taken
        taken.add(name)


def test_el_nombre_lleva_sustantivo_del_sector_y_forma_juridica() -> None:
    name = company_name("COMP_0007", "alimentación y bebidas", set())
    assert name.split(" ")[0] in INDUSTRY_NOUNS["alimentación y bebidas"]
    assert name.endswith(LEGAL_FORMS)


def test_el_nombre_ocupado_se_esquiva_sin_dejar_de_ser_determinista() -> None:
    ocupado = company_name("COMP_0001", "salud y farmacia", set())
    alternativo = company_name("COMP_0001", "salud y farmacia", {ocupado})
    assert alternativo != ocupado
    assert alternativo == company_name("COMP_0001", "salud y farmacia", {ocupado})


def test_el_grupo_se_llama_como_su_sociedad_dominante() -> None:
    name = group_name("GROUP_0016", "Consultores Guadiana", "servicios profesionales", set())
    assert name in {"Grupo Consultores Guadiana", "Consultores Guadiana Holding"}


def test_cada_sector_tiene_sustantivos_propios() -> None:
    assert set(INDUSTRY_NOUNS) == set(INDUSTRIES)
    assert len(INDUSTRIES) == 10


def test_la_industria_sale_siempre_del_catalogo_acordado() -> None:
    assert classify_industry(_company()) in INDUSTRIES
    assert classify_industry(_company(pos_cash=400_000.0)) in INDUSTRIES


def test_la_liquidacion_de_tpv_manda_sobre_la_nomina() -> None:
    tienda = _company(pos_cash=300_000.0, salary=400_000.0, sd_inflow=50_000.0)
    assert classify_industry(tienda) == "comercio minorista"
    verano = _company(pos_cash=300_000.0, sd_inflow=150_000.0)
    assert classify_industry(verano) == "hostelería y ocio"


def test_la_nomina_pesada_con_cobro_regular_es_servicio_profesional() -> None:
    despacho = _company(salary=300_000.0, sd_inflow=90_000.0)
    assert classify_industry(despacho) == "servicios profesionales"


def test_el_pais_inferido_respeta_la_moneda_dominante() -> None:
    assert infer_country("COMP_0100", "MXN", 0.95) == "México"
    assert infer_country("COMP_0100", "GBP", 0.84) == "Reino Unido"
    # Una cuenta suelta en dolares no muda la sede de una empresa en euros.
    assert infer_country("COMP_0100", "USD", 0.20) in EURO_COUNTRIES
    assert infer_country("COMP_0100", "EUR", 1.0) in EURO_COUNTRIES


def test_el_pais_real_se_normaliza_y_lo_desconocido_no_es_real() -> None:
    assert normalise_country("ES") == "España"
    assert normalise_country(" ESPAÑA ") == "España"
    assert normalise_country("Spain") == "España"
    assert normalise_country("Alemania") == "Alemania"
    assert normalise_country(None) is None
    assert normalise_country(float("nan")) is None
    assert normalise_country("Wakanda") is None
