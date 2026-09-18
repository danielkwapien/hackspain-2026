"""Tests de las formulas puras de `xray_mock.core` (ENGINE §5, §6, §7, §8).

Se escriben ANTES que `core.py` (TDD). Tolerancia numerica 1e-6.
"""

import math

import pytest

from xray_mock import catalog, core

TOL = 1e-6


# --- §5.1 Normalizacion -------------------------------------------------

def test_normalize_anchor_piecewise_linear_endpoints_and_midpoints():
    l1 = catalog.SIGNALS_BY_ID["L1"]["anchors"]

    # Los nudos de la tabla de ENGINE §4.1 se devuelven exactos.
    for value, expected in [(0, 0.0), (10, 0.3), (27, 0.6), (60, 0.9), (120, 1.0)]:
        assert core.normalize_anchor(value, l1) == pytest.approx(expected, abs=TOL)

    # Interpolacion lineal entre nudos.
    assert core.normalize_anchor(5, l1) == pytest.approx(0.15, abs=TOL)
    assert core.normalize_anchor(18.5, l1) == pytest.approx(0.45, abs=TOL)
    assert core.normalize_anchor(90, l1) == pytest.approx(0.95, abs=TOL)

    # Clip fuera de rango a los extremos.
    assert core.normalize_anchor(-40, l1) == pytest.approx(0.0, abs=TOL)
    assert core.normalize_anchor(500, l1) == pytest.approx(1.0, abs=TOL)

    # Anclas descendentes (senal `lower_better`): la direccion va en la tabla.
    d1 = catalog.SIGNALS_BY_ID["D1"]["anchors"]
    assert core.normalize_anchor(0.0, d1) == pytest.approx(1.0, abs=TOL)
    assert core.normalize_anchor(0.45, d1) == pytest.approx(0.75, abs=TOL)
    assert core.normalize_anchor(1.0, d1) == pytest.approx(0.0, abs=TOL)
    assert core.normalize_anchor(2.0, d1) == pytest.approx(0.0, abs=TOL)

    # Mesetas de L3 (los tramos "1-3" y "4-9" de la tabla).
    l3 = catalog.SIGNALS_BY_ID["L3"]["anchors"]
    assert core.normalize_anchor(2, l3) == pytest.approx(0.6, abs=TOL)
    assert core.normalize_anchor(7, l3) == pytest.approx(0.3, abs=TOL)
    assert core.normalize_anchor(12, l3) == pytest.approx(0.0, abs=TOL)

    # Sin dato no se imputa: None entra, None sale.
    assert core.normalize_anchor(None, l1) is None


def test_normalize_percentile_uses_frozen_breakpoints():
    frozen = {"p01": 0.0, "p25": 10.0, "p50": 20.0, "p75": 40.0, "p99": 100.0}

    assert core.normalize_percentile(20.0, frozen) == pytest.approx(0.50, abs=TOL)
    assert core.normalize_percentile(10.0, frozen) == pytest.approx(0.25, abs=TOL)
    assert core.normalize_percentile(15.0, frozen) == pytest.approx(0.375, abs=TOL)
    assert core.normalize_percentile(30.0, frozen) == pytest.approx(0.625, abs=TOL)

    # Fuera de los cortes congelados: clip al corte extremo, siempre en [0, 1].
    assert core.normalize_percentile(-999.0, frozen) == pytest.approx(0.01, abs=TOL)
    assert core.normalize_percentile(999.0, frozen) == pytest.approx(0.99, abs=TOL)

    # El resultado depende SOLO de los cortes congelados, no de la muestra:
    # otros cortes sobre el mismo valor dan otro u.
    otros = {"p01": 100.0, "p50": 200.0, "p99": 300.0}
    assert core.normalize_percentile(20.0, otros) == pytest.approx(0.01, abs=TOL)
    assert core.normalize_percentile(200.0, otros) == pytest.approx(0.50, abs=TOL)

    # Forma array ordenado: los cortes reparten [0, 1] uniformemente.
    arr = [0.0, 10.0, 20.0, 40.0, 100.0]
    assert core.normalize_percentile(20.0, arr) == pytest.approx(0.50, abs=TOL)
    assert core.normalize_percentile(15.0, arr) == pytest.approx(0.375, abs=TOL)
    assert core.normalize_percentile(-5.0, arr) == pytest.approx(0.0, abs=TOL)
    assert core.normalize_percentile(500.0, arr) == pytest.approx(1.0, abs=TOL)

    assert core.normalize_percentile(None, frozen) is None

    # Las senales `lower_better` por percentil se orientan aparte.
    assert core.orient(0.8, "lower_better") == pytest.approx(0.2, abs=TOL)
    assert core.orient(0.8, "higher_better") == pytest.approx(0.8, abs=TOL)


