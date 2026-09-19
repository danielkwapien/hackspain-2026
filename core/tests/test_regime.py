"""El regimen se decide por MAGNITUD con histeresis, no por racha monotona.

La version anterior exigia 3 o 4 meses consecutivos en la misma direccion, asi
que un solo mes bueno rompia la racha y todo caia a `stable`. Medido sobre la
publicacion: 173 filas etiquetadas `stable` habian perdido mas de 10 puntos en
seis meses, y 240 publicaban `stable` junto a `direction='deteriorating'`.

Ahora manda `level_shift` —mediana de los 3 ultimos meses contra la de los 6
anteriores—, que un mes suelto no mueve.
"""

from __future__ import annotations

import sys
from pathlib import Path

CORE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CORE))

from engine import config  # noqa: E402
from engine.trajectory import REGIMES, contradicts, trajectory_for  # noqa: E402


def regime(series: list[float | None]) -> str:
    return str(trajectory_for(series)["regime"])


def test_los_seis_regimenes_mas_warmup() -> None:
    assert REGIMES == (
        "deteriorating", "improving", "blip", "shock_pending", "recovering", "stable",
    )


def test_menos_de_siete_meses_es_warmup() -> None:
    assert regime([70.0, 69.0, 68.0, 67.0, 66.0, 65.0]) == "warmup"


def test_sin_detector_no_se_afirma_estabilidad() -> None:
    """Con ocho meses `level_shift` no existe todavia, y sin el no hay regimen.

    Se publicaban 66 filas que caian mas de diez puntos en seis meses y decian
    `stable`, no porque estuvieran estables sino porque no habia con que mirarlo.
    """
    cayendo = [40.8, 54.8, 52.1, 43.9, 30.2, 28.9, 36.9, 27.1]
    assert len(cayendo) == 8
    assert regime(cayendo) == "warmup"
    # El noveno mes da la primera mediana contra mediana, pero con una sola no
    # cabe la confirmacion de dos: sigue sin afirmarse nada.
    assert regime([*cayendo, 26.0]) == "warmup"
    # Con el decimo ya hay dos medibles y el regimen se moja.
    assert regime([*cayendo, 26.0, 25.0]) == "deteriorating"


def test_caida_sostenida_es_deterioro() -> None:
    serie = [80.0, 78.0, 76.0, 74.0, 72.0, 70.0, 68.0, 66.0, 64.0, 62.0, 60.0, 58.0]
    assert regime(serie) == "deteriorating"


def test_un_mes_bueno_no_rompe_el_deterioro() -> None:
    """La regresion exacta: la racha se rompe, la mediana no."""
    serie = [80.0, 78.0, 76.0, 74.0, 72.0, 70.0, 68.0, 66.0, 64.0, 62.0, 63.0, 58.0]
    assert regime(serie) == "deteriorating"


def test_subida_sostenida_es_mejora() -> None:
    serie = [40.0, 42.0, 44.0, 46.0, 48.0, 50.0, 52.0, 54.0, 56.0, 58.0, 60.0, 62.0]
    assert regime(serie) == "improving"


def test_serie_plana_es_estable() -> None:
    serie = [60.0, 60.4, 59.7, 60.1, 60.2, 59.8, 60.0, 60.3, 59.9, 60.1, 60.0, 60.2]
    assert regime(serie) == "stable"


def test_el_salto_de_este_mes_esta_pendiente_de_saber() -> None:
    """Un golpe grande recien llegado: todavia no se sabe si revierte."""
    serie = [60.0] * 11 + [38.0]
    assert regime(serie) == "shock_pending"


def test_un_salto_que_la_tendencia_ya_anunciaba_no_es_un_golpe() -> None:
    """Subir fuerte al final de una subida es continuar, no recibir un golpe."""
    serie = [20.0, 21.0, 20.0, 21.0, 22.0, 24.0, 28.0, 30.0, 32.0, 36.0, 42.0, 64.0]
    assert regime(serie) != "shock_pending"


