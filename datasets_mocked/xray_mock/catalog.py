"""Catalogo congelado de las 28 senales del motor X-Ray.

Unica fuente de verdad para pesos, anclas, direccion y cobertura. Transcribe las
tablas de `docs/alfonso/ENGINE-EMBAT.md` §4.1-§4.5 y el extracto de
`params/v1.yaml` de §5.8. `core.py` no conoce ningun numero de este fichero: los
recibe como argumento.

Si el motor real cambia pesos o anclas, se cambian AQUI y en ningun otro sitio
(`manifest.json` guarda `params_version`).
"""

from __future__ import annotations

PARAMS_VERSION = "v1"

#: Ventana del universo de referencia (ENGINE §5.8).
WINDOW = {"start": "2024-09", "end": "2026-08"}

#: Warm-up en meses (ENGINE §5.8): general y el especifico de senales de factura.
WARMUP_MONTHS = {"default": 3, "invoices": 6}

#: Winsorizacion del universo de referencia (ENGINE §5.8).
WINSOR = {"low": 0.01, "high": 0.99, "scope": "month"}

#: Peso de cada pilar sobre 100 (ENGINE §4 y §5.8).
PILLAR_WEIGHTS = {"L": 25, "P": 20, "C": 15, "D": 20, "A": 20}

#: Nombre legible de cada pilar.
PILLAR_NAMES = {
    "L": "Liquidez",
    "P": "Disciplina de pago propia",
    "C": "Cobros y clientes",
    "D": "Deuda y coste de financiacion",
    "A": "Actividad y estabilidad",
}

#: Penalizacion del pilar mas debil (ENGINE §5.3 y §5.8).
PENALTY = {"lambda": 0.5, "tau": 0.45}

#: Techos por eventos duros (ENGINE §5.4 y §5.8).
CAPS = {"NEGCASH": 40, "SSMISS": 45, "DEBTSTOP": 50, "LOCFULL": 60}

#: Vigencia de cada techo en meses despues de dejar de cumplirse la condicion
#: (ENGINE §5.4). `NEGCASH` y `LOCFULL` son "mientras persista"; `NEGCASH` anade
#: un mes de cola, `SSMISS` y `DEBTSTOP` duran dos meses.
CAP_PERSISTENCE_MONTHS = {"NEGCASH": 2, "SSMISS": 2, "DEBTSTOP": 2, "LOCFULL": 1}

#: Bandas del score (ENGINE §5.5): (nombre, minimo inclusive, maximo exclusivo).
BANDS = (
    ("solid", 80.0, None),
    ("healthy", 60.0, 80.0),
    ("watch", 40.0, 60.0),
    ("stress", None, 40.0),
)

#: Lectura de cada banda (ENGINE §5.5).
BAND_LABELS = {
    "solid": "Excepcionalmente solida",
    "healthy": "Sana",
    "watch": "Vigilar",
    "stress": "Tension",
}

#: Prior de calibracion de la distribucion de scores (ENGINE §5.5 y §5.8).
CALIBRATION = {"support": [30, 92], "mean": 62, "sd": 13}

#: Alpha de la EWMA de suavizado (ENGINE §5.1 y §5.8): flujo 0,5, stock 1,0.
EWMA_ALPHA = {"flow": 0.5, "stock": 1.0}

#: Parametros de trayectoria (ENGINE §6.1).
TRAJECTORY = {
    "slope_windows": [3, 6],
    "theilsen_alpha": 0.90,
    "z_window": 12,
    "mad_scale": 1.4826,
    "breadth_flat": 0.02,
    "cusum_k": 0.5,
    "cusum_h": 4.0,
    "bocpd_hazard": 1.0 / 12.0,
}

#: Parametros del outlook (ENGINE §6.3). `gamma` y `sigma_resid` no los fija
#: ENGINE (se calibran contra el motor real): ver `core.outlook`.
OUTLOOK = {"phi": 0.85, "horizons": [3, 6], "z_90": 1.28, "gamma": 3.0, "sigma_resid": 3.0}

#: Politica de alertas (ENGINE §8).
ALERTS = {
    "budget_down": 0.05,
    "budget_up": 0.02,
    "cooldown_months": 3,
    "enter_z": 2.0,
    "exit_z": 1.0,
    "level_shift_trigger": -8.0,
    "severities": ("watch", "review", "urgent"),
}

#: Dominio cerrado de `regime` (ENGINE §6.2 mas los dos estados operativos).
REGIMES = (
    "warmup",
    "stable",
    "improving",
    "deteriorating",
    "blip",
    "shock_pending",
    "recovering",
)