def test_ewma_is_causal_and_alpha_one_is_identity():
    serie = [0.4, 0.6, 0.8]
    assert core.ewma(serie, 1.0) == pytest.approx(serie, abs=TOL)
    got = core.ewma(serie, 0.5)
    assert got[0] == pytest.approx(0.4, abs=TOL)
    assert got[1] == pytest.approx(0.5, abs=TOL)
    assert got[2] == pytest.approx(0.65, abs=TOL)
    # Causal: anadir un punto al final no cambia los anteriores.
    assert core.ewma(serie + [0.1], 0.5)[:3] == pytest.approx(got, abs=TOL)


# --- §5.2 / §5.3 Pilar, nivel y penalizacion ---------------------------

def test_pillar_score_renormalizes_missing_signals():
    weights = catalog.pillar_signal_weights("L")
    assert weights == {"L1": 30, "L2": 20, "L3": 25, "L4": 15, "L5": 10}

    # Todas disponibles.
    todas = {k: 0.5 for k in weights}
    assert core.pillar_score(todas, weights) == pytest.approx(0.5, abs=TOL)

    # Solo L1 y L3: se renormaliza sobre 30 + 25, no se imputa 0 a las demas.
    parcial = {"L1": 0.8, "L3": 0.4}
    esperado = (30 * 0.8 + 25 * 0.4) / 55
    assert core.pillar_score(parcial, weights) == pytest.approx(esperado, abs=TOL)

    # Un None es "no disponible", no un cero.
    con_none = {"L1": 0.8, "L2": None, "L3": 0.4, "L4": None, "L5": None}
    assert core.pillar_score(con_none, weights) == pytest.approx(esperado, abs=TOL)

    # Ninguna disponible: el pilar no existe.
    assert core.pillar_score({}, weights) is None
    assert core.pillar_score({"L1": None}, weights) is None


def test_level_penalty_weakest_pillar_below_tau():
    eff = core.effective_weights({"L": 1.0, "P": 1.0, "C": 1.0, "D": 1.0, "A": 1.0})
    assert sum(eff.values()) == pytest.approx(1.0, abs=TOL)
    assert eff["L"] == pytest.approx(0.25, abs=TOL)

    pilares = {"L": 0.7, "P": 0.6, "C": 0.5, "D": 0.15, "A": 0.6}
    assert core.level(pilares, eff) == pytest.approx(52.0, abs=TOL)

    # El ejemplo literal de ENGINE §5.3: min P = 0,15 -> 15 puntos.
    pen = core.penalty(pilares, catalog.PENALTY["lambda"], catalog.PENALTY["tau"])
    assert pen == pytest.approx(15.0, abs=TOL)
    assert core.level(pilares, eff) - pen == pytest.approx(37.0, abs=TOL)

    # Justo en tau no hay penalizacion; por encima tampoco.
    assert core.penalty({"L": 0.45, "P": 0.9}, 0.5, 0.45) == pytest.approx(0.0, abs=TOL)
    assert core.penalty({"L": 0.8, "P": 0.9}, 0.5, 0.45) == pytest.approx(0.0, abs=TOL)
    # Penaliza el MAS DEBIL, no la media.
    assert core.penalty({"L": 0.95, "P": 0.25}, 0.5, 0.45) == pytest.approx(10.0, abs=TOL)

    # Pilar ausente: `w_k^eff = w_k·avail_k / Σ w_j·avail_j` (ENGINE §4.7).
    sin_c = core.effective_weights({"L": 1.0, "P": 1.0, "C": 0.0, "D": 1.0, "A": 1.0})
    assert sum(sin_c.values()) == pytest.approx(1.0, abs=TOL)
    assert sin_c["C"] == pytest.approx(0.0, abs=TOL)
    assert sin_c["L"] == pytest.approx(25 / 85, abs=TOL)
    # Solo cuenta lo disponible: pilares completos al 0,6 -> nivel 60.
    assert core.level({"L": 0.6, "P": 0.6, "D": 0.6, "A": 0.6}, sin_c) == pytest.approx(60.0, abs=TOL)


