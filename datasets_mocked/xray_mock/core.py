"""Formulas puras del motor X-Ray (`docs/alfonso/ENGINE-EMBAT.md` §5-§8).

Sin I/O, sin aleatoriedad, sin estado global: todo entra por argumento y todo
sale por retorno. Los pesos, anclas y umbrales viven en `catalog.py` y llegan
aqui como parametros; este modulo solo sabe de aritmetica.

Convenciones:

- `u ∈ [0, 1]` es la senal normalizada, siempre orientada a "mas es mas sano".
- `None` significa "no disponible" y NUNCA se imputa a 0 (contrato mock §3).
- Las series llegan en orden cronologico; el ultimo elemento es el mes `t`.
"""

from __future__ import annotations

import math

from scipy import stats as _scipy_stats

__all__ = [
    "normalize_anchor", "normalize_percentile", "orient", "ewma",
    "pillar_score", "effective_weights", "level", "penalty", "caps", "score",
    "band", "contributions", "delta_decomposition",
    "theil_sen", "z_own", "breadth", "run", "cusum", "level_shift",
    "regime", "outlook", "confidence", "alerts_policy",
]


def _clip(x, lo, hi):
    return lo if x < lo else (hi if x > hi else x)


# =======================================================================
# §5.1 Normalizacion de cada senal a u ∈ [0, 1]
# =======================================================================

def normalize_anchor(value, anchors):
    """Anclas de dominio piecewise-linear (ENGINE §5.1).

    `anchors`: pares `[valor, u]` ordenados por valor, tal y como los declara
    `catalog.SIGNALS`. La direccion de la senal va DENTRO de la tabla (las
    `lower_better` tienen u descendente), asi que no se orienta despues.

    Fuera del rango de anclas se recorta al extremo correspondiente. `None`
    entra, `None` sale: sin dato no se imputa un cero.
    """
    if value is None:
        return None
    if not anchors:
        raise ValueError("normalize_anchor necesita al menos un ancla")
    pts = sorted(((float(x), float(u)) for x, u in anchors), key=lambda p: p[0])
    v = float(value)
    if v <= pts[0][0]:
        return pts[0][1]
    if v >= pts[-1][0]:
        return pts[-1][1]
    for (x0, u0), (x1, u1) in zip(pts, pts[1:]):
        if x0 <= v <= x1:
            if x1 == x0:
                return u1
            return u0 + (u1 - u0) * (v - x0) / (x1 - x0)
    return pts[-1][1]  # pragma: no cover - inalcanzable con pts ordenados


def _breakpoint_pairs(breakpoints):
    """Normaliza los cortes congelados a pares `(valor, cuantil)` ordenados."""
    if isinstance(breakpoints, dict):
        pairs = []
        for key, value in breakpoints.items():
            if isinstance(key, str):
                q = float(key.lstrip("pP")) / 100.0
            else:
                q = float(key)
                if q > 1.0:
                    q /= 100.0
            pairs.append((float(value), q))
        return sorted(pairs, key=lambda p: p[0])
    cuts = [float(x) for x in breakpoints]
    n = len(cuts)
    if n == 1:
        return [(cuts[0], 0.5)]
    return [(x, i / (n - 1)) for i, x in enumerate(sorted(cuts))]


def normalize_percentile(value, breakpoints):
    """Percentil congelado (ENGINE §5.1).

    `breakpoints` son los cortes estimados una sola vez sobre el universo de
    referencia: un dict `{"p01": x, ... "p99": x}` o un array ordenado (cuyos
    cortes se reparten [0, 1] uniformemente). Al test oculto se le aplican los
    MISMOS cortes: nunca se recalcula con la muestra que se esta puntuando.

    Interpolacion lineal entre cortes y recorte a [0, 1]; fuera del rango se
    devuelve el cuantil del corte extremo. `None` entra, `None` sale.

    Devuelve el cuantil crudo: las senales `lower_better` se invierten despues
    con `orient`, porque un percentil no lleva direccion dentro.
    """
    if value is None:
        return None
    pairs = _breakpoint_pairs(breakpoints)
    if not pairs:
        raise ValueError("normalize_percentile necesita al menos un corte")
    v = float(value)
    if v <= pairs[0][0]:
        return _clip(pairs[0][1], 0.0, 1.0)
    if v >= pairs[-1][0]:
        return _clip(pairs[-1][1], 0.0, 1.0)
    for (x0, q0), (x1, q1) in zip(pairs, pairs[1:]):
        if x0 <= v <= x1:
            q = q1 if x1 == x0 else q0 + (q1 - q0) * (v - x0) / (x1 - x0)
            return _clip(q, 0.0, 1.0)
    return _clip(pairs[-1][1], 0.0, 1.0)  # pragma: no cover


