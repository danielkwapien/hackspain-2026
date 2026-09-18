"""Modelo estocastico del mock: trayectorias, senales y derivaciones con `core`.

El orden importa y es el de `plans/XR-001-mock-dataset/PLAN.md` §4.1:

1. El **score objetivo** se genera primero (nivel latente + escalon + tendencia +
   bache + ruido AR(1)).
2. Los **pilares y las senales** se derivan para reproducirlo POR LA FORMULA:
   se muestrean alrededor del objetivo y un desplazamiento comun `delta`,
   ajustado por biseccion, hace que `core.level(...) − core.penalty(...)`
   coincida con el objetivo. Nunca al reves.
3. El **valor crudo** sale de invertir la ancla del catalogo (o los cortes de
   percentil congelados), asi que `core.normalize_*(value) == u` exactamente.
4. Regimen, outlook, drivers, alertas, confianza y bandas: SIEMPRE `core.py`.
   Aqui no se escribe a mano ni un `cap_code` ni un `regime`.

Determinismo: un `numpy.random.Generator` por empresa derivado de
`(seed, crc32(company_id))`. Sin `hash()` de Python, sin `datetime.now()`, sin
iterar sets. Dos ejecuciones con el mismo `--seed` dan la misma salida.
"""

from __future__ import annotations

import math
import zlib
from dataclasses import dataclass, field

import numpy as np

from . import catalog, core

PILLARS: tuple[str, ...] = ("L", "P", "C", "D", "A")

#: Version del modelo generador (va al `manifest.json`).
GENERATOR_VERSION = "mock-gen-1"

# --------------------------------------------------------------------------
# §4.1 Parametros del modelo. Todos los numeros que el PLAN fija, en un sitio.
# --------------------------------------------------------------------------

LEVEL_PRIOR = {"mean": 62.0, "sd": 13.0, "low": 30.0, "high": 92.0}
STEP = {"p": 0.50, "p_negative": 0.60, "low": 6.0, "high": 18.0, "min_month": 7}
TREND = {"p": 0.25, "low": 0.4, "high": 1.0, "p_negative": 0.50}
DIP = {"p": 0.15, "low": 8.0, "high": 20.0, "min_month": 6}
NOISE = {"sd": 2.0, "ar1": 0.3}

#: Meses que tarda el escalon en completarse. No es un matiz estetico: `run`
#: (ENGINE §6.1) cuenta meses consecutivos con el mismo signo de `Δ3m Score`,
#: asi que un escalon instantaneo deja `run ≤ −3` UN solo mes y la histeresis
#: de §6.2 (dos meses con el mismo candidato) lo descarta siempre. Con dos
#: meses de transicion hay cuatro `Δ3m` negativos seguidos y `run` llega a −4.
#: La subida necesita un mes mas porque §6.2 le exige `run ≥ 4`.
STEP_MONTHS = {"down": 2, "up": 3}

#: Dispersion y correlacion de los pilares alrededor del objetivo (PLAN §4.1).
PILLAR_SPREAD = 0.08
PILLAR_CORR = 0.20
#: Dispersion de cada senal alrededor de su pilar.
SIGNAL_SPREAD = 0.06
#: Persistencia AR(1) de las desviaciones de pilar y de senal: sin ella las
#: trayectorias de los drivers serian ruido blanco mes a mes.
DEV_AR1 = 0.70
#: La desviacion de cada pilar y de cada senal se parte en un NIVEL propio
#: (constante, sorteado una vez) mas un temblor AR(1) pequeno alrededor de el.
#: La suma conserva la dispersion transversal de siempre (sd 1,40 en unidades
#: de `PILLAR_SPREAD` / `SIGNAL_SPREAD`, la de un AR(1) de innovacion 1 y phi
#: 0,7), que es la que da variedad a los drivers, pero divide por ~2,8 el ruido
#: a tres meses. Es lo que hace que `breadth` (ENGINE §6.1) signifique algo:
#: con el temblor anterior, la deriva de una caida de 1 punto/mes (0,03 en `u`)
#: quedaba enterrada bajo un ruido a 3 meses de 0,10 y el indice de difusion
#: salia ~40 pasara lo que pasara, asi que ninguna serie era nunca "ancha".
DEV_LEVEL_SD = 1.38
DEV_WOBBLE_SD = 0.12

#: Eventos duros (PLAN §4.1). Se inyectan bajando la senal, no escribiendo el cap.
EVENTS = {
    "NEGCASH": {"p": 0.04, "min_months": 2, "max_months": 4, "signal": "L3"},
    "SSMISS": {"p": 0.02, "min_months": 2, "max_months": 3, "signal": "P4"},
    "DEBTSTOP": {"p": 0.02, "min_months": 2, "max_months": 3, "signal": "D2"},
    "LOCFULL": {"p": 0.08, "months": 3, "signal": "D1"},
}

#: El bache es un choque ESTRECHO, y ademas es un TRASVASE. Estrecho porque
#: ENGINE §6.2 solo llama `blip` a lo que deja `breadth` en [40, 60], y porque
#: es lo que pasa de verdad: un mes malo de caja no cambia la mora del cliente
#: ni el apalancamiento. Trasvase porque lo que un frente pierde otro lo gana
#: (sin caja se aprieta el cobro, con deuda nueva engorda la caja), y es lo que
#: deja el indice de difusion CENTRADO: con m senales abajo, m arriba y el
#: resto planas, `breadth = 50` exacto, con margen de ±10 puntos para el
#: temblor. Contando solo caidas, `breadth = 50·(k−m)/k` se pegaba al borde de
#: 40 y cualquier ruido sacaba el bache de la regla.
DIP_SHARE = 0.12
DIP_MAX_SIGNALS = 3
#: Sesgo fijo del grupo que mejora. Solo tiene que separarse del umbral de
#: "plano" de `core.breadth` (±0,02); el score lo cuadra la biseccion del otro.
DIP_COUNTER_BIAS = 0.10
#: A donde va el trasvase de cada pilar (ENGINE §4: `u` alto es mejor).
DIP_COUNTER_PILLAR = {"L": "C", "P": "L", "C": "A", "D": "L", "A": "L"}
#: `L3` (dias en descubierto) y `D1` (uso de la poliza) llevan techo de ENGINE
#: §5.4 colgando: moverlas en un bache convertiria el bache en un cap.
DIP_EXCLUDED_SIGNALS = ("L3", "D1")
#: Senales que hunde cada caso fijado con bache (contrato §3).
#: `L4` (colchon sobre gastos fijos) va primero porque es `stock`: la EWMA la
#: pasa entera en el mes (alfa 1), mientras que `L1` y `L2` son `flow` y solo
#: dejan pasar la mitad. Sin una senal instantanea la caida de caja tardaba dos
#: meses en verse en el pilar y dejaba de ser "de un mes".
DIP_SIGNALS_BY_CASE = {
    "dip": ("L4", "L1", "L2"),
    "cash_drop": ("L4", "L1", "L2"),
}
#: Rango del sesgo del choque, en unidades de `u`. La biseccion lo busca dentro.
DIP_BIAS_RANGE = 1.2
#: Meses de cola en los que el choque sigue mandando sobre las mismas senales,
#: ahora para DEVOLVER el score a su trayectoria base. Sin ellos la reversion
#: la tendria que hacer el desplazamiento comun, o sea moviendo todo el cuadro,
#: y el bache dejaria de ser estrecho justo en los meses en los que ENGINE §6.2
#: lo confirma.
SHOCK_TAIL_MONTHS = 3
#: Cuanto se calla el ruido comun del objetivo dentro de esa ventana. El bache
#: es el UNICO suceso de esos meses: si el nivel de fondo se mueve a la vez,
#: ese movimiento es ANCHO (lo llevan todas las senales a la vez) y arrastra el
#: indice de difusion fuera de la banda [40, 60] justo en los meses en los que
#: §6.2 tiene que reconocer el bache. De paso deja la reversion limpia: el
#: score vuelve a su mediana previa y no a la mediana mas un ruido nuevo, que
#: es lo que §6.2 mide con "±1σ de su mediana previa".
SHOCK_CALM = 0.25

#: Prior real de `cash_quality = low` (contrato §2.1).
CASH_QUALITY_LOW_P = 0.065

#: Un solo mes suelto sin SS / sin amortizacion: da variedad a P4 y D2 sin
#: disparar techos (los caps exigen DOS meses seguidos).
LONE_MISS_P = 0.35

#: Tolerancia de la biseccion, en puntos de score (PLAN §4.1: "±0,5").
BISECTION_TOL = 0.4
BISECTION_MAX_ITER = 40
BISECTION_RANGE = 1.2

#: Umbral de |delta_1m| a partir del cual una empresa "se mueve" en `frames`.
MOVING_THRESHOLD = 2.0

#: Horizonte en el que se busca el "evento evidente" de una alerta (ENGINE §9.2).
EVIDENCE_HORIZON = 6

#: `core.regime` trae `warmup_until = 7` (ENGINE §6.2). Aqui se usa 3 para que
#: se cumpla la invariante del PLAN §4.1 `regime == "warmup" <=> warmup == True`
#: con `warmup = month_index <= 3` (contrato §2.3): `core.regime` tiene
#: histeresis de dos meses, asi que el primer mes con candidato propio
#: (`month_index == 3`) todavia devuelve `warmup` y el regimen real empieza en
#: el 4. Los meses 4-6 salen `stable`: sin seis meses de historia no hay
#: `z_own` ni `level_shift`, y ninguna regla de §6.2 puede dispararse.
WARMUP_UNTIL = catalog.WARMUP_MONTHS["default"]

#: Casos fijados por id (contrato §3). La forma manda sobre el azar.
FIXED_CASES: dict[str, str] = {
    "COMP_0108": "rise",
    "COMP_1061": "rise",
    "COMP_0866": "rise",
    "COMP_0519": "step_down",
    "COMP_0766": "step_down",
    "COMP_1015": "gradual_down",
    "COMP_0651": "gradual_down",
    "COMP_0099": "dip",
    "COMP_1022": "dip",
    "COMP_1267": "cash_tension",
    "COMP_0905": "cash_drop",
    "COMP_1250": "cash_drop",
    "COMP_0354": "deleveraging",
    "COMP_0016": "solid",
}