# --- §5.4 Techos por eventos duros -------------------------------------

def test_caps_negcash_requires_two_consecutive_months():
    # Un solo mes >= 10 dias es un bache, no un techo.
    assert core.caps({"neg_cash_days": [0, 0, 12]}) == (None, 100.0)
    # Dos meses seguidos: techo 40.
    assert core.caps({"neg_cash_days": [0, 12, 14]}) == ("NEGCASH", 40.0)
    # Vigencia "mientras persista + 1 mes": sigue un mes despues de remitir.
    assert core.caps({"neg_cash_days": [12, 12, 0]}) == ("NEGCASH", 40.0)
    # ... y solo uno.
    assert core.caps({"neg_cash_days": [12, 12, 0, 0]}) == (None, 100.0)
    # Meses alternos nunca disparan.
    assert core.caps({"neg_cash_days": [12, 0, 12, 0, 12]}) == (None, 100.0)
    # Historia insuficiente.
    assert core.caps({"neg_cash_days": [12]}) == (None, 100.0)
    assert core.caps({}) == (None, 100.0)


def test_caps_ssmiss_requires_history_9_of_12():
    # t = indice 13. Ventana t-12..t-1 = indices 1..12 con 9 pagos; t y t-1 sin SS.
    paga = [True] + [True] * 9 + [False] * 4
    assert len(paga) == 14
    assert core.caps({"ss_paid": paga}) == ("SSMISS", 45.0)

    # Solo 8 de los 12 previos: no hay regularidad que romper.
    casi = [True] * 8 + [False] * 5
    assert len(casi) == 13
    assert core.caps({"ss_paid": casi}) == (None, 100.0)

    # Regular pero ausente un solo mes: bache de fecha, no techo.
    un_mes = [True] + [True] * 9 + [False] * 2 + [True, False]
    assert core.caps({"ss_paid": un_mes}) == (None, 100.0)

    # Regular y al corriente.
    assert core.caps({"ss_paid": [True] * 14}) == (None, 100.0)

    # DEBTSTOP: regular >= 6 de los ultimos 9 y ausente 2 meses seguidos -> 50.
    debt = [True] * 7 + [False] * 2
    assert core.caps({"debt_repayment": debt}) == ("DEBTSTOP", 50.0)
    assert core.caps({"debt_repayment": [True] * 5 + [False] * 4}) == (None, 100.0)

    # LOCFULL: >= 0,95 mientras persista -> 60.
    assert core.caps({"loc_utilisation": [0.5, 0.97]}) == ("LOCFULL", 60.0)
    assert core.caps({"loc_utilisation": [0.97, 0.80]}) == (None, 100.0)

    # Con varios techos activos manda el mas restrictivo.
    code, value = core.caps({"ss_paid": paga, "loc_utilisation": [0.99] * 14})
    assert (code, value) == ("SSMISS", 45.0)


# --- §5.5 Bandas -------------------------------------------------------

def test_band_thresholds():
    assert core.band(100.0) == "solid"
    assert core.band(80.0) == "solid"
    assert core.band(79.999) == "healthy"
    assert core.band(60.0) == "healthy"
    assert core.band(59.999) == "watch"
    assert core.band(40.0) == "watch"
    assert core.band(39.999) == "stress"
    assert core.band(0.0) == "stress"
    assert core.band(None) is None
    assert {b[0] for b in catalog.BANDS} == {"solid", "healthy", "watch", "stress"}

    # `score` = min(level, cap) recortado a [0, 100] (ENGINE §5.4).
    assert core.score(70.0, 100.0) == pytest.approx(70.0, abs=TOL)
    assert core.score(70.0, 40.0) == pytest.approx(40.0, abs=TOL)
    assert core.score(-5.0, 100.0) == pytest.approx(0.0, abs=TOL)
    assert core.score(130.0, 100.0) == pytest.approx(100.0, abs=TOL)
    assert core.band(core.score(70.0, 40.0)) == "watch"