def orient(u, direction):
    """Orienta un cuantil a "mas es mas sano" (ENGINE §4, columna ↑/↓).

    Solo para senales `norm == "percentile"`: en las de ancla la direccion ya
    esta en la tabla de anclas.
    """
    if u is None:
        return None
    return float(u) if direction == "higher_better" else 1.0 - float(u)


def ewma(series, alpha):
    """Suavizado causal `u_smooth = EWMA(u, α)` (ENGINE §5.1).

    `α = 0,5` en senales de flujo, `α = 1` (identidad) en stock, regularidad y
    eventos. Causal: el valor de `t` solo depende de `1..t`. Un `None` sale
    como `None` y no actualiza el estado (no contamina el suavizado).
    """
    a = float(alpha)
    if not 0.0 < a <= 1.0:
        raise ValueError("alpha debe estar en (0, 1]")
    out = []
    state = None
    for x in series:
        if x is None:
            out.append(None)
            continue
        x = float(x)
        state = x if state is None else a * x + (1.0 - a) * state
        out.append(state)
    return out


# =======================================================================
# §5.2 / §5.3 Pilar, nivel y penalizacion
# =======================================================================

def pillar_score(u_by_signal, weights):
    """`P_k = Σ w_i·u_i / Σ w_i` sobre las senales DISPONIBLES (ENGINE §5.2).

    Renormaliza por el peso presente: una senal ausente (`None` o fuera del
    dict) no cuenta ni como 0 ni como 0,5. Si no hay ninguna, el pilar no
    existe y se devuelve `None` (§4.7: el pilar sale de la renormalizacion).
    """
    num = 0.0
    den = 0.0
    for sid, w in weights.items():
        u = u_by_signal.get(sid)
        if u is None:
            continue
        num += float(w) * float(u)
        den += float(w)
    if den == 0.0:
        return None
    return num / den


def effective_weights(pillar_availability, base_weights=None):
    """`w_k^eff = w_k·avail_k / Σ w_j·avail_j` (ENGINE §4.7).

    `pillar_availability`: `{pilar: avail}` con `avail ∈ [0, 1]` = fraccion del
    peso de senal del pilar que esta disponible (`catalog.pillar_availability`).
    `base_weights` por defecto son los 25/20/15/20/20 de §5.8.

    Devuelve pesos que suman 1 (el `100·` va en `level`).
    """
    if base_weights is None:
        from .catalog import PILLAR_WEIGHTS as base_weights  # noqa: N811
    raw = {
        k: float(base_weights.get(k, 0.0)) * float(avail)
        for k, avail in pillar_availability.items()
    }
    total = sum(raw.values())
    if total == 0.0:
        return {k: 0.0 for k in raw}
    return {k: v / total for k, v in raw.items()}


def level(pillars, eff_weights):
    """Nivel bruto `100 · Σ_k w_k^eff · P_k` (ENGINE §5.3, primer sumando).

    `Level_t` de §5.3 es `level(...) − penalty(...)`: aqui se devuelven por
    separado para que la descomposicion del delta (§7.2) sea exacta.
    Los pilares `None` no suman (su `w_k^eff` ya es 0 por §4.7).
    """
    total = 0.0
    for k, p in pillars.items():
        if p is None:
            continue
        total += float(eff_weights.get(k, 0.0)) * float(p)
    return 100.0 * total


def penalty(pillars, lam=0.5, tau=0.45):
    """`Penalty_t = 100 · λ · max(0, τ − min_k P_k)` (ENGINE §5.3).

    Agregacion no compensatoria explicable: castiga el pilar mas debil, no la
    media. Con `min P = 0,15` salen los 15 puntos del ejemplo del documento.
    """
    disponibles = [float(p) for p in pillars.values() if p is not None]
    if not disponibles:
        return 0.0
    return 100.0 * float(lam) * max(0.0, float(tau) - min(disponibles))


# =======================================================================
# §5.4 Techos por eventos duros
# =======================================================================

def _count_present(flags, start, end):
    """Cuenta `True` en `flags[start:end]` recortando a los indices validos."""
    lo = max(0, start)
    if end <= lo:
        return 0
    return sum(1 for f in flags[lo:end] if bool(f))


def _negcash_hit(neg, t):
    return t >= 1 and neg[t] is not None and neg[t - 1] is not None \
        and float(neg[t]) >= 10.0 and float(neg[t - 1]) >= 10.0