#: Las 28 senales que puntuan, en el orden de ENGINE §4.
#:
#: Campos: `signal_id`, `pillar`, `name`, `unit`, `direction`, `weight` (dentro
#: del pilar, §5.8), `norm`, `anchors` (pares [valor, u] si `norm == "anchor"`),
#: `window`, `ewma` ("flow" | "stock", §5.1) y `requires` (que cobertura hace
#: falta para calcularla, o None si siempre esta).
SIGNALS = (
    # --- Pilar L - Liquidez (peso 25), ENGINE §4.1 -------------------------
    {
        "signal_id": "L1",
        "pillar": "L",
        "name": "Dias de colchon de caja",
        "unit": "dias",
        "direction": "higher_better",
        "weight": 30,
        "norm": "anchor",
        "anchors": [[0, 0.0], [10, 0.3], [27, 0.6], [60, 0.9], [120, 1.0]],
        "window": "3m",
        "ewma": "flow",
        "requires": None,
    },
    {
        "signal_id": "L2",
        "pillar": "L",
        "name": "Minimo de caja sobre salidas",
        "unit": "ratio",
        "direction": "higher_better",
        "weight": 20,
        "norm": "percentile",
        "anchors": None,
        "window": "1m+3m",
        "ewma": "flow",
        "requires": None,
    },
    {
        "signal_id": "L3",
        "pillar": "L",
        "name": "Dias en negativo",
        "unit": "dias",
        "direction": "lower_better",
        "weight": 25,
        # Tramos de §4.1 (0 -> 1; 1-3 -> 0,6; 4-9 -> 0,3; >= 10 -> 0) escritos
        # como mesetas: cada rango de la tabla es un tramo plano.
        "norm": "anchor",
        "anchors": [[0, 1.0], [1, 0.6], [3, 0.6], [4, 0.3], [9, 0.3], [10, 0.0]],
        "window": "3m",
        "ewma": "stock",
        "requires": None,
    },
    {
        "signal_id": "L4",
        "pillar": "L",
        "name": "Meses de runway",
        "unit": "meses",
        "direction": "higher_better",
        "weight": 15,
        "norm": "anchor",
        "anchors": [[0, 0.0], [0.5, 0.25], [1, 0.45], [3, 0.8], [6, 1.0]],
        "window": "3m",
        "ewma": "stock",
        "requires": None,
    },
    {
        "signal_id": "L5",
        "pillar": "L",
        "name": "Colchon invertido",
        "unit": "ratio",
        "direction": "higher_better",
        "weight": 10,
        "norm": "anchor",
        "anchors": [[0, 0.5], [1, 1.0]],
        "window": "12m",
        "ewma": "stock",
        "requires": None,
    },
    # --- Pilar P - Disciplina de pago propia (peso 20), ENGINE §4.2 --------
    {
        "signal_id": "P1",
        "pillar": "P",
        "name": "Facturas propias pagadas tarde",
        "unit": "fraccion",
        "direction": "lower_better",
        "weight": 30,
        "norm": "anchor",
        "anchors": [[0, 1.0], [0.25, 0.7], [0.5, 0.4], [0.75, 0.15], [1, 0.0]],
        "window": "3m",
        "ewma": "stock",
        "requires": "invoices",
    },
    {
        "signal_id": "P2",
        "pillar": "P",
        "name": "Retraso propio ponderado",
        "unit": "dias",
        "direction": "lower_better",
        "weight": 20,
        "norm": "anchor",
        "anchors": [[0, 1.0], [7, 0.8], [15, 0.6], [30, 0.3], [60, 0.0]],
        "window": "3m",
        "ewma": "stock",
        "requires": "invoices",
    },
    {
        "signal_id": "P3",
        "pillar": "P",
        "name": "Deuda comercial vencida sobre recibido",
        "unit": "ratio",
        "direction": "lower_better",
        "weight": 15,
        "norm": "percentile",
        "anchors": None,
        "window": "stock+3m",
        "ewma": "stock",
        "requires": "invoices",
    },
    {
        "signal_id": "P4",
        "pillar": "P",
        "name": "Regularidad de Seguridad Social",
        "unit": "fraccion",
        "direction": "higher_better",
        "weight": 15,
        "norm": "anchor",
        "anchors": [[0.5, 0.0], [0.67, 0.4], [0.83, 0.7], [1, 1.0]],
        "window": "6m",
        "ewma": "stock",
        "requires": "ss",
    },
    {
        "signal_id": "P5",
        "pillar": "P",
        "name": "Regularidad de impuestos",
        "unit": "fraccion",
        "direction": "higher_better",
        "weight": 10,
        # §4.2 da "< 0,5 -> 0" como escalon; se resuelve con el tramo lineal
        # 0 -> 0 .. 0,5 -> 0,3 para que la normalizacion siga siendo continua.
        "norm": "anchor",
        "anchors": [[0, 0.0], [0.5, 0.3], [0.75, 0.6], [1, 1.0]],
        "window": "12m",
        "ewma": "stock",
        "requires": "tax",
    },
    {
        "signal_id": "P6",
        "pillar": "P",
        "name": "Regularidad de nomina",
        "unit": "fraccion",
        "direction": "higher_better",
        "weight": 10,
        "norm": "anchor",
        "anchors": [[0, 0.0], [0.5, 0.3], [0.75, 0.6], [0.9, 1.0]],
        "window": "6m",
        "ewma": "stock",
        "requires": "salary",
    },
    # --- Pilar C - Cobros y clientes (peso 15), ENGINE §4.3 ---------------
    {
        "signal_id": "C1",
        "pillar": "C",
        "name": "Facturas de cliente cobradas tarde",
        "unit": "fraccion",
        "direction": "lower_better",
        "weight": 25,
        "norm": "anchor",
        "anchors": [[0, 1.0], [0.25, 0.7], [0.5, 0.4], [0.75, 0.15], [1, 0.0]],
        "window": "3m",
        "ewma": "stock",
        "requires": "invoices",
    },
    {
        "signal_id": "C2",
        "pillar": "C",
        "name": "Mora de clientes ponderada",
        "unit": "dias",
        "direction": "lower_better",
        "weight": 15,
        "norm": "anchor",
        "anchors": [[0, 1.0], [10, 0.8], [20, 0.6], [40, 0.3], [80, 0.0]],
        "window": "3m",
        "ewma": "stock",
        "requires": "invoices",
    },
    {
        "signal_id": "C3",
        "pillar": "C",
        "name": "Cartera vencida sobre emitido",
        "unit": "ratio",
        "direction": "lower_better",
        "weight": 20,
        "norm": "percentile",
        "anchors": None,
        "window": "stock+3m",
        "ewma": "stock",
        "requires": "invoices",
    },
    {
        "signal_id": "C4",
        "pillar": "C",
        "name": "Ratio de cobro",
        "unit": "ratio",
        "direction": "higher_better",
        "weight": 15,
        "norm": "anchor",
        "anchors": [[0.6, 0.0], [0.85, 0.5], [1, 0.8], [1.1, 1.0]],
        "window": "3m",
        "ewma": "flow",
        "requires": "invoices",
    },
    {
        "signal_id": "C5",
        "pillar": "C",
        "name": "Diversificacion de clientes",
        "unit": "indice",
        "direction": "higher_better",
        "weight": 15,
        "norm": "percentile",
        "anchors": None,
        "window": "12m",
        "ewma": "stock",
        "requires": "invoices",
    },
    {
        "signal_id": "C6",
        "pillar": "C",
        "name": "Rotacion de clientes relativa",
        "unit": "indice",
        "direction": "lower_better",
        "weight": 10,
        "norm": "percentile",
        "anchors": None,
        "window": "24m",
        "ewma": "stock",
        "requires": "invoices",
    },
    # --- Pilar D - Deuda y coste de financiacion (peso 20), ENGINE §4.4 ---
    {
        "signal_id": "D1",
        "pillar": "D",
        "name": "Utilizacion de lineas",
        "unit": "fraccion",
        "direction": "lower_better",
        "weight": 25,
        "norm": "anchor",
        "anchors": [[0, 1.0], [0.3, 0.9], [0.6, 0.6], [0.9, 0.2], [1, 0.0]],
        "window": "foto+3m",
        "ewma": "stock",
        "requires": "loc",
    },
    {
        "signal_id": "D2",
        "pillar": "D",
        "name": "Regularidad de amortizacion",
        "unit": "ratio",
        "direction": "higher_better",
        "weight": 25,
        "norm": "anchor",
        "anchors": [[0, 0.0], [0.5, 0.2], [0.8, 0.6], [1, 1.0]],
        "window": "6m/12m",
        "ewma": "stock",
        "requires": "debt",
    },
    {
        "signal_id": "D3",
        "pillar": "D",
        "name": "Servicio de deuda sobre cobros",
        "unit": "ratio",
        "direction": "lower_better",
        "weight": 20,
        "norm": "anchor",
        "anchors": [[0, 1.0], [0.1, 0.8], [0.25, 0.5], [0.5, 0.2], [1, 0.0]],
        "window": "3m",
        "ewma": "stock",
        "requires": "debt",
    },
    {
        "signal_id": "D4",
        "pillar": "D",
        "name": "Peso de comisiones e intereses",
        "unit": "ratio",
        "direction": "lower_better",
        "weight": 15,
        "norm": "percentile",
        "anchors": None,
        "window": "3m",
        "ewma": "stock",
        "requires": None,
    },
    {
        "signal_id": "D5",
        "pillar": "D",
        "name": "Deuda no bancaria",
        "unit": "fraccion",
        "direction": "lower_better",
        "weight": 10,
        "norm": "anchor",
        "anchors": [[0, 1.0], [0.25, 0.6], [0.5, 0.3], [0.75, 0.0]],
        "window": "foto",
        "ewma": "stock",
        "requires": "debt",
    },
    {
        "signal_id": "D6",
        "pillar": "D",
        "name": "Apalancamiento por flujo",
        "unit": "ratio",
        "direction": "lower_better",
        "weight": 5,
        "norm": "percentile",
        "anchors": None,
        "window": "12m",
        "ewma": "stock",
        "requires": "debt",
    },
    # --- Pilar A - Actividad y estabilidad (peso 20), ENGINE §4.5 ---------
    {
        "signal_id": "A1",
        "pillar": "A",
        "name": "Crecimiento de cobros",
        "unit": "variacion",
        "direction": "higher_better",
        "weight": 25,
        "norm": "percentile",
        "anchors": None,
        "window": "3m/12m",
        "ewma": "flow",
        "requires": None,
    },
    {
        "signal_id": "A2",
        "pillar": "A",
        "name": "Volatilidad de cobros",
        "unit": "cv",
        "direction": "lower_better",
        "weight": 25,
        "norm": "percentile",
        "anchors": None,
        "window": "3m",
        "ewma": "flow",
        "requires": None,
    },
    {
        "signal_id": "A3",
        "pillar": "A",
        "name": "Flujo operativo neto",
        "unit": "ratio",
        "direction": "higher_better",
        "weight": 20,
        "norm": "anchor",
        "anchors": [[-0.3, 0.0], [-0.1, 0.35], [0, 0.5], [0.1, 0.7], [0.3, 1.0]],
        "window": "3m",
        "ewma": "flow",
        "requires": None,
    },
    {
        "signal_id": "A4",
        "pillar": "A",
        "name": "Tendencia de actividad",
        "unit": "ratio",
        "direction": "higher_better",
        "weight": 10,
        "norm": "percentile",
        "anchors": None,
        "window": "3m/12m",
        "ewma": "flow",
        "requires": None,
    },
    {
        "signal_id": "A5",
        "pillar": "A",
        "name": "Dependencia intragrupo",
        "unit": "fraccion",
        "direction": "lower_better",
        "weight": 10,
        "norm": "anchor",
        "anchors": [[0, 1.0], [0.2, 0.7], [0.5, 0.3], [0.8, 0.0]],
        "window": "6m",
        "ewma": "stock",
        "requires": "intercompany",
    },
)