# --- §7 Explicabilidad -------------------------------------------------

def _caso(u_mult=1.0, cap_value=100.0):
    """Un caso completo de rama `full` para las pruebas de aditividad."""
    ids = catalog.signals_for_branch("full")
    sw = catalog.signal_weights_by_pillar(ids)
    eff = core.effective_weights(catalog.pillar_availability(ids))
    u_ref = {sid: 0.5 for sid in ids}
    u = {}
    for i, sid in enumerate(ids):
        u[sid] = min(1.0, max(0.0, (0.2 + 0.025 * i) * u_mult))
    pilares = {p: core.pillar_score(u, w) for p, w in sw.items()}
    pen = core.penalty(pilares, catalog.PENALTY["lambda"], catalog.PENALTY["tau"])
    return core.contributions(u, u_ref, eff, sw, penalty_value=pen, cap_value=cap_value)


def test_contributions_sum_to_score_exactly():
    res = _caso()
    total = res["base"] + sum(res["contrib"].values()) - res["penalty"] - res["cap_adj"]
    assert total == pytest.approx(res["score"], abs=TOL)

    # `base` es el nivel de la empresa de referencia (todas las u en u_ref).
    assert res["base"] == pytest.approx(50.0, abs=TOL)
    # Y `base + Σ contrib` reconstruye el nivel bruto.
    assert res["base"] + sum(res["contrib"].values()) == pytest.approx(
        res["level_gross"], abs=TOL
    )
    assert res["level"] == pytest.approx(res["level_gross"] - res["penalty"], abs=TOL)

    # Una senal por encima de la mediana aporta positivo y al reves.
    ids = catalog.signals_for_branch("full")
    assert res["contrib"][ids[0]] < 0
    assert res["contrib"][ids[-1]] > 0

    # La identidad tambien cierra con un techo mordiendo.
    con_cap = _caso(u_mult=2.0, cap_value=40.0)
    assert con_cap["score"] == pytest.approx(40.0, abs=TOL)
    assert con_cap["cap_adj"] > 0
    total_cap = (
        con_cap["base"] + sum(con_cap["contrib"].values())
        - con_cap["penalty"] - con_cap["cap_adj"]
    )
    assert total_cap == pytest.approx(con_cap["score"], abs=TOL)


def test_delta_decomposition_sums_to_delta_1m():
    prev = _caso(u_mult=1.0)
    cur = _caso(u_mult=1.6)
    delta_1m = cur["score"] - prev["score"]

    dec = core.delta_decomposition(
        cur["contrib"], prev["contrib"],
        cur["penalty"], prev["penalty"],
        cur["cap_adj"], prev["cap_adj"],
    )
    assert dec["delta_1m"] == pytest.approx(delta_1m, abs=TOL)
    suma = sum(dec["delta_contrib"].values()) + dec["delta_penalty"] + dec["delta_cap"]
    assert suma == pytest.approx(delta_1m, abs=TOL)
    assert delta_1m > 0

    # Con techo nuevo: el termino de techo carga con la caida.
    cur_cap = _caso(u_mult=1.6, cap_value=35.0)
    dec2 = core.delta_decomposition(
        cur_cap["contrib"], prev["contrib"],
        cur_cap["penalty"], prev["penalty"],
        cur_cap["cap_adj"], prev["cap_adj"],
    )
    suma2 = sum(dec2["delta_contrib"].values()) + dec2["delta_penalty"] + dec2["delta_cap"]
    assert suma2 == pytest.approx(cur_cap["score"] - prev["score"], abs=TOL)
    assert dec2["delta_cap"] < 0

    # Una senal que aparece o desaparece no rompe la identidad.
    recortado = {k: v for k, v in cur["contrib"].items() if k != "C6"}
    dec3 = core.delta_decomposition(
        recortado, prev["contrib"], cur["penalty"], prev["penalty"],
        cur["cap_adj"], prev["cap_adj"],
    )
    suma3 = sum(dec3["delta_contrib"].values()) + dec3["delta_penalty"] + dec3["delta_cap"]
    assert suma3 == pytest.approx(dec3["delta_1m"], abs=TOL)