def _ssmiss_hit(ss, t):
    if t < 1:
        return False
    if bool(ss[t]) or bool(ss[t - 1]):
        return False
    return _count_present(ss, t - 12, t) >= 9


def _debtstop_hit(dr, t):
    if t < 1:
        return False
    if bool(dr[t]) or bool(dr[t - 1]):
        return False
    return _count_present(dr, t - 9, t) >= 6


def _locfull_hit(loc, t):
    return loc[t] is not None and float(loc[t]) >= 0.95


def caps(history, cap_values=None):
    """Techos por eventos duros (ENGINE §5.4). Devuelve `(codigo, valor)`.

    `history` es la historia mensual en orden cronologico (ultimo = `t`):

    - `neg_cash_days`: dias del mes con caja agregada < 0.
    - `ss_paid`: bool, hubo pago de Seguridad Social ese mes.
    - `debt_repayment`: bool, hubo amortizacion ese mes.
    - `loc_utilisation`: `Σ drawn / Σ facility` del mes.

    Las cuatro condiciones, literales de la tabla de §5.4:

    - `NEGCASH` (40): `neg_cash_days ≥ 10` en `t` y `t−1`; vigencia "mientras
      persista + 1 mes", asi que sigue activo si la condicion se cumplio en `t−1`.
    - `SSMISS` (45): SS pagada en ≥ 9 de los 12 meses previos a `t` y ausente en
      `t` y `t−1`; vigencia 2 meses.
    - `DEBTSTOP` (50): amortizacion en ≥ 6 de los 9 meses previos a `t` y ausente
      en `t` y `t−1`; vigencia 2 meses.
    - `LOCFULL` (60): `loc_utilisation ≥ 0,95`; solo mientras persista.

    Las ventanas de historia son las de la tabla ("los 12 meses previos"), es
    decir `t−12..t−1`, sin incluir `t`. Con historia mas corta se cuenta sobre
    lo que haya: si aun asi no llega al umbral, no hay techo.

    Con varios techos activos manda el mas restrictivo (el de menor valor).
    Sin ningun techo devuelve `(None, 100.0)`.
    """
    if cap_values is None:
        from .catalog import CAPS as cap_values  # noqa: N811

    activos = []

    neg = list(history.get("neg_cash_days") or [])
    if neg:
        t = len(neg) - 1
        if _negcash_hit(neg, t) or (t >= 1 and _negcash_hit(neg, t - 1)):
            activos.append(("NEGCASH", float(cap_values["NEGCASH"])))

    ss = list(history.get("ss_paid") or [])
    if ss:
        t = len(ss) - 1
        if _ssmiss_hit(ss, t) or (t >= 1 and _ssmiss_hit(ss, t - 1)):
            activos.append(("SSMISS", float(cap_values["SSMISS"])))

    dr = list(history.get("debt_repayment") or [])
    if dr:
        t = len(dr) - 1
        if _debtstop_hit(dr, t) or (t >= 1 and _debtstop_hit(dr, t - 1)):
            activos.append(("DEBTSTOP", float(cap_values["DEBTSTOP"])))

    loc = list(history.get("loc_utilisation") or [])
    if loc and _locfull_hit(loc, len(loc) - 1):
        activos.append(("LOCFULL", float(cap_values["LOCFULL"])))

    if not activos:
        return (None, 100.0)
    return min(activos, key=lambda item: item[1])


def score(level_value, cap_value=None):
    """`Score_t = min(Level_t, cap_t)` recortado a [0, 100] (ENGINE §5.4).

    `level_value` es el nivel YA penalizado: `level(...) − penalty(...)`.
    `cap_value` None o 100 significa "sin techo".
    """
    v = float(level_value)
    if cap_value is not None:
        v = min(v, float(cap_value))
    return _clip(v, 0.0, 100.0)


# =======================================================================
# §5.5 Bandas
# =======================================================================

def band(score_value, bands=None):
    """Banda del score (ENGINE §5.5): solid ≥ 80, healthy 60-79, watch 40-59, stress < 40."""
    if score_value is None:
        return None
    if bands is None:
        from .catalog import BANDS as bands  # noqa: N811
    v = float(score_value)
    for name, low, high in bands:
        if (low is None or v >= low) and (high is None or v < high):
            return name
    return bands[-1][0]  # pragma: no cover - las bandas cubren la recta


# =======================================================================
# §7 Explicabilidad
# =======================================================================