#: A6 `unclassified_share` (ENGINE §4.5): NO puntua (peso 0). Se mantiene fuera
#: de `SIGNALS` y alimenta `confidence` como `quality_flag`.
QUALITY_SIGNALS = (
    {
        "signal_id": "A6",
        "pillar": "A",
        "name": "Movimientos sin clasificar",
        "unit": "fraccion",
        "direction": "lower_better",
        "weight": 0,
        "norm": "percentile",
        "anchors": None,
        "window": "3m",
        "ewma": "stock",
        "requires": None,
        "scores": False,
    },
)

#: Condiciones de `strength_flags` (ENGINE §4.6). No suman puntos: alimentan el
#: driver "por que es solida".
STRENGTH_FLAGS = (
    "growth_without_collection_stress",   # (a) A1 > 0 con C2 plano o bajando
    "pays_on_time",                       # (b) P1 <= 0,1 sostenido 6m
    "deep_buffer_low_utilisation",        # (c) L1 >= 60 dias con D1 <= 0,3
    "debt_serviced_and_deleveraging",     # (d) D2 >= 1 y D6 bajando
    "invested_surplus",                   # (e) L5 > 0
)

SIGNALS_BY_ID = {s["signal_id"]: s for s in SIGNALS}

#: Ramas de cobertura (ENGINE §4.7). `effective_weight` es la tabla del
#: documento (redondeada alli); el calculo exacto lo hace
#: `core.effective_weights` con la regla `w_k^eff = w_k·avail_k / Σ w_j·avail_j`.
COVERAGE_BRANCHES = {
    "full": {
        "pillars": ("L", "P", "C", "D", "A"),
        "effective_weight": {"L": 25, "P": 20, "C": 15, "D": 20, "A": 20},
        "confidence_max": 1.0,
        "coverage": {
            "invoices": True, "debt": True, "loc": True,
            "ss": True, "salary": True, "tax": True, "intercompany": True,
        },
    },
    "no_debt": {
        "pillars": ("L", "P", "C", "D", "A"),  # D solo con D4
        "effective_weight": {"L": 28, "P": 22, "C": 17, "D": 5, "A": 28},
        "confidence_max": 0.9,
        "coverage": {
            "invoices": True, "debt": False, "loc": False,
            "ss": True, "salary": True, "tax": True, "intercompany": True,
        },
    },
    "no_invoices": {
        "pillars": ("L", "P", "D", "A"),  # P solo con P4-P6
        "effective_weight": {"L": 32, "P": 13, "D": 27, "A": 28},
        "confidence_max": 0.75,
        "coverage": {
            "invoices": False, "debt": True, "loc": True,
            "ss": True, "salary": True, "tax": True, "intercompany": True,
        },
    },
    "no_invoices_no_debt": {
        "pillars": ("L", "P", "A"),
        "effective_weight": {"L": 42, "P": 18, "A": 40},
        "confidence_max": 0.65,
        "coverage": {
            "invoices": False, "debt": False, "loc": False,
            "ss": True, "salary": True, "tax": True, "intercompany": True,
        },
    },
}