# --- §6.1 Estadisticos de trayectoria ----------------------------------

def test_theil_sen_slope_and_ci():
    slope, lo, hi = core.theil_sen([50, 52, 54, 56, 58, 60])
    assert slope == pytest.approx(2.0, abs=TOL)
    assert lo <= slope <= hi

    # Robusto a un outlier (esa es la razon de usar Theil-Sen).
    slope_out, lo_out, hi_out = core.theil_sen([50, 52, 54, 90, 58, 60])
    assert slope_out == pytest.approx(2.0, abs=0.5)
    assert lo_out <= slope_out <= hi_out

    # Pendiente negativa significativa: el IC 90 % no contiene el cero.
    down, dlo, dhi = core.theil_sen([70, 67, 64, 61, 58, 55])
    assert down == pytest.approx(-3.0, abs=TOL)
    assert dhi < 0

    # Serie plana: pendiente cero y sin significacion.
    flat, flo, fhi = core.theil_sen([60, 60, 60, 60, 60, 60])
    assert flat == pytest.approx(0.0, abs=TOL)
    assert flo <= 0.0 <= fhi

    # Series cortas: sin pendiente, sin IC.
    assert core.theil_sen([50, 51]) == (0.0, 0.0, 0.0)
    assert core.theil_sen([]) == (0.0, 0.0, 0.0)

    # z_own sobre mediana y MAD de t-12..t-1 (ENGINE §6.1).
    hist = [60.0] * 12 + [48.0]
    assert core.z_own(hist) == pytest.approx(0.0, abs=TOL)  # MAD 0 -> sin escala
    ruido = [58, 62, 58, 62, 58, 62, 58, 62, 58, 62, 58, 62, 40.0]
    z = core.z_own(ruido)
    assert z < -2.0
    assert core.z_own([60.0, 61.0]) is None

    # breadth: diffusion index con umbral plano +-0,02 (ENGINE §6.1).
    assert core.breadth({"a": 0.10, "b": 0.10, "c": 0.10, "d": 0.10}) == pytest.approx(100.0, abs=TOL)
    assert core.breadth({"a": -0.10, "b": -0.10}) == pytest.approx(0.0, abs=TOL)
    assert core.breadth({"a": 0.01, "b": -0.01}) == pytest.approx(50.0, abs=TOL)
    assert core.breadth({"a": 0.10, "b": -0.10}) == pytest.approx(50.0, abs=TOL)
    assert core.breadth({}) is None

    # run: meses consecutivos con el mismo signo, con signo.
    assert core.run([1.0, 2.0, 3.0]) == 3
    assert core.run([-1.0, 2.0, 3.0]) == 2
    assert core.run([1.0, -2.0, -3.0, -1.0]) == -3
    assert core.run([1.0, 2.0, 0.0]) == 0
    assert core.run([]) == 0

    # CUSUM tabular sobre z_own, k = 0,5, h = 4 (ENGINE §6.1).
    cp, cm = core.cusum([0.0, 0.0, 0.0])
    assert cp == pytest.approx(0.0, abs=TOL)
    assert cm == pytest.approx(0.0, abs=TOL)
    cp2, cm2 = core.cusum([-2.0] * 5)
    assert cm2 == pytest.approx(7.5, abs=TOL)
    assert cm2 > catalog.TRAJECTORY["cusum_h"]
    assert cp2 == pytest.approx(0.0, abs=TOL)

    # level_shift: mediana de los 3 ultimos menos la de los 6 anteriores.
    assert core.level_shift([70.0] * 6 + [60.0] * 3) == pytest.approx(-10.0, abs=TOL)
    assert core.level_shift([70.0] * 8) is None


# --- §6.2 Regimen ------------------------------------------------------