#: `u` de referencia cuando el universo no trae mediana para una senal: 0,5 es
#: el punto neutro de la escala normalizada.
DEFAULT_U_REF = 0.5


def contributions(u_smooth_by_signal, u_ref_by_signal, eff_weights,
                  signal_weights, penalty_value=0.0, cap_value=None):
    """Contribucion aditiva de cada senal (ENGINE §7.1).

    `contrib_i = 100 · w_k^eff · (w_i / Σ w_k) · (u_i − u_i^ref)`, con `u^ref` =
    mediana del universo de referencia y `Σ w_k` el peso de las senales
    DISPONIBLES del pilar (el mismo denominador que `pillar_score`, para que la
    identidad cierre).

    `signal_weights`: `{pilar: {signal_id: peso}}` (`catalog.signal_weights_by_pillar`).

    Devuelve un dict con `base` (nivel de la empresa mediana), `contrib`,
    `level_gross`, `level` (ya penalizado), `penalty`, `cap_adj` y `score`, de
    modo que se cumple EXACTAMENTE (1e-6):

        score = base + Σ contrib_i − penalty − cap_adj

    `cap_adj = level − score` absorbe tanto el techo de §5.4 como el recorte a
    [0, 100]: es cero cuando ninguno muerde.
    """
    contrib = {}
    base = 0.0
    level_gross = 0.0

    for pillar, weights in signal_weights.items():
        w_eff = float(eff_weights.get(pillar, 0.0))
        disponibles = {
            sid: float(w) for sid, w in weights.items()
            if u_smooth_by_signal.get(sid) is not None
        }
        den = sum(disponibles.values())
        if den == 0.0:
            continue
        for sid, w in disponibles.items():
            u = float(u_smooth_by_signal[sid])
            u_ref = u_ref_by_signal.get(sid)
            u_ref = DEFAULT_U_REF if u_ref is None else float(u_ref)
            share = w / den
            contrib[sid] = 100.0 * w_eff * share * (u - u_ref)
            base += 100.0 * w_eff * share * u_ref
            level_gross += 100.0 * w_eff * share * u

    level_net = level_gross - float(penalty_value)
    score_value = score(level_net, cap_value)
    return {
        "base": base,
        "contrib": contrib,
        "level_gross": level_gross,
        "level": level_net,
        "penalty": float(penalty_value),
        "cap_adj": level_net - score_value,
        "score": score_value,
    }


def delta_decomposition(contribs_t, contribs_prev, penalty_t, penalty_prev,
                        cap_adj_t, cap_adj_prev):
    """`ΔScore_t = Σ Δcontrib_i + ΔPenalty + ΔCap` (ENGINE §7.2).

    Exacta por aditividad, porque `base` (la empresa mediana del universo) esta
    congelada y se cancela entre los dos meses.

    Signo: los tres terminos se devuelven ya como APORTACION al delta del
    score, o sea `delta_penalty = −(penalty_t − penalty_prev)` y lo mismo para
    el techo; asi la suma es literalmente el delta y se lee en la UI sin pensar.

    Una senal presente en un solo mes cuenta como contribucion 0 en el otro
    (aparecer o desaparecer es informacion, no un hueco).
    """
    ids = set(contribs_t) | set(contribs_prev)
    delta_contrib = {
        sid: float(contribs_t.get(sid, 0.0)) - float(contribs_prev.get(sid, 0.0))
        for sid in sorted(ids)
    }
    delta_penalty = -(float(penalty_t) - float(penalty_prev))
    delta_cap = -(float(cap_adj_t) - float(cap_adj_prev))
    return {
        "delta_contrib": delta_contrib,
        "delta_penalty": delta_penalty,
        "delta_cap": delta_cap,
        "delta_1m": sum(delta_contrib.values()) + delta_penalty + delta_cap,
    }


# =======================================================================
# §6.1 Estadisticos de trayectoria (todos causales)
# =======================================================================

def theil_sen(scores, alpha=0.90):
    """Pendiente Theil-Sen con IC 90 % (ENGINE §6.1), en puntos de score / mes.

    Devuelve `(slope, lo, hi)`. Con menos de 3 puntos utiles no hay pendiente
    estimable: devuelve `(0.0, 0.0, 0.0)` en vez de `None` para que las reglas
    de regimen (§6.2) puedan compararla sin comprobar el caso nulo; el IC
    degenerado `lo = hi = 0` ya dice "no significativa".
    """
    puntos = [(i, float(y)) for i, y in enumerate(scores) if y is not None]
    if len(puntos) < 3:
        return (0.0, 0.0, 0.0)
    xs = [p[0] for p in puntos]
    ys = [p[1] for p in puntos]
    slope, _intercept, lo, hi = _scipy_stats.theilslopes(ys, xs, alpha=alpha)
    if math.isnan(lo) or math.isnan(hi):
        lo = hi = slope
    return (float(slope), float(lo), float(hi))


