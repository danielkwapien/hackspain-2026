"""Todos los numeros que se tocan, en un solo fichero.

Si hay que ajustar el motor a las tres de la manana, se ajusta aqui. Ningun
otro modulo del paquete deberia tener una constante suelta: si aparece una,
su sitio es este.

Cada bloque dice que hace y que pasa si se mueve.
"""

from __future__ import annotations

# --------------------------------------------------------------- pilares
# Peso de cada familia en el nivel. Suman 100.
PILLAR_WEIGHTS: dict[str, float] = {
    "liquidity": 0.25,
    "payment": 0.20,
    "collections": 0.15,
    "debt": 0.20,
    "activity": 0.20,
}

PILLAR_LABELS: dict[str, str] = {
    "liquidity": "Liquidez y colchon de caja",
    "payment": "Disciplina de pago propia",
    "collections": "Cobros y calidad de cartera",
    "debt": "Deuda y coste de financiacion",
    "activity": "Actividad y estabilidad",
}

# ------------------------------------------------- mezcla dentro del pilar
# Como se combinan las senales de una misma familia. Ver registry.BLENDS.
# `power` con p < 1 castiga los perfiles desiguales: una senal muy mala pesa
# mas que la media aritmetica. p = 1 es la media de toda la vida.
FAMILY_BLEND: dict[str, tuple[str, dict]] = {
    "liquidity": ("power", {"p": 0.5}),      # la caja no se compensa con lo demas
    "payment": ("arithmetic", {}),
    "collections": ("arithmetic", {}),
    "debt": ("power", {"p": 0.7}),           # una linea al limite no se diluye
    "activity": ("arithmetic", {}),
}

# --------------------------------------------------- mezcla entre pilares
COMBINE_BLEND: tuple[str, dict] = ("weighted_mean", {})

# Penalizacion del eslabon mas debil: si el peor pilar baja de TAU, el nivel
# se descuenta LAMBDA por cada punto por debajo. Es lo que impide que un
# problema serio de caja se compense con una facturacion impecable.
PENALTY_LAMBDA = 0.5
PENALTY_TAU = 45.0

# ------------------------------------------------------- encogimiento
# Lo que no se observa se asume MEDIO, no excelente. Se aplica dentro del
# pilar (senales que faltan) y entre pilares (familias que faltan).
NEUTRAL = 50.0
SHRINK_EXPONENT = 0.5                        # 0.5 = raiz cuadrada de la cobertura

# ------------------------------------------------------------ suavizado
# El mes crudo es ruido. Se suaviza el PILAR, no el score final, para que la
# descomposicion en drivers siga cuadrando exactamente.
EWMA_ALPHA = 0.5

# ----------------------------------------------------------- modificadores
# Por debajo de esto un ajuste no se aplica ni aparece en la narrativa:
# "suma 0 puntos" es ruido que resta credibilidad a la explicacion.
MODIFIER_MIN_EFFECT = 0.5

# ------------------------------------------------- perspectivas estrategicas
# Las cinco senales de `signals/` como ajustes acotados sobre el nivel. Cada
# una escala por su propia `confidence`. `current_health` no aparece: es el
# nivel republicado y usarlo como ajuste seria sumar el score a si mismo.
#
# `cohort_safe: False` significa que la senal mira a los demas grupos del
# fichero. Activarla rompe `tests/test_isolation.py`, que es la garantia de
# que el test oculto devuelve el mismo numero con menos grupos.
STRATEGIC_MODIFIERS: dict[str, dict] = {
    "trajectory_pressure": {
        "bound": 8.0, "enabled": True, "cohort_safe": True,
        "label": "Trayectoria y presion a corto",
    },
    "network_counterparty_health": {
        "bound": 5.0, "enabled": True, "cohort_safe": True,
        "label": "Salud de la red de cobro",
    },
    "sector_benchmark_rank": {
        "bound": 4.0, "enabled": False, "cohort_safe": False,
        "label": "Posicion entre pares",
    },
    "data_driven_peer_learning": {
        "bound": 6.0, "enabled": False, "cohort_safe": False,
        "label": "Trayectorias comparables de la cartera",
    },
}

# ---------------------------------------------------------------- techos
# Eventos duros y absolutos: no dependen de la cohorte cargada, asi que son
# seguros cuando el fichero trae menos grupos.
CAPS_ENABLED = True
CAPS: dict[str, dict] = {
    "CAP_NEGCASH": {
        "ceiling": 40.0,
        "label": "Caja negativa dos meses seguidos",
    },
    "CAP_LOCFULL": {
        "ceiling": 60.0,
        "label": "Linea de credito practicamente agotada",
        "threshold": 0.95,
    },
}

# ------------------------------------------------------------- umbrales
MIN_MONTHS_FOR_SCORE = 3
MIN_MONTHS_FOR_REGIME = 7
MIN_COVERAGE = 0.50

BANDS: tuple[tuple[float, str], ...] = (
    (80.0, "solid"),
    (60.0, "healthy"),
    (40.0, "watch"),
)
BAND_FLOOR = "stress"

# ------------------------------------------------------- alerta de liquidez
# Deliberadamente SEPARADA del score. El score es un juicio estructurado; el
# colchon de caja es la senal que de verdad anticipa. Umbrales absolutos.
BUFFER_BANDS: tuple[tuple[float, str], ...] = (
    (10.0, "critical"),
    (27.0, "watch"),                         # 27 dias = mediana de pyme [JPMC]
    (60.0, "adequate"),
)
BUFFER_FLOOR = "strong"

# ------------------------------------------------------------- confianza
CONFIDENCE_BY_HISTORY: tuple[tuple[int, float], ...] = (
    (6, 0.45),
    (12, 0.75),
    (18, 0.90),
)
CONFIDENCE_FULL = 1.0