def test_un_salto_que_revierte_en_dos_meses_es_un_bache() -> None:
    """El «bache» del brief: cae fuerte, vuelve, y la mediana no se rompe."""
    serie = [60.0] * 9 + [38.0, 59.0, 60.0]
    assert regime(serie) == "blip"


def test_subir_tras_un_deterioro_es_recuperacion() -> None:
    serie = [80.0, 76.0, 72.0, 68.0, 64.0, 60.0, 56.0, 52.0, 48.0, 58.0, 62.0, 66.0]
    assert regime(serie) == "recovering"


def test_la_misma_subida_sin_caida_previa_es_mejora_no_recuperacion() -> None:
    """Lo que separa `recovering` de `improving` es de donde se viene."""
    serie = [40.0, 41.0, 40.0, 41.0, 40.0, 41.0, 40.0, 41.0, 40.0, 50.0, 54.0, 58.0]
    assert regime(serie) == "improving"


def test_la_histeresis_exige_dos_meses() -> None:
    """Con la condicion cumplida un solo mes todavia no se cambia de regimen."""
    base = [60.0] * 9
    un_mes = base + [54.0, 54.0, 54.0]
    # El mes anterior aun no cumplia, asi que el deterioro no esta confirmado.
    assert regime(un_mes[:-1]) != "deteriorating"
    assert regime(un_mes) == "deteriorating"


def test_regimen_y_direccion_nunca_se_contradicen() -> None:
    series = [
        [80.0, 78.0, 76.0, 74.0, 72.0, 70.0, 68.0, 66.0, 64.0, 62.0, 63.0, 58.0],
        [40.0, 42.0, 44.0, 46.0, 48.0, 50.0, 52.0, 54.0, 56.0, 58.0, 60.0, 62.0],
        [60.0] * 9 + [38.0, 59.0, 60.0],
        [60.0] * 11 + [38.0],
        [80.0, 76.0, 72.0, 68.0, 64.0, 60.0, 56.0, 52.0, 48.0, 58.0, 62.0, 66.0],
        [60.0, 60.4, 59.7, 60.1, 60.2, 59.8, 60.0, 60.3, 59.9, 60.1, 60.0, 60.2],
    ]
    for serie in series:
        salida = trajectory_for(serie)
        assert not contradicts(salida["regime"], salida["direction"]), salida


def test_contradiccion_declarada_explicitamente() -> None:
    assert contradicts("deteriorating", "improving")
    assert contradicts("improving", "deteriorating")
    assert contradicts("recovering", "deteriorating")
    # Las 240 filas del diagnostico: si el regimen dice que no se mueve, la
    # flecha no puede decir que baja.
    assert contradicts("stable", "deteriorating")
    assert contradicts("stable", "improving")
    # Estos dos van del propio salto: la direccion los completa.
    assert not contradicts("blip", "improving")
    assert not contradicts("shock_pending", "deteriorating")


def test_barrido_no_produce_nunca_una_fila_contradictoria() -> None:
    """Barrido determinista sobre formas de serie: la regla no tiene grietas."""
    import random

    generador = random.Random(20260919)
    for _ in range(3000):
        largo = generador.randint(2, 24)
        nivel = generador.uniform(10.0, 90.0)
        serie: list[float | None] = []
        for _ in range(largo):
            nivel += generador.gauss(0.0, generador.choice([0.4, 2.0, 8.0]))
            serie.append(round(max(0.0, min(100.0, nivel)), 2))
        salida = trajectory_for(serie)
        assert salida["regime"] in (*REGIMES, "warmup"), salida
        assert not contradicts(salida["regime"], salida["direction"]), (serie, salida)


def test_los_umbrales_viven_en_config() -> None:
    assert config.REGIME_SHIFT > 0
    assert config.REGIME_HYSTERESIS == 2
    assert config.REGIME_Z > 0
    assert config.REGIME_MAD_FLOOR > 0