def z_own(scores, window=12, mad_scale=1.4826, min_history=6, min_scale=2.5):
    """`z_own = (Score_t − mediana_{t−12..t−1}) / max(1,4826 · MAD, 2,5)` (§6.1).

    Ventana causal: la referencia son los `window` meses ANTERIORES a `t`,
    nunca el propio `t`. Con menos de `min_history` meses previos devuelve
    `None`; con MAD = 0 (serie previa constante) devuelve 0,0 en vez de
    infinito, porque sin dispersion propia no hay sorpresa medible.

    `min_scale` (2,5 puntos de score) es el suelo de la escala, y es lo que
    impide que un z sin unidades llame "choque" a un temblor: con una MAD de
    medio punto —mitad del universo esta por debajo de 2,1— un vaiven de 1,4
    puntos daba |z| ≈ 2,8, y §6.2 lo etiquetaba de bache. Con el suelo, `|z| ≥ 2`
    implica SIEMPRE una desviacion ≥ 5 puntos de score respecto de la mediana
    previa: los mismos 5 puntos con los que §6.2 mide "por debajo del maximo"
    en `recovering`. Por debajo de eso el score no se mueve, vibra.
    """
    if not scores:
        return None
    actual = scores[-1]
    if actual is None:
        return None
    previos = [float(s) for s in scores[-(window + 1):-1] if s is not None]
    if len(previos) < min_history:
        return None
    med = _median(previos)
    mad = _median([abs(s - med) for s in previos])
    if mad == 0.0:
        return 0.0
    escala = max(mad_scale * mad, float(min_scale))
    return (float(actual) - med) / escala


def _median(values):
    ordenados = sorted(values)
    n = len(ordenados)
    if n == 0:
        return None
    mitad = n // 2
    if n % 2 == 1:
        return ordenados[mitad]
    return 0.5 * (ordenados[mitad - 1] + ordenados[mitad])


def breadth(delta_u_by_signal, flat=0.02):
    """Diffusion index sobre las senales (ENGINE §6.1), en 0-100.

    `Δ3m u > +0,02` cuenta 1, plano cuenta 0,5, `< −0,02` cuenta 0. Mide cuanta
    parte del cuadro se mueve: un score que cae con `breadth` 50 es una senal
    suelta, no un deterioro. Sin senales devuelve `None`.
    """
    valores = [float(d) for d in delta_u_by_signal.values() if d is not None]
    if not valores:
        return None
    puntos = 0.0
    for d in valores:
        if d > flat:
            puntos += 1.0
        elif d >= -flat:
            puntos += 0.5
    return 100.0 * puntos / len(valores)


def run(delta3_series):
    """Meses consecutivos con el mismo signo de `Δ3m Score` (ENGINE §6.1).

    Devuelve un entero CON SIGNO (racha negativa -> negativo) para que las
    reglas de §6.2 se lean como en el documento (`run ≤ −3`, `run ≥ 4`). Un
    ultimo delta exactamente plano corta la racha y devuelve 0.
    """
    if not delta3_series:
        return 0
    ultimo = delta3_series[-1]
    if ultimo is None or float(ultimo) == 0.0:
        return 0
    signo = 1 if float(ultimo) > 0 else -1
    n = 0
    for d in reversed(delta3_series):
        if d is None or float(d) == 0.0:
            break
        if (1 if float(d) > 0 else -1) != signo:
            break
        n += 1
    return signo * n


def cusum(z_series, k=0.5, h=4.0):
    """CUSUM tabular sobre `z_own` (ENGINE §6.1), `k = 0,5`, `h = 4`.

    Devuelve `(cusum_plus, cusum_minus)` acumulados hasta `t`, ambos ≥ 0.
    `h` no se usa para acumular: es el umbral con el que lo compara §6.2, y se
    deja en la firma para que el parametro viva en un solo sitio.
    """
    s_pos = 0.0
    s_neg = 0.0
    for z in z_series:
        if z is None:
            continue
        z = float(z)
        s_pos = max(0.0, s_pos + z - k)
        s_neg = max(0.0, s_neg - z - k)
    return (s_pos, s_neg)