def _stats(**kw):
    base = {
        "month_index": 12,
        "run": 0,
        "breadth": 50.0,
        "slope_3m": 0.0,
        "slope_6m": 0.0,
        "slope_6m_lo": -1.0,
        "slope_6m_hi": 1.0,
        "cusum_plus": 0.0,
        "cusum_minus": 0.0,
        "level_shift": 0.0,
        "z_own": 0.0,
        "z_exceed_months": 0,
        "reverted": False,
        "score": 60.0,
        "score_max_12m": 60.0,
        "prev_candidate": None,
    }
    base.update(kw)
    return base


def test_regime_deteriorating_requires_run_breadth_and_signal():
    duro = dict(run=-3, breadth=30.0, level_shift=-8.0, prev_candidate="deteriorating")
    reg, cand = core.regime(_stats(**duro), "stable")
    assert cand == "deteriorating"
    assert reg == "deteriorating"

    # Sin amplitud (breadth alto) no es deterioro: es ruido de una senal.
    reg2, cand2 = core.regime(_stats(**{**duro, "breadth": 55.0}), "stable")
    assert cand2 == "stable" and reg2 == "stable"

    # Sin racha suficiente tampoco.
    reg3, cand3 = core.regime(_stats(**{**duro, "run": -2}), "stable")
    assert cand3 != "deteriorating"

    # Racha y amplitud pero sin senal (ni pendiente, ni CUSUM, ni escalon).
    reg4, cand4 = core.regime(_stats(**{**duro, "level_shift": -2.0}), "stable")
    assert cand4 == "stable"

    # La senal puede venir por CUSUM...
    _, cand5 = core.regime(
        _stats(run=-3, breadth=30.0, level_shift=-2.0, cusum_minus=5.0,
               prev_candidate="deteriorating"), "stable")
    assert cand5 == "deteriorating"
    # ... o por pendiente 6m significativamente negativa.
    _, cand6 = core.regime(
        _stats(run=-3, breadth=30.0, level_shift=-2.0, slope_6m=-1.5,
               slope_6m_lo=-2.5, slope_6m_hi=-0.5, prev_candidate="deteriorating"), "stable")
    assert cand6 == "deteriorating"

    # Mejora: asimetrica, exige run >= 4 (ENGINE §6.2).
    subida = dict(run=3, breadth=70.0, level_shift=8.0, prev_candidate="improving")
    _, cand7 = core.regime(_stats(**subida), "stable")
    assert cand7 != "improving"
    _, cand8 = core.regime(_stats(**{**subida, "run": 4}), "stable")
    assert cand8 == "improving"

    # Antes del mes 7 todo es warm-up.
    reg9, cand9 = core.regime(_stats(**{**duro, "month_index": 5}), "warmup")
    assert reg9 == "warmup" and cand9 == "warmup"

    assert set(catalog.REGIMES) == {
        "warmup", "stable", "improving", "deteriorating",
        "blip", "shock_pending", "recovering",
    }


def test_regime_blip_requires_reversion():
    choque = dict(z_own=-2.5, z_exceed_months=1, breadth=50.0)

    # Sin reversion confirmada es sospecha, no bache.
    reg, cand = core.regime(_stats(**choque, prev_candidate="shock_pending"), "stable")
    assert cand == "shock_pending" and reg == "shock_pending"

    # Con la reversion a +-1 sigma ya confirmada, es un bache.
    reg2, cand2 = core.regime(
        _stats(**choque, reverted=True, prev_candidate="blip"), "shock_pending")
    assert cand2 == "blip" and reg2 == "blip"

    # Si la pendiente 6m es significativa no es un bache: es tendencia.
    _, cand3 = core.regime(
        _stats(**choque, reverted=True, slope_6m=-2.0, slope_6m_lo=-3.0,
               slope_6m_hi=-1.0, prev_candidate="blip"), "stable")
    assert cand3 not in ("blip", "shock_pending")

    # Si el movimiento es amplio (breadth fuera de [40, 60]) tampoco.
    _, cand4 = core.regime(
        _stats(z_own=-2.5, z_exceed_months=1, breadth=20.0, reverted=True,
               prev_candidate="blip"), "stable")
    assert cand4 not in ("blip", "shock_pending")

    # Un |z| por debajo de 2 no abre choque.
    _, cand5 = core.regime(_stats(z_own=-1.2, z_exceed_months=1, breadth=50.0), "stable")
    assert cand5 == "stable"

    # recovering: venia de deterioro, sube y sigue 5 puntos por debajo del maximo.
    _, cand6 = core.regime(
        _stats(run=2, slope_3m=1.5, score=58.0, score_max_12m=70.0,
               prev_candidate="recovering"), "deteriorating")
    assert cand6 == "recovering"