# --------------------------------------------------------------------------
# Determinismo
# --------------------------------------------------------------------------


def stable_hash(text: str) -> int:
    """Hash estable entre ejecuciones y maquinas (`hash()` de Python NO lo es)."""
    return zlib.crc32(text.encode("utf-8"))


def rng_for(seed: int, key: str) -> np.random.Generator:
    """Un generador por entidad: `--limit` no cambia lo que sale de cada empresa."""
    return np.random.default_rng([int(seed), stable_hash(key)])


# --------------------------------------------------------------------------
# Nombres legibles (contrato §2.1: sinteticos, deterministas, nunca sustituyen al id)
# --------------------------------------------------------------------------

_PREFIXES = (
    "Distribuciones", "Talleres", "Comercial", "Suministros", "Industrias",
    "Transportes", "Construcciones", "Servicios", "Logistica", "Agricola",
    "Hermanos", "Grupo", "Electro", "Alimentaria", "Textil", "Quimica",
)
_SURNAMES = (
    "Arga", "Beltran", "Carrion", "Duero", "Ebro", "Fuentes", "Gallardo",
    "Herrera", "Iranzo", "Jimena", "Lacalle", "Moncayo", "Navarro", "Olmedo",
    "Pinilla", "Quintana", "Ribera", "Salazar", "Tudela", "Ulzama", "Valverde",
    "Xativa", "Yuste", "Zubiri", "Aranda", "Bierzo", "Cardona", "Doriga",
)
_SUFFIXES = ("S.L.", "S.A.", "S.L.U.", "y Cia. S.L.")
_GROUP_SUFFIXES = ("Holding", "Group", "Participaciones", "Corporacion")


def company_name(company_id: str) -> str:
    """`COMP_0108` -> `Distribuciones Arga S.L.`, estable por `crc32` del id."""
    h = stable_hash(company_id)
    return (
        f"{_PREFIXES[h % len(_PREFIXES)]} "
        f"{_SURNAMES[(h // 16) % len(_SURNAMES)]} "
        f"{_SUFFIXES[(h // 512) % len(_SUFFIXES)]}"
    )


def group_name(group_id: str) -> str:
    """`GROUP_0113` -> `Moncayo Holding`."""
    h = stable_hash(group_id)
    return (
        f"{_SURNAMES[h % len(_SURNAMES)]} "
        f"{_GROUP_SUFFIXES[(h // 32) % len(_GROUP_SUFFIXES)]}"
    )


# --------------------------------------------------------------------------
# Escalas de las senales por percentil y formato legible
# --------------------------------------------------------------------------

#: Distribucion plausible de la unidad de cada senal `norm == "percentile"`:
#: `(minimo, maximo, gamma)` con `Q(q) = lo + (hi − lo)·q^gamma`. `gamma > 1`
#: concentra la masa cerca del minimo (colas a la derecha, como en el dataset).
#: Los cortes congelados que se guardan en `manifest.json` son `Q` en la rejilla
#: uniforme de 21 puntos; el valor crudo se obtiene invirtiendo ESOS cortes, de
#: modo que `core.normalize_percentile(value, cuts)` devuelve exactamente el
#: cuantil que se uso para generarlo.
PERCENTILE_SCALES: dict[str, tuple[float, float, float]] = {
    "L2": (0.0, 3.0, 2.2),      # caja minima / salidas del mes
    "P3": (0.0, 0.90, 2.5),     # deuda comercial vencida / recibido
    "C3": (0.0, 0.80, 2.4),     # cartera vencida / emitido
    "C5": (1.0, 45.0, 1.8),     # clientes efectivos (1/HHI)
    "C6": (0.0, 1.50, 1.6),     # rotacion de clientes relativa
    "D4": (0.0, 0.08, 2.6),     # comisiones e intereses / pagos
    "D6": (0.0, 8.0, 2.4),      # deuda / cobros 12 m
    "A1": (-0.60, 0.80, 1.0),   # crecimiento de cobros 3m/12m
    "A2": (0.05, 2.00, 1.9),    # coeficiente de variacion de cobros
    "A4": (0.40, 1.80, 1.0),    # actividad 3m / media 12m
}

PERCENTILE_GRID_POINTS = 21


def percentile_cuts(signal_id: str) -> list[float]:
    """Cortes congelados de una senal por percentil (rejilla uniforme de 21)."""
    lo, hi, gamma = PERCENTILE_SCALES[signal_id]
    n = PERCENTILE_GRID_POINTS
    return [lo + (hi - lo) * (i / (n - 1)) ** gamma for i in range(n)]


FROZEN_BREAKPOINTS: dict[str, list[float]] = {
    sid: percentile_cuts(sid) for sid in sorted(PERCENTILE_SCALES)
}

_GRID = [i / (PERCENTILE_GRID_POINTS - 1) for i in range(PERCENTILE_GRID_POINTS)]


def invert_percentile(q: float, cuts: list[float]) -> float:
    """Inversa exacta de `core.normalize_percentile` sobre los mismos cortes."""
    return float(np.interp(q, _GRID, cuts))


def invert_anchor(u: float, anchors) -> float:
    """Valor crudo cuya normalizacion por anclas devuelve `u` (ENGINE §5.1).

    Inversa de `core.normalize_anchor`. En una meseta (dos anclas con el mismo
    `u`, como los tramos "1-3 dias" de L3) devuelve el punto medio del tramo:
    cualquier punto del tramo normaliza al mismo `u`, y el medio es el unico
    que no depende de por que lado se entre.
    """
    pts = sorted(((float(x), float(uu)) for x, uu in anchors), key=lambda p: p[0])
    u_first, u_last = pts[0][1], pts[-1][1]
    ascending = u_last >= u_first
    if (ascending and u <= u_first) or (not ascending and u >= u_first):
        return pts[0][0]
    if (ascending and u >= u_last) or (not ascending and u <= u_last):
        return pts[-1][0]
    for (x0, u0), (x1, u1) in zip(pts, pts[1:]):
        lo_u, hi_u = (u0, u1) if u0 <= u1 else (u1, u0)
        if lo_u <= u <= hi_u:
            if u1 == u0:
                return 0.5 * (x0 + x1)
            return x0 + (x1 - x0) * (u - u0) / (u1 - u0)
    return pts[-1][0]


def signal_u_range(signal: dict) -> tuple[float, float]:
    """Rango de `u` REPRESENTABLE por la senal.

    Fuera de el no existe valor crudo que lo devuelva (L5 solo llega a [0,5, 1]),
    asi que se recorta antes de puntuar: lo que se escribe en `signals.csv`
    cierra con lo que puntua.
    """
    if signal["norm"] == "anchor":
        us = [float(u) for _v, u in signal["anchors"]]
        return (min(us), max(us))
    return (0.0, 1.0)


def _num(value: float, decimals: int = 2) -> str:
    """Numero en castellano: coma decimal y punto de millar."""
    text = f"{value:,.{decimals}f}"
    return text.replace(",", "").replace(".", ",").replace("", ".")


def _pct(value: float, decimals: int = 0) -> str:
    return f"{_num(100.0 * value, decimals)} %"


def _signed_pct(value: float, decimals: int = 0) -> str:
    signo = "+" if value >= 0 else "-"
    return f"{signo}{_num(abs(100.0 * value), decimals)} %"


#: `value_fmt` del contrato §2.5: texto ya con unidad, en castellano. Es lo que
#: cita la narrativa y lo que la UI pinta al lado del driver.
VALUE_FORMATTERS = {
    "L1": lambda v: f"{_num(v, 0)} dias de colchon de caja",
    "L2": lambda v: f"caja minima {_num(v, 2)} veces las salidas del mes",
    "L3": lambda v: f"{_num(v, 0)} dias en negativo",
    "L4": lambda v: f"{_num(v, 1)} meses de runway",
    "L5": lambda v: f"{_pct(v)} del colchon invertido",
    "P1": lambda v: f"{_pct(v)} de las facturas propias pagadas tarde",
    "P2": lambda v: f"paga a proveedores {_num(v, 0)} dias tarde",
    "P3": lambda v: f"deuda comercial vencida {_pct(v)} de lo recibido",
    "P4": lambda v: f"Seguridad Social pagada {_pct(v)} de los meses",
    "P5": lambda v: f"impuestos al dia {_pct(v)} de los meses",
    "P6": lambda v: f"nominas al dia {_pct(v)} de los meses",
    "C1": lambda v: f"{_pct(v)} de las facturas de cliente cobradas tarde",
    "C2": lambda v: f"cobra con {_num(v, 0)} dias de retraso",
    "C3": lambda v: f"cartera vencida {_pct(v)} de lo emitido",
    "C4": lambda v: f"cobra el {_pct(v)} de lo emitido",
    "C5": lambda v: f"{_num(v, 0)} clientes efectivos",
    "C6": lambda v: f"rotacion de clientes {_num(v, 2)}",
    "D1": lambda v: f"{_pct(v)} de la linea dispuesta",
    "D2": lambda v: f"amortiza el {_pct(v)} de lo previsto",
    "D3": lambda v: f"servicio de deuda {_pct(v)} de los cobros",
    "D4": lambda v: f"comisiones e intereses {_pct(v, 2)} de los pagos",
    "D5": lambda v: f"{_pct(v)} de la deuda no es bancaria",
    "D6": lambda v: f"deuda {_num(v, 2)} veces los cobros de 12 meses",
    "A1": lambda v: f"cobros {_signed_pct(v)} frente a 12 meses",
    "A2": lambda v: f"volatilidad de cobros {_num(v, 2)}",
    "A3": lambda v: f"flujo operativo neto {_signed_pct(v)} de los cobros",
    "A4": lambda v: f"actividad {_num(v, 2)} veces la media de 12 meses",
    "A5": lambda v: f"{_pct(v)} de los cobros vienen del grupo",
}