def level_shift(scores, recent=3, previous=6):
    """Escalon: mediana de los 3 ultimos meses menos la de los 6 anteriores (§6.1).

    En puntos de score. Con menos de `recent + previous` meses devuelve `None`:
    un escalon sin base contra la que medirlo no es un escalon.
    """
    limpios = [s for s in scores if s is not None]
    if len(limpios) < recent + previous:
        return None
    ultimos = [float(s) for s in limpios[-recent:]]
    base = [float(s) for s in limpios[-(recent + previous):-recent]]
    return _median(ultimos) - _median(base)


# =======================================================================
# §6.2 Reglas de regimen
# =======================================================================

def _sig_negative(stats):
    return stats.get("slope_6m_hi") is not None and float(stats["slope_6m_hi"]) < 0.0


def _sig_positive(stats):
    return stats.get("slope_6m_lo") is not None and float(stats["slope_6m_lo"]) > 0.0


def _sig_any(stats):
    return _sig_negative(stats) or _sig_positive(stats)


def _shock_months(stats):
    """Meses del episodio `|z_own| ≥ 2` vigente en `t` o cerrado hace poco.

    Cuanto es "hace poco" lo fija el llamante, no esta funcion: el productor
    del mock usa `SHOCK_LABEL_LAG = 3` meses (`simulate.py`), uno mas que la
    ventana de reversion de §6.2, porque la histeresis necesita DOS meses con
    el mismo candidato; por eso `blip` se llega a escribir hasta cuatro meses
    despues del choque.

    Dato OBLIGATORIO: es la primera mitad de §6.2 ("|z_own| ≥ 2 durante 1-2
    meses"), y el mes `t` no la contiene (el bache se confirma cuando el nivel
    ya volvio y `|z_t|` ya no llega a 2). Si falta o es `None` se levanta
    `ValueError` en vez de asumir 1: asumirlo convertia "no hubo choque" en
    "hubo un choque de un mes" y dejaba la guarda del episodio inoperante.
    `0` es la respuesta valida y explicita para "no hay episodio".
    """
    meses = stats.get("z_exceed_months")
    if meses is None:
        raise ValueError(
            "regime: falta `z_exceed_months`, los meses consecutivos de "
            "|z_own| >= 2 del episodio vigente o recien cerrado (0 si no hay)")
    return int(meses)


def _regime_candidate(stats, prev_regime, h=4.0):
    run_v = float(stats.get("run", 0) or 0)
    breadth_v = stats.get("breadth")
    breadth_v = 50.0 if breadth_v is None else float(breadth_v)
    level_shift_v = float(stats.get("level_shift") or 0.0)
    cusum_plus = float(stats.get("cusum_plus") or 0.0)
    cusum_minus = float(stats.get("cusum_minus") or 0.0)
    z = stats.get("z_own")
    z = 0.0 if z is None else float(z)
    meses_choque = _shock_months(stats)

    if (run_v <= -3 and breadth_v <= 35.0
            and (_sig_negative(stats) or cusum_minus > h or level_shift_v <= -6.0)):
        return "deteriorating"

    if (run_v >= 4 and breadth_v >= 65.0
            and (_sig_positive(stats) or cusum_plus > h or level_shift_v >= 6.0)):
        return "improving"

    if prev_regime == "deteriorating" and float(stats.get("slope_3m") or 0.0) > 0.0 \
            and run_v >= 2 and stats.get("score") is not None \
            and stats.get("score_max_12m") is not None \
            and float(stats["score"]) <= float(stats["score_max_12m"]) - 5.0:
        return "recovering"

    # El bache se lee sobre el EPISODIO: 1-2 meses de |z_own| ≥ 2 (`meses_choque`)
    # y el nivel de vuelta a ±1σ de su mediana previa en ≤ 2 meses (`reverted`).
    if 1 <= meses_choque <= 2 and 40.0 <= breadth_v <= 60.0 and not _sig_any(stats):
        if bool(stats.get("reverted")):
            return "blip"
        if abs(z) >= 2.0:
            return "shock_pending"

    return "stable"