def test_regime_hysteresis_two_months():
    duro = _stats(run=-3, breadth=30.0, level_shift=-8.0, prev_candidate="stable")

    # Primer mes que cumple la regla: aun no cambia de regimen.
    reg1, cand1 = core.regime(duro, "stable")
    assert cand1 == "deteriorating"
    assert reg1 == "stable"

    # Segundo mes consecutivo: ahora si.
    duro2 = _stats(run=-4, breadth=30.0, level_shift=-8.0, prev_candidate="deteriorating")
    reg2, _ = core.regime(duro2, "stable")
    assert reg2 == "deteriorating"

    # Y un mes suelto de calma no lo saca del deterioro.
    calma = _stats(prev_candidate="deteriorating")
    reg3, cand3 = core.regime(calma, "deteriorating")
    assert cand3 == "stable"
    assert reg3 == "deteriorating"
    reg4, _ = core.regime(_stats(prev_candidate="stable"), "deteriorating")
    assert reg4 == "stable"


# --- §6.3 Outlook ------------------------------------------------------

def test_outlook_band_ordering():
    out = core.outlook(60.0, slope_6m=-1.0, lead_index=-0.5, sigma_resid=3.0)
    assert set(out) == {"h3", "h6", "low", "high", "label"}
    assert out["low"] <= out["h6"] <= out["high"]
    assert out["label"] in {"positive", "stable", "negative", "watch"}

    # phi = 0,85 amortigua la pendiente; gamma pondera el LeadIndex.
    gamma = catalog.OUTLOOK["gamma"]
    assert out["h3"] == pytest.approx(60.0 + 0.85 * -1.0 * 3 + gamma * -0.5, abs=TOL)
    assert out["h6"] == pytest.approx(60.0 + 0.85 * -1.0 * 6 + gamma * -0.5, abs=TOL)
    assert out["high"] - out["low"] == pytest.approx(
        2 * 1.28 * 3.0 * math.sqrt(6), abs=TOL)
    assert out["label"] == "negative"

    # Pendiente positiva y lead favorable -> positive.
    up = core.outlook(60.0, slope_6m=1.5, lead_index=0.4, sigma_resid=2.0)
    assert up["h6"] > up["h3"] > 60.0
    assert up["label"] == "positive"
    assert up["low"] <= up["h6"] <= up["high"]

    # Sin deriva -> stable.
    flat = core.outlook(70.0, slope_6m=0.0, lead_index=0.0, sigma_resid=1.0)
    assert flat["h6"] == pytest.approx(70.0, abs=TOL)
    assert flat["label"] == "stable"

    # Banda ancha que cruza hacia una banda peor -> watch.
    cruza = core.outlook(62.0, slope_6m=0.0, lead_index=0.0, sigma_resid=6.0)
    assert cruza["label"] == "watch"
    assert cruza["low"] <= cruza["h6"] <= cruza["high"]

    # El orden se mantiene incluso en los extremos, con todo recortado a [0, 100].
    for score_t, slope in [(0.0, -5.0), (100.0, 5.0), (2.0, -9.0), (99.0, 9.0)]:
        o = core.outlook(score_t, slope_6m=slope, lead_index=0.0, sigma_resid=8.0)
        assert 0.0 <= o["low"] <= o["h6"] <= o["high"] <= 100.0


# --- §5.6 Confianza ----------------------------------------------------