def pillar_signal_weights(pillar, signal_ids=None):
    """Pesos dentro de un pilar (ENGINE §5.8), opcionalmente filtrados.

    `signal_ids`: iterable de ids disponibles; si es None devuelve el pilar
    completo. La renormalizacion la hace `core.pillar_score`.
    """
    allowed = None if signal_ids is None else set(signal_ids)
    return {
        s["signal_id"]: s["weight"]
        for s in SIGNALS
        if s["pillar"] == pillar and (allowed is None or s["signal_id"] in allowed)
    }


def available_signals(coverage):
    """Ids de senal calculables con la cobertura real de una empresa.

    `coverage`: dict con claves `invoices`, `debt`, `loc`, `ss`, `salary`,
    `tax`, `intercompany` (ausente = False). Una senal esta disponible si su
    `requires` es None o si esa cobertura es verdadera (ENGINE §4.7).
    """
    return [
        s["signal_id"]
        for s in SIGNALS
        if s["requires"] is None or bool(coverage.get(s["requires"], False))
    ]


def signals_for_branch(branch):
    """Ids de senal disponibles en una rama de cobertura (ENGINE §4.7).

    Asume que las categorias opcionales de la rama (`ss`, `salary`, `tax`,
    `loc`, `intercompany`) estan presentes: para la verdad empresa a empresa
    se usa `available_signals(coverage)`.
    """
    if branch not in COVERAGE_BRANCHES:
        raise KeyError(f"rama de cobertura desconocida: {branch!r}")
    return available_signals(COVERAGE_BRANCHES[branch]["coverage"])


def signal_weights_by_pillar(signal_ids):
    """Agrupa `{pilar: {signal_id: peso}}` para los ids dados.

    Es la forma que consumen `core.pillar_score` y `core.contributions`.
    """
    allowed = set(signal_ids)
    out = {}
    for s in SIGNALS:
        if s["signal_id"] in allowed:
            out.setdefault(s["pillar"], {})[s["signal_id"]] = s["weight"]
    return out


def pillar_availability(signal_ids):
    """`avail_k` = peso de senal disponible / peso total del pilar (ENGINE §4.7)."""
    allowed = set(signal_ids)
    out = {}
    for pillar in PILLAR_WEIGHTS:
        total = sum(s["weight"] for s in SIGNALS if s["pillar"] == pillar)
        have = sum(
            s["weight"] for s in SIGNALS
            if s["pillar"] == pillar and s["signal_id"] in allowed
        )
        out[pillar] = 0.0 if total == 0 else have / total
    return out