def regime(stats, prev_regime, h=4.0, warmup_until=7):
    """Regimen del mes con histeresis de 2 meses (ENGINE §6.2).

    `stats` (todo causal, calculado con las funciones de §6.1):
    `month_index`, `run`, `breadth`, `slope_3m`, `slope_6m`, `slope_6m_lo`,
    `slope_6m_hi`, `cusum_plus`, `cusum_minus`, `level_shift`, `z_own`,
    `score`, `score_max_12m` y `prev_candidate` (el candidato del mes anterior,
    que es el estado que hace falta para la histeresis).

    Y los dos datos del EPISODIO de choque, que §6.2 lee sobre el tramo y no
    sobre el mes `t`:

    - `z_exceed_months` (OBLIGATORIO): meses consecutivos de `|z_own| ≥ 2` del
      episodio vigente en `t` o cerrado hace poco; `0` si no hay ninguno. La
      ventana la fija el llamante (ver `_shock_months`), no esta funcion.
      Que falte levanta `ValueError`, porque sin el no hay episodio que medir y
      cualquier defecto silencioso lo da por existente.
    - `reverted`: el nivel ya volvio a ±1σ de su mediana ANTERIOR al choque
      dentro de la ventana de ≤ 2 meses. Por si solo no basta: sin episodio
      (`z_exceed_months == 0`) no hay bache, solo una bandera sin choque.

    Devuelve `(regime, candidate)`. `candidate` es la regla que se cumple ESTE
    mes; `regime` solo cambia si el mismo candidato se repite dos meses
    seguidos, asi que el llamante guarda `candidate` y se lo pasa como
    `prev_candidate` al mes siguiente.

    La histeresis se aplica tambien a `shock_pending` y `blip`: ENGINE §6.2 la
    pone sin excepciones, y un choque de un solo mes es exactamente el ruido
    que la regla de dos meses existe para filtrar.

    Orden de evaluacion: deteriorating, improving, recovering, blip/
    shock_pending, stable. Antes de `month_index` 7 todo es `warmup`.
    """
    if int(stats.get("month_index", 0)) < warmup_until:
        return ("warmup", "warmup")
    candidate = _regime_candidate(stats, prev_regime, h=h)
    if candidate == prev_regime:
        return (candidate, candidate)
    if stats.get("prev_candidate") == candidate:
        return (candidate, candidate)
    return (prev_regime, candidate)


# =======================================================================
# §6.3 Outlook
# =======================================================================

def outlook(score_t, slope_6m, lead_index, sigma_resid=3.0, phi=0.85, gamma=3.0,
            z_90=1.28, band_margin=2.0):
    """Banda "Bid/Ask" del score a 3 y 6 meses (ENGINE §6.3).

        Outlook_h = Score_t + φ·slope_6m·h + γ·LeadIndex_t
        banda     = Outlook_6 ± 1,28 · σ_resid · √6

    `lead_index` es la media de z ORIENTADOS de {A2, D4, P3, C2}, o sea
    positivo = favorable.

    Valores que ENGINE no fija (los calibra contra el motor real; aqui se
    eligen y se congelan en `catalog.OUTLOOK`):

    - `gamma = 3.0`: un LeadIndex a 1σ adverso resta 3 puntos al outlook, del
      orden de un cuarto de banda. ENGINE lo calibraria con la logistica de
      `y_Ds`, que el mock no tiene.
    - `sigma_resid = 3.0` puntos: desviacion residual de un score cuyo ruido
      mensual es del orden de 2 puntos mas la deriva de regimen.
    - `band_margin = 2.0` puntos: el mismo margen con el que §6.2 exige cruzar
      un umbral de banda, reutilizado para decidir `positive` / `negative`.

    Etiqueta: `positive` / `negative` si `Outlook_6 − Score_t` supera
    `band_margin`, `stable` si no; y `watch` si el suelo de la banda cae en una
    banda de score peor que la actual sin que la tendencia sea ya negativa.

    Todo sale recortado a [0, 100], lo que preserva `low ≤ h6 ≤ high`.
    """
    s = float(score_t)
    slope = float(slope_6m or 0.0)
    lead = float(lead_index or 0.0)
    ajuste = gamma * lead
    h3 = _clip(s + phi * slope * 3.0 + ajuste, 0.0, 100.0)
    h6_raw = s + phi * slope * 6.0 + ajuste
    h6 = _clip(h6_raw, 0.0, 100.0)
    medio = z_90 * float(sigma_resid) * math.sqrt(6.0)
    low = _clip(h6_raw - medio, 0.0, 100.0)
    high = _clip(h6_raw + medio, 0.0, 100.0)

    deriva = h6 - s
    if deriva <= -band_margin:
        label = "negative"
    elif deriva >= band_margin:
        label = "positive"
    else:
        label = "stable"
    if label != "negative":
        orden = ["stress", "watch", "healthy", "solid"]
        if orden.index(band(low)) < orden.index(band(s)):
            label = "watch"
    return {"h3": h3, "h6": h6, "low": low, "high": high, "label": label}