def test_confidence_by_history_and_coverage():
    # Historia larga, cobertura total y datos limpios.
    assert core.confidence(24, 100.0, "ok", 0.1) == pytest.approx(1.0, abs=TOL)

    # Tramos de f_hist (ENGINE §5.6).
    assert core.confidence(3, 100.0, "ok", 0.0) == pytest.approx(0.4, abs=TOL)
    assert core.confidence(6, 100.0, "ok", 0.0) == pytest.approx(0.7, abs=TOL)
    assert core.confidence(12, 100.0, "ok", 0.0) == pytest.approx(0.9, abs=TOL)
    assert core.confidence(18, 100.0, "ok", 0.0) == pytest.approx(1.0, abs=TOL)

    # f_cov = peso efectivo cubierto / 100.
    assert core.confidence(24, 75.0, "ok", 0.0) == pytest.approx(0.75, abs=TOL)

    # f_quality = 0,8 con caja de baja calidad o demasiado sin clasificar.
    assert core.confidence(12, 80.0, "low", 0.1) == pytest.approx(0.9 * 0.8 * 0.8, abs=TOL)
    assert core.confidence(12, 80.0, "ok", 0.7) == pytest.approx(0.9 * 0.8 * 0.8, abs=TOL)
    assert core.confidence(12, 80.0, "ok", 0.6) == pytest.approx(0.9 * 0.8, abs=TOL)

    # Rama sin facturas ni deuda: nunca llega a 1 (ENGINE §4.7).
    assert core.confidence(4, 65.0, "low", 0.0) < 0.5


# --- §8 Politica de alertas --------------------------------------------

def test_alert_budget_and_cooldown():
    cands = [
        {
            "company_id": f"COMP_{i:04d}",
            "cause": "regime_deteriorating",
            "direction": "down",
            "delta_score": -(10.0 + i),
            "p_change": 0.8,
            "exposure": 1.0,
            "month": "2025-03",
            "warmup": False,
        }
        for i in range(20)
    ]
    emitidas = core.alerts_policy(cands, universe_size=100)
    # Presupuesto: <= 5 % de 100 empresas al mes.
    assert len(emitidas) == 5
    # Y se queda con las de mayor |ΔScore| · p_change · exposicion.
    assert [a["company_id"] for a in emitidas] == [f"COMP_{i:04d}" for i in (19, 18, 17, 16, 15)]

    # La exposicion pesa: una pequena con exposicion alta adelanta a una grande.
    mix = [
        {"company_id": "A", "cause": "c", "direction": "down", "delta_score": -30.0,
         "p_change": 0.5, "exposure": 1.0, "month": "2025-03", "warmup": False},
        {"company_id": "B", "cause": "c", "direction": "down", "delta_score": -10.0,
         "p_change": 0.9, "exposure": 10.0, "month": "2025-03", "warmup": False},
    ]
    assert [a["company_id"] for a in core.alerts_policy(mix, universe_size=20)] == ["B"]

    # Presupuesto de mejora mas estrecho (2 %) y contado aparte.
    ups = [dict(c, direction="up", cause="regime_improving",
                delta_score=-c["delta_score"]) for c in cands]
    assert len(core.alerts_policy(ups, universe_size=100)) == 2
    mezcla = core.alerts_policy(cands + ups, universe_size=100)
    assert sum(1 for a in mezcla if a["direction"] == "down") == 5
    assert sum(1 for a in mezcla if a["direction"] == "up") == 2

    # Cool-down de 3 meses por empresa y causa.
    repetidas = [
        {"company_id": "COMP_0001", "cause": "regime_deteriorating", "direction": "down",
         "delta_score": -12.0, "p_change": 0.9, "exposure": 1.0,
         "month": m, "warmup": False}
        for m in ("2025-01", "2025-02", "2025-03", "2025-04", "2025-05")
    ]
    meses = [a["month"] for a in core.alerts_policy(repetidas, universe_size=100)]
    assert meses == ["2025-01", "2025-04"]

    # Otra causa distinta no comparte cool-down.
    otra = [dict(repetidas[1], cause="cap_NEGCASH")]
    meses2 = [(a["month"], a["cause"]) for a in core.alerts_policy(repetidas + otra, universe_size=100)]
    assert ("2025-02", "cap_NEGCASH") in meses2

    # En warm-up no se emite nunca.
    en_warmup = [dict(c, warmup=True) for c in cands]
    assert core.alerts_policy(en_warmup, universe_size=100) == []