def format_value(signal_id: str, value) -> str | None:
    """`value_fmt` del contrato §2.5, o `None` si no hay valor."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    return VALUE_FORMATTERS[signal_id](float(value))


# --------------------------------------------------------------------------
# Trayectoria objetivo
# --------------------------------------------------------------------------


def _ar1(rng: np.random.Generator, n: int, phi: float, sd: float) -> list[float]:
    """Ruido AR(1) `x_t = phi·x_{t−1} + N(0, sd)`."""
    out = []
    state = 0.0
    for _ in range(n):
        state = phi * state + float(rng.normal(0.0, sd))
        out.append(state)
    return out


@dataclass
class Shape:
    """Forma de la trayectoria objetivo, ya resuelta (azar o caso fijado)."""

    mu: float
    trend: float = 0.0
    trend_from: int = 0
    step_month: int | None = None
    step_size: float = 0.0
    dip_month: int | None = None
    dip_depth: float = 0.0
    dip_months: int = 1
    #: Pilar por el que entra el bache; sus senales son las que se hunden.
    dip_pillar: str | None = None
    noise_sd: float = NOISE["sd"]
    kind: str = "random"

    @property
    def step_months(self) -> int:
        """Meses de transicion del escalon, segun su signo (`STEP_MONTHS`)."""
        return STEP_MONTHS["down" if self.step_size < 0 else "up"]


def _random_shape(rng: np.random.Generator, n: int) -> Shape:
    """Nivel latente + escalon + tendencia + bache, con las probabilidades del PLAN."""
    mu = float(np.clip(rng.normal(LEVEL_PRIOR["mean"], LEVEL_PRIOR["sd"]),
                       LEVEL_PRIOR["low"], LEVEL_PRIOR["high"]))
    shape = Shape(mu=mu)

    if rng.random() < STEP["p"] and n >= STEP["min_month"] + 1:
        month = int(rng.integers(STEP["min_month"] - 1, n))
        size = float(rng.uniform(STEP["low"], STEP["high"]))
        if rng.random() < STEP["p_negative"]:
            size = -size
        shape.step_month, shape.step_size = month, size

    if rng.random() < TREND["p"]:
        slope = float(rng.uniform(TREND["low"], TREND["high"]))
        if rng.random() < TREND["p_negative"]:
            slope = -slope
        shape.trend = slope

    if rng.random() < DIP["p"] and n >= DIP["min_month"] + 3:
        shape.dip_month = int(rng.integers(DIP["min_month"] - 1, n - 2))
        shape.dip_depth = -float(rng.uniform(DIP["low"], DIP["high"]))
        shape.dip_months = int(rng.integers(1, 3))
        shape.dip_pillar = PILLARS[int(rng.integers(0, len(PILLARS)))]

    return shape


def shock_window(shape: Shape, n: int) -> set[int]:
    """Meses en los que manda el choque: el bache y su cola de reversion."""
    if shape.dip_month is None:
        return set()
    return set(range(
        shape.dip_month,
        min(n, shape.dip_month + shape.dip_months + SHOCK_TAIL_MONTHS)))


def _pillar_signals(pillar: str, signal_ids: list[str]) -> list[str]:
    """Senales disponibles de un pilar, de mas peso a menos, sin las de techo."""
    return sorted(
        (sid for sid in signal_ids
         if catalog.SIGNALS_BY_ID[sid]["pillar"] == pillar
         and sid not in DIP_EXCLUDED_SIGNALS),
        key=lambda sid: (-catalog.SIGNALS_BY_ID[sid]["weight"], sid),
    )


def dip_signal_ids(shape: Shape, signal_ids: list[str]):
    """Las dos puntas del choque: `(abajo, arriba)`.

    `abajo` son las pocas senales que se hunden y cargan toda la caida del
    score; `arriba`, las mismas pocas del pilar al que va el trasvase. El resto
    del cuadro no se entera, que es justo lo que `breadth` tiene que ver.
    """
    if shape.dip_month is None:
        return ([], [])
    fijas = DIP_SIGNALS_BY_CASE.get(shape.kind)
    if fijas is not None:
        disponibles = set(signal_ids)
        abajo = [sid for sid in fijas if sid in disponibles]
    else:
        abajo = _pillar_signals(shape.dip_pillar, signal_ids)
    tope = max(1, min(DIP_MAX_SIGNALS, int(DIP_SHARE * len(signal_ids) + 0.5)))
    abajo = abajo[:tope]
    if not abajo:
        return ([], [])
    origen = catalog.SIGNALS_BY_ID[abajo[0]]["pillar"]
    arriba = _pillar_signals(DIP_COUNTER_PILLAR[origen], signal_ids)[:len(abajo)]
    return (abajo, arriba)


#: Duracion y arranque del evento de los casos "caida de caja en un mes".
#: Dos meses, no tres: ENGINE §6.2 solo llama bache a un choque de 1-2 meses
#: (`z_exceed_months ≤ 2`), y con tres el caso se quedaba fuera de la regla.
CASH_DROP_MONTHS = 2


def _cash_drop_start(n: int) -> int:
    """Mes (indice 0) en el que se hunde la caja de COMP_0905 / COMP_1250."""
    return max(3, n - 6)


def _fixed_shape(kind: str, n: int) -> Shape:
    """Forma de los 14 casos fijados: se NOTA en el score, no es un matiz."""
    if kind == "rise":
        return Shape(mu=50.0, trend=1.1, noise_sd=1.0, kind=kind)
    if kind == "step_down":
        return Shape(mu=72.0, step_month=max(7, n // 2), step_size=-16.0,
                     noise_sd=1.0, kind=kind)
    if kind == "gradual_down":
        return Shape(mu=76.0, trend=-1.1, noise_sd=1.0, kind=kind)
    if kind == "dip":
        # −13 y no −17: el bache entra ahora por tres senales de liquidez, y
        # esa es la caida que alcanzan sin tener que clavarlas en el suelo de
        # su ancla. Sigue muy por encima de los 7 puntos que el contrato §3
        # pide para que la forma se lea como bache.
        return Shape(mu=70.0, dip_month=max(6, n - 8), dip_depth=-13.0,
                     dip_months=2, noise_sd=0.9, kind=kind)
    if kind == "cash_tension":
        # -0,9 por lo mismo que `deleveraging`: por debajo de ~0,7 puntos/mes
        # la deriva de tres meses no llega al umbral de "plano" de `breadth`
        # (±0,02 en `u`, o sea 2 puntos de score) y el deterioro no se ve.
        return Shape(mu=64.0, trend=-0.9, trend_from=max(0, n - 10),
                     noise_sd=1.2, kind=kind)
    if kind == "cash_drop":
        # Dos meses de choque sobre las senales de liquidez y vuelta a la
        # trayectoria: la caja se hunde y el score se cae el mismo mes, que es
        # lo que se lee en la UI como "caida de caja en un mes".
        return Shape(mu=66.0, dip_month=_cash_drop_start(n), dip_depth=-15.0,
                     dip_months=CASH_DROP_MONTHS, noise_sd=0.9, kind=kind)
    if kind == "deleveraging":
        # 0,9 y no 0,5: `breadth` cuenta plano lo que se mueve menos de 0,02 en
        # `u`, o sea menos de 2 puntos de score en tres meses (ENGINE §6.1).
        # Con 0,5 puntos/mes la mejora era invisible para el indice de difusion
        # y `improving` (que exige `breadth ≥ 65`) no podia dispararse nunca.
        return Shape(mu=68.0, trend=0.9, noise_sd=1.0, kind=kind)
    if kind == "solid":
        # 1,2 y no 0,8: `z_own` esta escalado por el MAD de la propia empresa,
        # asi que una empresa quieta convierte cualquier temblor en un choque
        # de |z| ≥ 2. Con 1,2 ese temblor pasa de los 2 puntos de score que
        # `breadth` necesita para contarlo como movimiento ancho, sale de la
        # banda [40, 60] y la solida se queda en `stable`, que es lo que es.
        return Shape(mu=86.0, noise_sd=1.2, kind=kind)
    raise KeyError(f"caso fijado desconocido: {kind!r}")


def target_series(shape: Shape, rng: np.random.Generator, n: int):
    """Serie objetivo de `level − penalty` (el score antes de techos).

    Devuelve `(base, dip)`: la trayectoria SIN bache y el hundimiento de cada
    mes. Van por separado porque se inyectan distinto (PLAN §4.1 revisado): la
    base es un movimiento ancho (la reparte un desplazamiento comun a todas las
    senales) y el bache es estrecho (lo cargan unas pocas senales). Esa es la
    diferencia que `breadth` mide y de la que vive la regla de §6.2.
    """
    noise = _ar1(rng, n, NOISE["ar1"], shape.noise_sd)
    ventana = shock_window(shape, n)
    centre = (n - 1) / 2.0
    base = []
    dip = []
    for t in range(n):
        value = shape.mu + noise[t] * (SHOCK_CALM if t in ventana else 1.0)
        if shape.trend:
            if shape.trend_from:
                value += shape.trend * max(0, t - shape.trend_from)
            else:
                value += shape.trend * (t - centre)
        if shape.step_month is not None and t >= shape.step_month:
            avance = min(1.0, (t - shape.step_month + 1) / shape.step_months)
            value += shape.step_size * avance
        base.append(float(np.clip(value, 2.0, 97.0)))
        dentro = (shape.dip_month is not None
                  and shape.dip_month <= t < shape.dip_month + shape.dip_months)
        dip.append(shape.dip_depth if dentro else 0.0)
    return base, dip


# --------------------------------------------------------------------------
# Simulacion de una empresa (primera pasada)
# --------------------------------------------------------------------------


@dataclass
class CompanySim:
    company_id: str
    group_id: str
    months: list[str]
    branch: str
    coverage: dict
    signal_ids: list[str]
    eff_weights: dict
    signal_weights: dict
    cash_quality: str
    u: dict[str, list[float]] = field(default_factory=dict)
    u_smooth: dict[str, list[float]] = field(default_factory=dict)
    value: dict[str, list[float]] = field(default_factory=dict)
    pillars: list[dict] = field(default_factory=list)
    level: list[float] = field(default_factory=list)
    penalty: list[float] = field(default_factory=list)
    cap_code: list = field(default_factory=list)
    cap: list[float] = field(default_factory=list)
    score: list[float] = field(default_factory=list)
    target: list[float] = field(default_factory=list)
    clipped: int = 0
    events: dict = field(default_factory=dict)
    quality_flag: dict[str, list] = field(default_factory=dict)
    covered_weight: float = 100.0


def _event_windows(rng, n, coverage, kind):
    """Meses de cada evento duro. Los casos "sanos" no reciben ninguno.

    `cash_drop` tampoco: el techo NEGCASH exige caja negativa DOS meses
    seguidos y vale "mientras persista + 1 mes" (ENGINE §5.4), o sea tres meses
    de score hundido. Eso ya no es la caida de un mes que el contrato §3 pide
    para COMP_0905 y COMP_1250, y ademas saca el caso de la regla de bache de
    §6.2, que solo admite choques de 1-2 meses. El hundimiento de la caja lo
    hace el choque estrecho sobre las senales de liquidez; el techo se queda
    para las empresas que de verdad encadenan dos meses en descubierto.
    """
    windows = {}
    sanos = ("rise", "solid", "deleveraging", "cash_drop")

    spec = EVENTS["NEGCASH"]
    if kind not in sanos and rng.random() < spec["p"] and n >= 6:
        length = int(rng.integers(spec["min_months"], spec["max_months"] + 1))
        start = int(rng.integers(3, max(4, n - length + 1)))
        windows["NEGCASH"] = list(range(start, min(n, start + length)))

    spec = EVENTS["SSMISS"]
    if coverage.get("ss") and kind not in ("rise", "solid", "deleveraging") and \
            rng.random() < spec["p"] and n >= 8:
        length = int(rng.integers(spec["min_months"], spec["max_months"] + 1))
        start = int(rng.integers(6, max(7, n - length + 1)))
        windows["SSMISS"] = list(range(start, min(n, start + length)))

    spec = EVENTS["DEBTSTOP"]
    if coverage.get("debt_repayment") and kind not in ("rise", "solid", "deleveraging") \
            and rng.random() < spec["p"] and n >= 8:
        length = int(rng.integers(spec["min_months"], spec["max_months"] + 1))
        start = int(rng.integers(6, max(7, n - length + 1)))
        windows["DEBTSTOP"] = list(range(start, min(n, start + length)))

    spec = EVENTS["LOCFULL"]
    if coverage.get("loc") and kind not in ("rise", "solid", "deleveraging") and \
            rng.random() < spec["p"] and n >= 4:
        windows["LOCFULL"] = list(range(max(0, n - spec["months"]), n))

    return windows


def _regularity_series(rng, n, missing_months) -> list[bool]:
    """Serie mensual de "hubo pago" para P4 (SS) y D2 (amortizacion).

    Todos los meses pagados salvo el evento inyectado y, con `LONE_MISS_P`, UN
    mes suelto (nunca dos seguidos: los techos exigen dos meses consecutivos, y
    el presupuesto de eventos duros lo fija `EVENTS`, no el azar).
    """
    paid = [True] * n
    for t in missing_months:
        if 0 <= t < n:
            paid[t] = False
    if n >= 4 and rng.random() < LONE_MISS_P:
        candidates = [
            t for t in range(1, n)
            if paid[t] and (t - 1 < 0 or paid[t - 1]) and (t + 1 >= n or paid[t + 1])
        ]
        if candidates:
            paid[candidates[int(rng.integers(0, len(candidates)))]] = False
    return paid


def _p4_value(paid: list[bool], t: int) -> float:
    ventana = paid[max(0, t - 5):t + 1]
    return sum(1 for p in ventana if p) / len(ventana)


def _d2_value(paid: list[bool], t: int) -> float:
    ventana = paid[max(0, t - 5):t + 1]
    historico = paid[:t + 1]
    rate = sum(1 for p in historico if p) / len(historico)
    esperado = max(1.0, round(len(ventana) * rate))
    return min(sum(1 for p in ventana if p) / esperado, 1.0)


def _case_bias(kind: str, sid: str, t: int, n: int) -> float:
    """Sesgos de forma de los casos fijados (se ven en los drivers, no en el nivel)."""
    if kind == "cash_tension" and t >= max(0, n - 10):
        if sid in ("P1", "P2", "P3"):
            return -0.28
        if sid in ("C1", "C2", "C4"):
            return 0.16
        if sid in ("L1", "L3"):
            return -0.18
    if kind == "deleveraging":
        avance = t / max(1, n - 1)
        if sid in ("D1", "D3"):
            return 0.35 * avance
        if sid == "D5":
            return 0.25 * avance
    # El hundimiento de `cash_drop` ya no se sesga aqui: lo inyecta el choque
    # estrecho de `dip_signal_ids`, calibrado por biseccion contra la
    # profundidad del bache en vez de a ojo.
    return 0.0


def simulate_company(company_id, facts, months, seed) -> CompanySim:
    """Primera pasada: `u`, `u_smooth`, valores crudos, pilares, nivel y techo.

    La biseccion ajusta un desplazamiento comun `delta` a todas las senales
    libres del mes (que es un desplazamiento comun a todos los pilares) hasta
    que `core.level(...) − core.penalty(...)` cae a menos de `BISECTION_TOL`
    puntos del objetivo. Convergencia tipica en 8-12 iteraciones sobre un
    intervalo de ±1,2 en la escala de `u`; el maximo es `BISECTION_MAX_ITER`.

    Si el objetivo cae fuera de lo alcanzable con ese intervalo (pasa cuando el
    prior deja un objetivo por encima de lo que dan todas las senales al maximo)
    se recorta al extremo y se cuenta en `CompanySim.clipped`, que el resumen
    del CLI imprime.

    La biseccion se aplica DESPUES del suavizado: `u_smooth` es afin en `delta`
    porque la EWMA es causal y lineal, asi que lo que cuadra con el objetivo es
    exactamente la serie suavizada con la que se puntua.
    """
    n = len(months)
    rng = rng_for(seed, company_id)
    kind = FIXED_CASES.get(company_id, "random")

    coverage = {
        "invoices": bool(facts["has_invoices"]),
        "debt": bool(facts["has_debt"]),
        "loc": bool(facts["has_lineofcredit"]),
        "ss": bool(facts["has_ss"]),
        "salary": bool(facts["has_salary"]),
        "tax": bool(facts["has_tax"]),
        "intercompany": bool(facts["has_intercompany"]),
        "debt_repayment": bool(facts["has_debt_repayment"]),
        "invest": bool(facts["has_invest"]),
    }
    signal_ids = catalog.available_signals(coverage)
    signals = [catalog.SIGNALS_BY_ID[s] for s in signal_ids]
    signal_weights = catalog.signal_weights_by_pillar(signal_ids)
    avail = catalog.pillar_availability(signal_ids)
    eff = core.effective_weights(avail)
    covered_weight = sum(catalog.PILLAR_WEIGHTS[p] * avail[p] for p in PILLARS)

    cash_quality = "low" if rng.random() < CASH_QUALITY_LOW_P else "ok"
    shape = _fixed_shape(kind, n) if kind != "random" else _random_shape(rng, n)
    target_base, target_dip = target_series(shape, rng, n)
    events = _event_windows(rng, n, coverage, kind)

    ss_paid = _regularity_series(rng, n, events.get("SSMISS", [])) \
        if coverage["ss"] else []
    debt_paid = _regularity_series(rng, n, events.get("DEBTSTOP", [])) \
        if coverage["debt_repayment"] else []
    if kind == "deleveraging" and coverage["debt"]:
        # El caso "desapalancamiento sano" amortiza TODOS los meses: es lo que
        # hace que D2 valga 1 y que la `strength_flag` DELEVERAGING exista.
        debt_paid = [True] * n

    # --- estructura del mes, precomputada (el bucle interno es el caro) ---
    k = len(signals)
    alphas = [catalog.EWMA_ALPHA[s["ewma"]] for s in signals]
    lo_hi = [signal_u_range(s) for s in signals]
    pillar_of = [s["pillar"] for s in signals]
    weight_of = [float(s["weight"]) for s in signals]
    groups: dict[str, list[int]] = {}
    for i, p in enumerate(pillar_of):
        groups.setdefault(p, []).append(i)
    dens = {p: sum(weight_of[i] for i in idxs) for p, idxs in groups.items()}
    lam, tau = catalog.PENALTY["lambda"], catalog.PENALTY["tau"]

    # Nivel propio (constante) + temblor AR(1): ver `DEV_LEVEL_SD`. El temblor
    # se escala a `DEV_WOBBLE_SD` de sd ESTACIONARIA, no de innovacion.
    wobble_sd = DEV_WOBBLE_SD * math.sqrt(1.0 - DEV_AR1 ** 2)

    def _dev(count: int):
        niveles = rng.normal(0.0, DEV_LEVEL_SD, size=count)
        return [
            [float(niveles[j]) + w for w in _ar1(rng, n, DEV_AR1, wobble_sd)]
            for j in range(count)
        ]

    pillar_dev = dict(zip(PILLARS, _dev(len(PILLARS))))
    common_dev = _dev(1)[0]
    signal_dev = _dev(k)

    u_out = [[0.0] * n for _ in range(k)]
    s_out = [[0.0] * n for _ in range(k)]
    prev_s = [None] * k
    idx_l3 = signal_ids.index("L3") if "L3" in signal_ids else None
    idx_d1 = signal_ids.index("D1") if "D1" in signal_ids else None
    sim = CompanySim(
        company_id=company_id,
        group_id=facts["group_id"],
        months=list(months),
        branch=facts["branch"],
        coverage=coverage,
        signal_ids=list(signal_ids),
        eff_weights=eff,
        signal_weights=signal_weights,
        cash_quality=cash_quality,
        events=events,
        covered_weight=covered_weight,
    )

    neg_cash_days: list[float] = []
    loc_use: list = []
    prev_clean = prev_s  # mismo objeto mientras no haya choque que separe los mundos
    abajo, arriba = dip_signal_ids(shape, signal_ids)
    shock_idx = {i for i, sid in enumerate(signal_ids) if sid in set(abajo)}
    counter_idx = {i for i, sid in enumerate(signal_ids) if sid in set(arriba)}
    ventana = shock_window(shape, n) if shock_idx else set()
    target: list[float] = []

    for t in range(n):
        centres = [0.0] * k
        forced: list = [None] * k
        base_p = target_base[t] / 100.0
        for i, sig in enumerate(signals):
            sid = sig["signal_id"]
            p = pillar_of[i]
            centre = (
                base_p
                + PILLAR_SPREAD * (
                    math.sqrt(PILLAR_CORR) * common_dev[t]
                    + math.sqrt(1.0 - PILLAR_CORR) * pillar_dev[p][t]
                )
                + SIGNAL_SPREAD * signal_dev[i][t]
                + _case_bias(kind, sid, t, n)
            )
            centres[i] = centre
            if sid == "P4" and ss_paid:
                forced[i] = core.normalize_anchor(_p4_value(ss_paid, t), sig["anchors"])
            elif sid == "D2" and debt_paid:
                forced[i] = core.normalize_anchor(_d2_value(debt_paid, t), sig["anchors"])
            elif sid == "D6" and kind == "deleveraging":
                # Rampa monotona: el apalancamiento por flujo BAJA todos los
                # meses, que es la otra mitad de DELEVERAGING (ENGINE §4.6 d).
                forced[i] = 0.45 + 0.50 * (t / max(1, n - 1))
            elif sid == "L5" and not coverage["invest"]:
                forced[i] = lo_hi[i][0]
            elif sid == "L3" and t in events.get("NEGCASH", []):
                forced[i] = 0.0
            elif sid == "D1" and t in events.get("LOCFULL", []):
                forced[i] = 0.0

        def achieved(delta: float, bias: float = 0.0, prev=None, contra=False):
            us = [0.0] * k
            ss = [0.0] * k
            previa = prev_s if prev is None else prev
            for i in range(k):
                if forced[i] is not None:
                    u = forced[i]
                else:
                    u = centres[i] + delta
                    if bias and i in shock_idx:
                        u += bias
                    if contra and i in counter_idx:
                        u += DIP_COUNTER_BIAS
                    lo, hi = lo_hi[i]
                    u = lo if u < lo else (hi if u > hi else u)
                us[i] = u
                a = alphas[i]
                ps = previa[i]
                ss[i] = u if (a == 1.0 or ps is None) else a * u + (1.0 - a) * ps
            pil = {}
            for p, idxs in groups.items():
                pil[p] = sum(weight_of[i] * ss[i] for i in idxs) / dens[p]
            lvl = 100.0 * sum(eff[p] * pil[p] for p in pil)
            pen = 100.0 * lam * max(0.0, tau - min(pil.values()))
            return lvl - pen, us, ss, pil

        def resolver(objetivo, evaluar, rango):
            """Biseccion de UNA variable sobre [-rango, rango]."""
            lo_x, hi_x = -rango, rango
            if objetivo <= evaluar(lo_x):
                sim.clipped += 1
                return lo_x
            if objetivo >= evaluar(hi_x):
                sim.clipped += 1
                return hi_x
            x = 0.0
            for _ in range(BISECTION_MAX_ITER):
                x = 0.5 * (lo_x + hi_x)
                f_mid = evaluar(x)
                if abs(f_mid - objetivo) <= BISECTION_TOL:
                    break
                if f_mid < objetivo:
                    lo_x = x
                else:
                    hi_x = x
            return x

        # Dos movimientos distintos, resueltos por separado:
        #
        # 1. El ANCHO. El desplazamiento comun `delta` lleva a todas las
        #    senales al nivel del mes SIN bache. Se resuelve contra el mundo
        #    contrafactual (`prev_clean`, la EWMA como si el choque no hubiera
        #    pasado) para que la resaca del bache no empuje al resto del cuadro
        #    en sentido contrario: eso era lo que disparaba `breadth` a 63 en
        #    mitad de un bache y lo sacaba de la banda de §6.2.
        # 2. El ESTRECHO. Si el mes esta en la ventana del choque, un sesgo
        #    sobre las pocas senales de `shock_idx` -- y solo sobre ellas --
        #    lleva el score a la profundidad del bache, y en los meses de cola
        #    lo devuelve a la trayectoria base. El resto del cuadro se queda
        #    donde estaba, que es lo que `breadth` tiene que ver.
        objetivo = float(np.clip(target_base[t] + target_dip[t], 2.0, 97.0))
        en_bache = bool(target_dip[t])
        delta = resolver(target_base[t],
                         lambda d: achieved(d, 0.0, prev_clean)[0], BISECTION_RANGE)
        if shock_idx:
            prev_clean = achieved(delta, 0.0, prev_clean)[2]
        bias = resolver(objetivo,
                        lambda b: achieved(delta, b, contra=en_bache)[0],
                        DIP_BIAS_RANGE) if t in ventana else 0.0

        _f, us, ss, pil = achieved(delta, bias, contra=en_bache)
        target.append(objetivo)
        for i in range(k):
            u_out[i][t] = us[i]
            s_out[i][t] = ss[i]
            prev_s[i] = ss[i]

        # Historia que leen los techos de ENGINE §5.4. Ni un `cap_code` a mano.
        if idx_l3 is not None:
            neg_cash_days.append(invert_anchor(ss[idx_l3], signals[idx_l3]["anchors"]))
        if idx_d1 is not None:
            loc_use.append(invert_anchor(ss[idx_d1], signals[idx_d1]["anchors"]))

        historia = {
            "neg_cash_days": neg_cash_days,
            "ss_paid": ss_paid[:t + 1],
            "debt_repayment": debt_paid[:t + 1],
            "loc_utilisation": loc_use,
        }
        cap_code, cap_value = core.caps(historia)
        pillars_full = {p: pil.get(p) for p in PILLARS}
        penalty_value = core.penalty(pillars_full, lam, tau)
        level_gross = core.level(pillars_full, eff)
        level_net = level_gross - penalty_value
        sim.pillars.append(pillars_full)
        sim.penalty.append(penalty_value)
        sim.level.append(level_net)
        sim.cap_code.append(cap_code)
        sim.cap.append(cap_value)
        sim.score.append(core.score(level_net, cap_value))
        sim.target.append(target[t])

    # --- valores crudos: inversa exacta de la normalizacion ---
    for i, sig in enumerate(signals):
        sid = sig["signal_id"]
        sim.u[sid] = u_out[i]
        sim.u_smooth[sid] = s_out[i]
        if sig["norm"] == "anchor":
            sim.value[sid] = [invert_anchor(u, sig["anchors"]) for u in u_out[i]]
        else:
            cuts = FROZEN_BREAKPOINTS[sid]
            direccion = sig["direction"]
            qs = [u if direccion == "higher_better" else 1.0 - u for u in u_out[i]]
            sim.value[sid] = [invert_percentile(q, cuts) for q in qs]
        warm = catalog.WARMUP_MONTHS["invoices"] if sig["requires"] == "invoices" \
            else catalog.WARMUP_MONTHS["default"]
        sim.quality_flag[sid] = [
            "warmup" if (t + 1) <= warm
            else ("low_history" if (t + 1) <= 6
                  else ("cash_quality_low" if (cash_quality == "low" and sig["pillar"] == "L")
                        else None))
            for t in range(n)
        ]

    return sim


# --------------------------------------------------------------------------
# Referencia del universo (se congela entre las dos pasadas)
# --------------------------------------------------------------------------


def universe_reference(sims: list[CompanySim]) -> dict[str, float]:
    """`u_ref` por senal = mediana del universo FUERA de warm-up (contrato §2.5).

    Se calcula una sola vez sobre todas las `u_smooth` y se congela: la segunda
    pasada calcula las contribuciones contra estos valores, nunca contra la
    muestra del mes.
    """
    pooled: dict[str, list[float]] = {}
    for sim in sims:
        for sid, serie in sim.u_smooth.items():
            warm = catalog.WARMUP_MONTHS["invoices"] \
                if catalog.SIGNALS_BY_ID[sid]["requires"] == "invoices" \
                else catalog.WARMUP_MONTHS["default"]
            pooled.setdefault(sid, []).extend(serie[warm:])
    return {
        sid: float(np.median(vals)) if vals else core.DEFAULT_U_REF
        for sid, vals in sorted(pooled.items())
    }


# --------------------------------------------------------------------------
# Segunda pasada: contribuciones, trayectoria, regimen, outlook, drivers
# --------------------------------------------------------------------------

LEAD_SIGNALS = ("A2", "D4", "P3", "C2")

#: Meses que ENGINE §6.2 le da al nivel para volver ("en ≤ 2 meses").
SHOCK_CONFIRM_LAG = 2
#: Meses que el choque sigue siendo el episodio vigente a efectos de etiqueta.
#: Uno mas que la ventana de confirmacion, porque la histeresis de §6.2 necesita
#: DOS meses con el mismo candidato para escribir `blip` en la columna.
SHOCK_LABEL_LAG = 3


def _shock_episode(z_series: list, t: int):
    """Tramo de `|z_own| ≥ 2` vigente en `t` o cerrado hace poco (ENGINE §6.2).

    Devuelve `(inicio, fin, meses)` del tramo consecutivo que termina en `t` o
    como mucho `SHOCK_LABEL_LAG` meses antes, o `None` si no hay ninguno. Los
    `meses` son los que §6.2 acota a "1-2 meses": un tramo mas largo no es un
    choque, es un cambio de nivel, y la regla lo descarta sola.
    """
    fin = None
    for s in range(t, max(-1, t - SHOCK_LABEL_LAG - 1), -1):
        z = z_series[s]
        if z is not None and abs(z) >= 2.0:
            fin = s
            break
    if fin is None:
        return None
    inicio = fin
    while inicio > 0:
        z = z_series[inicio - 1]
        if z is None or abs(z) < 2.0:
            break
        inicio -= 1
    return (inicio, fin, fin - inicio + 1)


def _shock_reverted(scores: list, episodio, t: int, window: int = 12) -> bool:
    """`True` si el nivel ya volvio a ±1σ de su mediana ANTES del choque (§6.2).

    La referencia es la mediana previa al choque, no la movil: despues de un
    escalon la mediana movil baja con el score y `z_own` vuelve solo a cero sin
    que nada haya revertido. Y la confirmacion es pegajosa dentro de la ventana
    de §6.2: una vez que el nivel ha vuelto, sigue habiendo vuelto.
    """
    if episodio is None:
        return False
    inicio, fin, _meses = episodio
    if fin >= t or inicio == 0:
        return False
    previos = [float(s) for s in scores[max(0, inicio - window):inicio] if s is not None]
    if len(previos) < 6:
        return False
    med = float(np.median(previos))
    sigma = 1.4826 * float(np.median([abs(s - med) for s in previos]))
    if sigma <= 0.0:
        return False
    return any(
        abs(float(scores[s]) - med) <= sigma
        for s in range(fin + 1, min(t, fin + SHOCK_CONFIRM_LAG) + 1)
    )


def _z_own_signal(serie: list[float], t: int) -> float:
    """z propio de una senal contra su propia historia (para el LeadIndex)."""
    previos = serie[:t]
    if len(previos) < 3:
        return 0.0
    arr = np.asarray(previos, dtype=float)
    sd = float(arr.std(ddof=1))
    if sd == 0.0:
        return 0.0
    return float((serie[t] - arr.mean()) / sd)


def _strength_flags(sim: CompanySim, t: int) -> list[str]:
    """`strength_flags` de ENGINE §4.6, calculadas sobre los valores generados."""
    flags = []
    val, u = sim.value, sim.u_smooth

    if "A1" in val and "C2" in u:
        if val["A1"][t] > 0 and (t < 3 or u["C2"][t] >= u["C2"][t - 3] - 0.02):
            flags.append("GROWTH_NO_DSO")
    if "P1" in val and t >= 5:
        if all(v <= 0.10 for v in val["P1"][t - 5:t + 1]):
            flags.append("PAYS_ON_TIME")
    if "L1" in val and "D1" in val:
        if val["L1"][t] >= 60.0 and val["D1"][t] <= 0.30:
            flags.append("BUFFER_LOW_UTIL")
    if "D2" in val and "D6" in val and t >= 3:
        if val["D2"][t] >= 1.0 and val["D6"][t] < val["D6"][t - 3]:
            flags.append("DELEVERAGING")
    if "L5" in val and val["L5"][t] > 0.0:
        flags.append("SAVINGS")
    return flags


@dataclass
class CompanyDerived:
    """Lo que la segunda pasada guarda en memoria de cada empresa.

    Las filas de `signals.csv` y `drivers.csv` NO se guardan: se generan bajo
    demanda con `signal_rows` / `driver_rows` a partir de `contributions`, que
    es la forma compacta. Son 438.701 y 133.000 filas: materializarlas dos veces
    (CSV y `exports/`) costaria cientos de MB para nada.
    """

    timeline: list[dict] = field(default_factory=list)
    alert_candidates: list[dict] = field(default_factory=list)
    contributions: list[dict] = field(default_factory=list)


def derive_company(sim: CompanySim, u_ref: dict, facts: dict) -> CompanyDerived:
    """Segunda pasada: todo lo que el contrato pide, con `core.py` y nada mas."""
    out = CompanyDerived()
    n = len(sim.months)
    months_hist_total = int(facts["months_hist"])
    scores = sim.score
    prev_regime = "warmup"
    prev_candidate = "warmup"
    prev_contrib: dict[str, float] = {}
    prev_penalty = 0.0
    prev_cap_adj = 0.0
    regimes: list[str] = []
    candidates: list[str] = []

    for t in range(n):
        month = sim.months[t]
        month_index = t + 1
        warmup = month_index <= catalog.WARMUP_MONTHS["default"]

        u_t = {sid: sim.u_smooth[sid][t] for sid in sim.signal_ids}
        desc = core.contributions(
            u_t, u_ref, sim.eff_weights, sim.signal_weights,
            penalty_value=sim.penalty[t], cap_value=sim.cap[t],
        )
        contrib = desc["contrib"]
        decomposition = core.delta_decomposition(
            contrib, prev_contrib, desc["penalty"], prev_penalty,
            desc["cap_adj"], prev_cap_adj,
        ) if t > 0 else None

        delta_1m = scores[t] - scores[t - 1] if t >= 1 else None
        delta_3m = scores[t] - scores[t - 3] if t >= 3 else None
        delta_6m = scores[t] - scores[t - 6] if t >= 6 else None

        slope_3m, _lo3, _hi3 = core.theil_sen(scores[max(0, t - 2):t + 1])
        slope_6m, lo6, hi6 = core.theil_sen(scores[max(0, t - 5):t + 1])
        delta3_series = [
            (scores[i] - scores[i - 3]) if i >= 3 else None for i in range(t + 1)
        ]
        run_v = core.run(delta3_series)
        breadth_v = core.breadth({
            sid: sim.u_smooth[sid][t] - sim.u_smooth[sid][t - 3]
            for sid in sim.signal_ids
        }) if t >= 3 else None
        z = core.z_own(scores[:t + 1])
        z_series = [core.z_own(scores[:i + 1]) for i in range(t + 1)]
        cusum_plus, cusum_minus = core.cusum(
            z_series, catalog.TRAJECTORY["cusum_k"], catalog.TRAJECTORY["cusum_h"])
        shift = core.level_shift(scores[:t + 1])
        h = catalog.TRAJECTORY["cusum_h"]
        p_change = 1.0 - math.exp(-max(cusum_plus, cusum_minus) / h)

        episodio = _shock_episode(z_series, t)
        z_exceed = episodio[2] if episodio else 1
        reverted = _shock_reverted(scores, episodio, t)
        stats = {
            "month_index": month_index,
            "run": run_v,
            "breadth": breadth_v,
            "slope_3m": slope_3m,
            "slope_6m": slope_6m,
            "slope_6m_lo": lo6,
            "slope_6m_hi": hi6,
            "cusum_plus": cusum_plus,
            "cusum_minus": cusum_minus,
            "level_shift": shift,
            "z_own": z,
            "z_exceed_months": max(1, z_exceed),
            "reverted": reverted,
            "score": scores[t],
            "score_max_12m": max(scores[max(0, t - 11):t + 1]),
            "prev_candidate": prev_candidate,
        }
        regime_v, candidate = core.regime(
            stats, prev_regime, h=h, warmup_until=WARMUP_UNTIL)
        prev_regime, prev_candidate = regime_v, candidate
        regimes.append(regime_v)
        candidates.append(candidate)

        lead = [
            _z_own_signal(sim.u_smooth[sid], t)
            for sid in LEAD_SIGNALS if sid in sim.u_smooth
        ]
        lead_index = sum(lead) / len(lead) if lead else 0.0
        ol = core.outlook(
            scores[t], slope_6m, lead_index,
            sigma_resid=catalog.OUTLOOK["sigma_resid"],
            phi=catalog.OUTLOOK["phi"],
            gamma=catalog.OUTLOOK["gamma"],
            z_90=catalog.OUTLOOK["z_90"],
        )
        conf = core.confidence(month_index, sim.covered_weight, sim.cash_quality)
        flags = _strength_flags(sim, t)

        out.timeline.append({
            "company_id": sim.company_id,
            "month": month,
            "month_index": month_index,
            "months_hist": months_hist_total,
            "warmup": warmup,
            "branch": sim.branch,
            **{f"pillar_{p}": sim.pillars[t][p] for p in PILLARS},
            **{f"weight_{p}": sim.eff_weights.get(p, 0.0) for p in PILLARS},
            "level": sim.level[t],
            "penalty": sim.penalty[t],
            "cap_code": sim.cap_code[t],
            "cap": sim.cap[t],
            "score": scores[t],
            "band": core.band(scores[t]),
            "delta_1m": delta_1m,
            "delta_3m": delta_3m,
            "delta_6m": delta_6m,
            "slope_3m": slope_3m,
            "slope_6m": slope_6m,
            "z_own": z,
            "breadth": breadth_v,
            "run": run_v,
            "p_change": p_change,
            "level_shift": shift,
            "regime": regime_v,
            "outlook_3m": ol["h3"],
            "outlook_6m": ol["h6"],
            "outlook_low": ol["low"],
            "outlook_high": ol["high"],
            "outlook_label": ol["label"],
            "confidence": conf,
            "strength_flags": "|".join(flags),
            "base": desc["base"],
        })

        out.contributions.append({
            "month": month, "contrib": dict(contrib), "base": desc["base"],
            "penalty": desc["penalty"], "cap_adj": desc["cap_adj"],
            "delta": decomposition["delta_1m"] if decomposition else None,
        })

        # --- candidatos a alerta (ENGINE §8); el filtro final es core.alerts_policy
        # El techo solo es noticia el mes en que MUERDE (recorta el nivel): un
        # techo activo por encima del nivel no cambia el score de nadie.
        nuevo_cap = _cap_bites(sim, t) and (t == 0 or not _cap_bites(sim, t - 1))
        cambio_regimen = t > 0 and regime_v != regimes[t - 1] \
            and regime_v in ("deteriorating", "improving")
        escalon = shift is not None and abs(shift) >= 8.0 and (
            t == 0 or abs(core.level_shift(scores[:t]) or 0.0) < 8.0)
        if conf >= 0.5 and not warmup:
            if nuevo_cap:
                out.alert_candidates.append(_candidate(
                    sim, facts, t, f"cap_{sim.cap_code[t]}", "down", "urgent",
                    sim.cap_code[t], delta_1m, p_change,
                    _episode_cap(sim, t)))
            if cambio_regimen:
                direction = "down" if regime_v == "deteriorating" else "up"
                severity = "review" if abs(delta_3m or 0.0) >= 5.0 else "watch"
                trigger = min(contrib.items(), key=lambda kv: (kv[1], kv[0]))[0] \
                    if direction == "down" else \
                    max(contrib.items(), key=lambda kv: (kv[1], kv[0]))[0]
                out.alert_candidates.append(_candidate(
                    sim, facts, t, f"regime_{regime_v}", direction, severity,
                    trigger, delta_1m, p_change,
                    _episode_regime(sim, candidates, t, direction)))
            if escalon:
                direction = "down" if shift < 0 else "up"
                trigger = min(contrib.items(), key=lambda kv: (kv[1], kv[0]))[0] \
                    if direction == "down" else \
                    max(contrib.items(), key=lambda kv: (kv[1], kv[0]))[0]
                out.alert_candidates.append(_candidate(
                    sim, facts, t, f"level_shift_{'down' if shift < 0 else 'up'}",
                    direction, "review" if direction == "down" else "watch",
                    trigger, delta_1m, p_change,
                    _episode_level_shift(scores, t)))

        prev_contrib = dict(contrib)
        prev_penalty = desc["penalty"]
        prev_cap_adj = desc["cap_adj"]

    return out


def signal_rows(sim: CompanySim, derived: CompanyDerived, u_ref: dict):
    """Filas de `signals.csv` (contrato §2.5) de una empresa, en orden estable.

    Las 28 senales del catalogo en CADA empresa-mes, en orden de catalogo. La
    que la empresa no puede calcular (una sin facturas no tiene C1) sale con
    `is_available = false` y todo lo que seria un dato inventado VACIO: `u`,
    `u_smooth`, `value` y `u_ref` nulos, nunca 0 (contrato §3: ausencia no es
    cero). `weight` y `contribution` valen 0 -- no aporta nada al score --, de
    modo que `Σ weight` sobre las disponibles sigue valiendo 1.

    Omitirlas haria indistinguibles "no aplica" y "falta el dato" para la UI.
    """
    disponibles = set(sim.signal_ids)
    pesos = {sid: _signal_weight(sim, sid) for sid in sim.signal_ids}
    for t, mes in enumerate(sim.months):
        contrib = derived.contributions[t]["contrib"]
        previo = derived.contributions[t - 1]["contrib"] if t else {}
        for sig in catalog.SIGNALS:
            sid = sig["signal_id"]
            if sid not in disponibles:
                yield {
                    "company_id": sim.company_id,
                    "month": mes,
                    "signal_id": sid,
                    "pillar": sig["pillar"],
                    "value": None,
                    "value_fmt": None,
                    "u": None,
                    "u_smooth": None,
                    "u_ref": None,
                    "weight": 0.0,
                    "contribution": 0.0,
                    "delta_vs_prev": 0.0,
                    "is_available": False,
                    "quality_flag": None,
                }
                continue
            yield {
                "company_id": sim.company_id,
                "month": mes,
                "signal_id": sid,
                "pillar": sig["pillar"],
                "value": sim.value[sid][t],
                "value_fmt": format_value(sid, sim.value[sid][t]),
                "u": sim.u[sid][t],
                "u_smooth": sim.u_smooth[sid][t],
                "u_ref": u_ref.get(sid, core.DEFAULT_U_REF),
                "weight": pesos[sid],
                "contribution": contrib[sid],
                "delta_vs_prev": contrib[sid] - previo[sid] if sid in previo else 0.0,
                "is_available": True,
                "quality_flag": sim.quality_flag[sid][t],
            }


def month_drivers(sim: CompanySim, derived: CompanyDerived, t: int) -> list[dict]:
    """Top-5 por `|contribution|` mas `PENALTY` y `CAP` cuando existen (§2.6).

    Misma funcion para `drivers.csv`, para `exports/` y para la narrativa: el
    ranking se calcula UNA vez y no puede divergir entre salidas.
    """
    mes = sim.months[t]
    desc = derived.contributions[t]
    contrib = desc["contrib"]
    previo = derived.contributions[t - 1]["contrib"] if t else {}
    filas = []
    for rank, (sid, value) in enumerate(
            sorted(contrib.items(), key=lambda kv: (-abs(kv[1]), kv[0]))[:5], start=1):
        d = (value - previo[sid]) if sid in previo else 0.0
        filas.append({
            "company_id": sim.company_id, "month": mes, "rank": rank,
            "signal_id": sid, "pillar": catalog.SIGNALS_BY_ID[sid]["pillar"],
            "contribution": value, "delta_vs_prev": d,
            "value": sim.value[sid][t],
            "value_fmt": format_value(sid, sim.value[sid][t]),
            "direction": _direction(d),
        })
    if desc["penalty"] > 1e-9:
        weakest = min(((p, v) for p, v in sim.pillars[t].items() if v is not None),
                      key=lambda kv: (kv[1], kv[0]))
        d = -(desc["penalty"] - derived.contributions[t - 1]["penalty"]) if t else 0.0
        filas.append({
            "company_id": sim.company_id, "month": mes, "rank": len(filas) + 1,
            "signal_id": "PENALTY", "pillar": weakest[0],
            "contribution": -desc["penalty"], "delta_vs_prev": d,
            "value": weakest[1],
            "value_fmt": (f"pilar mas debil {catalog.PILLAR_NAMES[weakest[0]]} "
                          f"en {_num(weakest[1], 2)}"),
            "direction": _direction(d),
        })
    if desc["cap_adj"] > 1e-9:
        d = -(desc["cap_adj"] - derived.contributions[t - 1]["cap_adj"]) if t else 0.0
        filas.append({
            "company_id": sim.company_id, "month": mes, "rank": len(filas) + 1,
            "signal_id": "CAP", "pillar": None,
            "contribution": -desc["cap_adj"], "delta_vs_prev": d,
            "value": sim.cap[t],
            "value_fmt": (f"techo {sim.cap_code[t]} en {_num(sim.cap[t], 0)} puntos"
                          if sim.cap_code[t] else
                          f"score recortado a {_num(sim.score[t], 0)} puntos"),
            "direction": "worse",
        })
    return filas


def driver_rows(sim: CompanySim, derived: CompanyDerived):
    """Filas de `drivers.csv` de una empresa, mes a mes."""
    for t in range(len(sim.months)):
        yield from month_drivers(sim, derived, t)


def _signal_weight(sim: CompanySim, sid: str) -> float:
    """Peso efectivo de la senal en el score total: pilar x senal renormalizado."""
    pillar = catalog.SIGNALS_BY_ID[sid]["pillar"]
    pesos = sim.signal_weights[pillar]
    den = sum(pesos.values())
    return sim.eff_weights.get(pillar, 0.0) * (pesos[sid] / den)


def _direction(delta: float) -> str:
    if delta > 0.05:
        return "better"
    if delta < -0.05:
        return "worse"
    return "neutral"


# --------------------------------------------------------------------------
# El tramo del que habla cada alerta (`score_before` / `score_after`)
# --------------------------------------------------------------------------
#
# La deteccion va DETRAS del suceso por construccion: la histeresis de dos
# meses de ENGINE §6.2 y la ventana de `level_shift` (§6.1) confirman el
# episodio cuando ya ha pasado. Rellenar el par con `score[M-1]` / `score[M]`
# del mes de deteccion describe el mes de calma posterior, no el suceso. Cada
# causa encuadra por tanto SU episodio, y el mensaje sale del mismo tramo.

#: Por debajo de esto el techo no recorta nada: es ruido de coma flotante.
CAP_BITE_TOL = 1e-9


def _cap_bites(sim: CompanySim, t: int) -> bool:
    """El techo esta activo Y muerde: `score = clip(level, 0, cap) < level` (§5.4)."""
    return sim.cap_code[t] is not None and sim.score[t] < sim.level[t] - CAP_BITE_TOL


def _episode_cap(sim: CompanySim, t: int) -> dict:
    """Techo: el nivel sin techo del mes en que muerde contra el score ya recortado.

    El suceso del que habla la alerta es el recorte, asi que el tramo es
    exactamente `cap_adj = level − score` (§2.3), estrictamente positivo porque
    `_cap_bites` es la condicion de emision. El mes anterior no sirve: cuando el
    nivel venia subiendo, el score capado puede quedar POR ENCIMA del mes previo
    y el par diria "sube" en una alerta que es, por contrato, `down`.
    """
    return {"before": sim.level[t], "after": sim.score[t], "since": sim.months[t]}


def _episode_regime(sim: CompanySim, candidates: list[str], t: int,
                    direction: str) -> dict:
    """Cambio de regimen: del nivel del que venia el episodio al mes de deteccion.

    El regimen cambia en `t` porque el mismo candidato se repite dos meses
    (§6.2), asi que el episodio arranca en el mes anterior al inicio de la racha
    de candidatos. La regla que lo confirma (`run ≤ −3` / `run ≥ 4`) se lee sobre
    `Δ3m`, que compara con `t − 3`: ese mes entra tambien en el tramo aunque la
    racha empiece despues. El ancla es el extremo del episodio antes de la
    deteccion (el maximo si la alerta es `down`, el minimo si es `up`): el nivel
    del que se cayo, o el suelo del que se subio.

    Con eso el movimiento es estricto por construccion: `run ≤ −3` obliga a
    `score[t] < score[t−3]`, y `score[t−3]` esta siempre dentro del tramo.
    """
    scores = sim.score
    inicio = t
    while inicio > 0 and candidates[inicio - 1] == candidates[t]:
        inicio -= 1
    desde = max(0, min(inicio - 1, t - 3))
    tramo = scores[desde:t] or [scores[max(0, t - 1)]]
    ancla = max(tramo) if direction == "down" else min(tramo)
    return {
        "before": ancla,
        "after": scores[t],
        "since": sim.months[desde + tramo.index(ancla)],
    }


def _episode_level_shift(scores: list[float], t: int, recent: int = 3,
                         previous: int = 6) -> dict:
    """Escalon: las MISMAS dos ventanas que el estadistico de ENGINE §6.1.

    `score_after − score_before` es literalmente el `level_shift` que disparo la
    alerta: mediana de los `recent` ultimos meses menos la de los `previous`
    anteriores. El umbral de emision (`|shift| >= 8`) hace el movimiento estricto.
    """
    ultimos = scores[t - recent + 1:t + 1]
    base = scores[t - recent - previous + 1:t - recent + 1]
    return {
        "before": core._median(base),
        "after": core._median(ultimos),
        "since": None,
    }


def _candidate(sim, facts, t, event, direction, severity, trigger, delta_1m,
               p_change, episodio):
    delta = episodio["after"] - episodio["before"]
    if (direction == "down" and delta >= 0.0) or (direction == "up" and delta <= 0.0):
        raise AssertionError(
            f"{sim.company_id} {sim.months[t]} {event}: el tramo del episodio "
            f"({episodio['before']!r} -> {episodio['after']!r}) se mueve {delta:+.6f}, "
            f"al reves de direction={direction!r}. Una alerta no puede contradecir "
            "su propio movimiento (contrato §2.7)."
        )
    return {
        "company_id": sim.company_id,
        "group_id": sim.group_id,
        "cause": event.split("_")[0] if event.startswith("cap") else event,
        "event": event,
        "direction": direction,
        "severity": severity,
        "trigger_signal": trigger,
        "month": sim.months[t],
        "month_index": t,
        "warmup": t + 1 <= catalog.WARMUP_MONTHS["default"],
        "delta_score": delta_1m or 0.0,
        "p_change": max(p_change, 1e-6),
        "exposure": float(facts["exposure"]),
        "score_before": episodio["before"],
        "score_after": episodio["after"],
        "month_before": episodio["since"],
    }


# --------------------------------------------------------------------------
# Alertas: presupuesto, cool-down, evidencia y lead time (ENGINE §8 y §9)
# --------------------------------------------------------------------------


def build_alerts(candidates, sims_by_id, active_by_month) -> list[dict]:
    """Aplica `core.alerts_policy` y anade evidencia, lead time y estado.

    El presupuesto de ENGINE §8 es "≤ 5 % de la cartera al mes", y la cartera de
    un mes son las empresas ACTIVAS ese mes (el universo crece: en 2024-09 hay
    menos de la mitad). Por eso se llama a la politica mes a mes con el tamano
    de ese mes, arrastrando `emitted_history` para que el cool-down de tres
    meses cruce la frontera de mes.
    """
    emitidas: list[dict] = []
    historia: list[tuple] = []
    for mes in sorted({c["month"] for c in candidates}):
        del_mes = [c for c in candidates if c["month"] == mes]
        nuevas = core.alerts_policy(
            del_mes,
            budget_down=catalog.ALERTS["budget_down"],
            budget_up=catalog.ALERTS["budget_up"],
            cooldown_months=catalog.ALERTS["cooldown_months"],
            universe_size=active_by_month.get(mes, len(sims_by_id)),
            emitted_history=historia,
        )
        emitidas.extend(nuevas)
        historia.extend((c["company_id"], c["cause"], c["month"]) for c in nuevas)
    orden = ("stress", "watch", "healthy", "solid")
    rows = []
    for i, c in enumerate(sorted(
            emitidas, key=lambda c: (c["month"], c["company_id"], c["event"]))):
        sim = sims_by_id[c["company_id"]]
        t = c["month_index"]
        banda_detect = core.band(sim.score[t])
        evidente = None
        lead = None
        # ENGINE §9.2: el lead se mide contra el evento evidente dentro del
        # horizonte de seis meses. Mas alla no es anticipacion, es otra cosa.
        for j in range(t + 1, min(len(sim.months), t + 1 + EVIDENCE_HORIZON)):
            peor = orden.index(core.band(sim.score[j])) < orden.index(banda_detect)
            if sim.cap_code[j] is not None or peor or \
                    (sim.score[j] <= sim.score[t] - 10.0):
                evidente, lead = sim.months[j], j - t
                break
        if c["direction"] == "up":
            evidente, lead = None, None
        recuperado = any(
            sim.score[j] >= sim.score[t] + 2.0 for j in range(t + 1, len(sim.months))
        ) if c["direction"] == "down" else True
        rows.append({
            "alert_id": f"ALERT_{i + 1:05d}",
            "company_id": c["company_id"],
            "group_id": c["group_id"],
            "event": c["event"],
            "severity": c["severity"],
            "direction": c["direction"],
            "month_detected": c["month"],
            "month_evident": evidente,
            "lead_time_months": lead,
            "trigger_signal": c["trigger_signal"],
            "score_before": c["score_before"],
            "score_after": c["score_after"],
            "status": "resolved" if recuperado else "open",
            "message": _alert_message(c, sim, t),
        })
    return rows


_EVENT_TEXT = {
    "cap_NEGCASH": "caja agregada en negativo dos meses seguidos",
    "cap_SSMISS": "dos meses sin pagar la Seguridad Social",
    "cap_DEBTSTOP": "dos meses sin amortizar deuda que venia pagando",
    "cap_LOCFULL": "linea de credito practicamente agotada",
    "regime_deteriorating": "deterioro confirmado dos meses seguidos",
    "regime_improving": "mejora confirmada dos meses seguidos",
    "level_shift_down": "escalon a la baja en el nivel del score",
    "level_shift_up": "escalon al alza en el nivel del score",
}


def _alert_message(c, sim, t) -> str:
    """Texto de la alerta, contado SIEMPRE del tramo de `score_before`/`score_after`.

    El verbo sale de `direction` y los numeros del mismo tramo que fijan las dos
    columnas, asi que el texto no puede contradecir a la alerta (§2.7): cada
    causa cuenta lo que mide su episodio (`_episode_cap`, `_episode_regime`,
    `_episode_level_shift`), no el ultimo mes.
    """
    texto = _EVENT_TEXT.get(c["event"], c["event"])
    antes, despues = c["score_before"], c["score_after"]
    puntos = _num(abs(despues - antes), 1)
    verbo = "cae" if c["direction"] == "down" else "sube"
    banda = catalog.BAND_LABELS[core.band(sim.score[t])].lower()
    if c["event"].startswith("cap"):
        detalle = (f"el techo recorta {puntos} puntos, de {_num(antes, 1)} sin techo "
                   f"a {_num(despues, 1)}")
    elif c["event"].startswith("level_shift"):
        detalle = (f"el nivel {verbo} {puntos} puntos: mediana de los 3 ultimos meses "
                   f"{_num(despues, 1)} frente a {_num(antes, 1)} de los 6 anteriores")
    else:
        desde = f" desde {c['month_before']}" if c.get("month_before") else ""
        detalle = (f"el score {verbo} {puntos} puntos{desde}: de {_num(antes, 1)} "
                   f"a {_num(despues, 1)}")
    return f"{texto}: {detalle} ({banda})."


# --------------------------------------------------------------------------
# Grupos (ENGINE §5.7): consolidacion ponderada por op_in_12m_eur
# --------------------------------------------------------------------------


def derive_group(group_id, group_facts, members, timelines, months) -> list[dict]:
    """Serie consolidada de un grupo. Solo tiene score si alguna filial lo tiene.

    Media de los scores de las filiales ponderada por `op_in_12m_eur` (FX
    constante de ENGINE §3.3). `dispersion = max − min`; `weakest_company` es la
    de menor score. El regimen sale de la MISMA `core.regime` sobre la serie
    consolidada, con `breadth` = indice de difusion de las filiales.
    """
    filas = []
    serie: list[float] = []
    meses_con_score: list[str] = []
    prev_regime = "warmup"
    prev_candidate = "warmup"
    por_mes = {
        mes: [(cid, timelines[cid][mes]) for cid in members if mes in timelines[cid]]
        for mes in months
    }
    historial: dict[str, list[float]] = {cid: [] for cid in members}

    for mes in months:
        vivos = por_mes[mes]
        if not vivos:
            continue
        pesos = {cid: max(float(group_facts["weights"].get(cid, 0.0)), 0.0)
                 for cid, _ in vivos}
        total = sum(pesos.values())
        if total <= 0.0:
            pesos = {cid: 1.0 for cid in pesos}
            total = float(len(pesos))
        score = sum(row["score"] * pesos[cid] for cid, row in vivos) / total
        serie.append(score)
        meses_con_score.append(mes)
        for cid, row in vivos:
            historial[cid].append(row["score"])

        t = len(serie) - 1
        delta_1m = serie[t] - serie[t - 1] if t >= 1 else None
        delta_3m = serie[t] - serie[t - 3] if t >= 3 else None
        slope_3m, _l3, _h3 = core.theil_sen(serie[max(0, t - 2):t + 1])
        slope_6m, lo6, hi6 = core.theil_sen(serie[max(0, t - 5):t + 1])
        delta3_series = [
            (serie[i] - serie[i - 3]) if i >= 3 else None for i in range(t + 1)]
        difusion = core.breadth({
            cid: (historial[cid][-1] - historial[cid][-4]) / 100.0
            for cid, _ in vivos if len(historial[cid]) >= 4
        }) if t >= 3 else None
        z_series = [core.z_own(serie[:i + 1]) for i in range(t + 1)]
        cusum_plus, cusum_minus = core.cusum(
            z_series, catalog.TRAJECTORY["cusum_k"], catalog.TRAJECTORY["cusum_h"])
        stats = {
            "month_index": t + 1,
            "run": core.run(delta3_series),
            "breadth": difusion,
            "slope_3m": slope_3m, "slope_6m": slope_6m,
            "slope_6m_lo": lo6, "slope_6m_hi": hi6,
            "cusum_plus": cusum_plus, "cusum_minus": cusum_minus,
            "level_shift": core.level_shift(serie[:t + 1]),
            "z_own": z_series[t],
            "z_exceed_months": 1,
            "reverted": False,
            "score": serie[t],
            "score_max_12m": max(serie[max(0, t - 11):t + 1]),
            "prev_candidate": prev_candidate,
        }
        regime_v, candidate = core.regime(
            stats, prev_regime, h=catalog.TRAJECTORY["cusum_h"],
            warmup_until=WARMUP_UNTIL)
        prev_regime, prev_candidate = regime_v, candidate

        ol = core.outlook(
            serie[t], slope_6m, 0.0,
            sigma_resid=catalog.OUTLOOK["sigma_resid"], phi=catalog.OUTLOOK["phi"],
            gamma=catalog.OUTLOOK["gamma"], z_90=catalog.OUTLOOK["z_90"])
        scores = sorted(((row["score"], cid) for cid, row in vivos))
        confianza = sum(row["confidence"] * pesos[cid] for cid, row in vivos) / total
        dependencias = [
            row["intragroup"] for _cid, row in vivos if row["intragroup"] is not None]

        filas.append({
            "group_id": group_id,
            "month": mes,
            "score": score,
            "band": core.band(score),
            "regime": regime_v,
            "delta_1m": delta_1m,
            "delta_3m": delta_3m,
            "outlook_6m": ol["h6"],
            "outlook_low": ol["low"],
            "outlook_high": ol["high"],
            "confidence": confianza,
            "n_companies_scored": len(vivos),
            "dispersion": scores[-1][0] - scores[0][0],
            "weakest_company": scores[0][1],
            "weakest_score": scores[0][0],
            "strongest_company": scores[-1][1],
            "intragroup_dependency_max": max(dependencias) if dependencias else None,
        })
    return filas