# =======================================================================
# §5.6 Confianza
# =======================================================================

def confidence(months_hist, covered_weight, cash_quality=None, unclassified_share=0.0):
    """`confidence = f_hist · f_cov · f_quality` (ENGINE §5.6).

    - `f_hist`: 0,4 (< 6 m), 0,7 (6-11), 0,9 (12-17), 1,0 (≥ 18).
    - `f_cov`: `covered_weight / 100`, con `covered_weight` = peso efectivo
      cubierto en escala 0-100 (§4.7).
    - `f_quality`: 0,8 si `cash_quality == "low"` o `unclassified_share > 0,6`.

    Por debajo de 0,5 la UI muestra banda ancha y no se disparan alertas.
    """
    m = int(months_hist)
    if m < 6:
        f_hist = 0.4
    elif m < 12:
        f_hist = 0.7
    elif m < 18:
        f_hist = 0.9
    else:
        f_hist = 1.0
    f_cov = _clip(float(covered_weight) / 100.0, 0.0, 1.0)
    f_quality = 0.8 if (cash_quality == "low" or float(unclassified_share or 0.0) > 0.6) else 1.0
    return _clip(f_hist * f_cov * f_quality, 0.0, 1.0)


# =======================================================================
# §8 Politica de alertas
# =======================================================================

def _month_index(month):
    """`"YYYY-MM"` o entero -> indice de mes comparable."""
    if isinstance(month, str):
        year, mon = month.split("-")
        return int(year) * 12 + int(mon)
    return int(month)


def alerts_policy(candidates, budget_down=0.05, budget_up=0.02, cooldown_months=3,
                  universe_size=None, emitted_history=None):
    """Presupuesto, orden y cool-down de las alertas (ENGINE §8).

    Cada candidato es un dict con `company_id`, `cause`, `direction`
    (`"down"` / `"up"`), `delta_score`, `p_change`, `exposure`, `month`
    (`"YYYY-MM"` o indice) y `warmup`.

    1. En warm-up no se emite NUNCA (§5.6 y contrato mock §3).
    2. Se procesan los meses en orden; dentro de cada mes se ordena por
       `|ΔScore| · p_change · exposicion` descendente (desempate por
       `company_id`, para que el resultado sea determinista).
    3. Cool-down de `cooldown_months` meses por empresa Y causa: se emite si
       han pasado al menos esos meses desde la ultima de la misma pareja.
    4. Presupuesto por mes: `≤ 5 %` de la cartera en deterioro y `≤ 2 %` en
       mejora, contados por separado y truncados hacia abajo (`≤`, no `≈`).

    `universe_size` es el tamano de la cartera; si no se pasa, se usa el numero
    de empresas distintas entre los candidatos. `emitted_history` permite
    arrastrar el cool-down de meses anteriores a la ventana: lista de
    `(company_id, cause, month)`.

    Devuelve los candidatos emitidos, con `priority` anadida, en orden de mes y
    prioridad.
    """
    vivos = [c for c in candidates if not c.get("warmup")]
    if universe_size is None:
        universe_size = len({c["company_id"] for c in candidates}) or 1

    cupo = {
        "down": int(float(budget_down) * float(universe_size)),
        "up": int(float(budget_up) * float(universe_size)),
    }

    ultima = {}
    for company_id, cause, month in (emitted_history or []):
        ultima[(company_id, cause)] = _month_index(month)

    emitidas = []
    meses = sorted({_month_index(c["month"]) for c in vivos})
    for mes in meses:
        del_mes = [c for c in vivos if _month_index(c["month"]) == mes]
        del_mes.sort(
            key=lambda c: (
                -abs(float(c.get("delta_score") or 0.0))
                * float(c.get("p_change") or 0.0)
                * float(c.get("exposure") or 0.0),
                c["company_id"],
                c.get("cause", ""),
            )
        )
        usado = {"down": 0, "up": 0}
        for c in del_mes:
            direccion = c.get("direction", "down")
            if usado.get(direccion, 0) >= cupo.get(direccion, 0):
                continue
            clave = (c["company_id"], c.get("cause"))
            anterior = ultima.get(clave)
            if anterior is not None and mes - anterior < int(cooldown_months):
                continue
            prioridad = (
                abs(float(c.get("delta_score") or 0.0))
                * float(c.get("p_change") or 0.0)
                * float(c.get("exposure") or 0.0)
            )
            emitidas.append({**c, "priority": prioridad})
            ultima[clave] = mes
            usado[direccion] = usado.get(direccion, 0) + 1
    return emitidas
