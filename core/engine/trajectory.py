"""Direccion y regimen a partir de la serie mensual ya calculada.

Solo mira el pasado: es exactamente la informacion disponible en ese corte.

**El regimen se decide por MAGNITUD, no por racha.** La version anterior exigia
tres o cuatro meses consecutivos en la misma direccion, asi que un solo mes
bueno rompia la racha y la fila caia a `stable`: 173 filas etiquetadas `stable`
habian perdido mas de diez puntos en seis meses. El detector robusto es
`level_shift` —mediana de los tres ultimos meses contra la de los seis
anteriores—, que un mes suelto no mueve, con histeresis de dos meses para que
tampoco lo mueva un mes malo.

**Regimen y direccion no pueden contradecirse.** Cuando el regimen ya ha
decidido que la entidad baja o sube, la flecha que acompaña al numero dice lo
mismo; solo cuando el regimen no se moja (`stable`, `blip`, `shock_pending`)
la direccion la fija la pendiente corta. `contradicts()` es la regla, y la
publicacion la comprueba fila a fila.
"""

from __future__ import annotations

from . import config

REGIMES: tuple[str, ...] = (
    "deteriorating", "improving", "blip", "shock_pending", "recovering", "stable",
)
"""Los seis regimenes publicables. `warmup` no es uno: es no haber empezado."""

WARMUP = "warmup"

#: Que direcciones admite cada regimen. `blip` y `shock_pending` van del propio
#: salto, asi que la direccion los completa en vez de contradecirlos; `warmup`
#: todavia no afirma nada. Los demas ya han decidido y la flecha les sigue.
_ALLOWED_DIRECTIONS: dict[str, frozenset[str]] = {
    "deteriorating": frozenset({"deteriorating"}),
    "improving": frozenset({"improving"}),
    "recovering": frozenset({"improving"}),
    "stable": frozenset({"stable"}),
}


def contradicts(regime: object, direction: object) -> bool:
    """`True` si regimen y direccion dicen cosas opuestas. Nunca se publica.

    `stable` junto a `deteriorating` cuenta como contradiccion: si el regimen
    dice que no se mueve, la flecha no puede decir que baja. Se publicaban 240
    filas asi.
    """
    allowed = _ALLOWED_DIRECTIONS.get(str(regime))
    return allowed is not None and str(direction) not in allowed


def _slope(values: list[float], window: int) -> float | None:
    tail = values[-window:]
    if len(tail) < max(2, window - 1):
        return None
    n = len(tail)
    mean_x = (n - 1) / 2
    mean_y = sum(tail) / n
    denom = sum((i - mean_x) ** 2 for i in range(n))
    if denom == 0:
        return None
    return round(sum((i - mean_x) * (y - mean_y) for i, y in enumerate(tail)) / denom, 3)


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2.0


def _level_shift(values: list[float]) -> float | None:
    """Mediana de los 3 ultimos meses menos la de los 6 anteriores."""
    if len(values) < 9:
        return None
    return round(_median(values[-3:]) - _median(values[-9:-3]), 2)


def _z_own(values: list[float]) -> float | None:
    """Distancia del ultimo mes a su propio nivel previo, en MAD de la entidad.

    Sin cohorte: la entidad se compara consigo misma. La MAD aguanta el mes
    atipico que precisamente estamos midiendo, cosa que la desviacion tipica no.
    """
    if len(values) < 7:
        return None
    window = values[-7:-1]
    centre = _median(window)
    mad = _median([abs(value - centre) for value in window])
    # Con seis meses casi identicos la MAD tiende a 0 y cualquier salto saldria
    # infinito. Por debajo de medio punto de dispersion propia no pretendemos
    # resolver el ruido de la entidad: ese es el suelo de la escala.
    scale = 1.4826 * max(mad, config.REGIME_MAD_FLOOR)
    return round((values[-1] - centre) / scale, 2)


def _shift_series(values: list[float]) -> list[float | None]:
    """`level_shift` mes a mes, calculado una sola vez.

    Las tres reglas que lo consultan lo recorrian cada una por su cuenta, y con
    24 meses por entidad eso multiplicaba por tres el coste de la publicacion.
    """
    return [_level_shift(values[: index + 1]) for index in range(len(values))]


def _shift_run(shifts: list[float | None], sign: int) -> int:
    """Meses seguidos, hasta hoy, con `level_shift` pasado del umbral en `sign`."""
    months = 0
    for shift in reversed(shifts):
        if shift is None:
            break
        if sign < 0 and shift <= -config.REGIME_SHIFT:
            months += 1
        elif sign > 0 and shift >= config.REGIME_SHIFT:
            months += 1
        else:
            break
    return months


def _continues_trend(values: list[float]) -> bool:
    """El movimiento de este mes, ¿lo venia anunciando su propia tendencia?

    Un golpe es un movimiento que la entidad no traia. Si la pendiente corta de
    los meses ANTERIORES ya apuntaba hacia donde salta, no es un golpe: es la
    continuacion de algo que llevaba pasando. Se mira sin el ultimo mes a
    proposito, porque incluirlo arrastra la pendiente hacia el propio salto.
    """
    if len(values) < 4:
        return False
    delta = values[-1] - values[-2]
    previous = _slope(values[:-1], 3)
    if previous is None or abs(previous) <= 0.5:
        return False
    return (previous > 0 and delta > 0) or (previous < 0 and delta < 0)


def _recent_shock(values: list[float], months_back: int) -> bool:
    """Hubo un salto grande hace `months_back` meses."""
    if months_back >= len(values):
        return False
    past = values[: len(values) - months_back]
    z = _z_own(past)
    return z is not None and abs(z) >= config.REGIME_Z


def _regime_for(values: list[float], level_shift: float | None, z_own: float | None) -> str:
    # Sin `level_shift` no hay detector, y sin detector no se afirma nada: decir
    # `stable` con ocho meses de historia es reclamar estabilidad desde la
    # ignorancia, que es el mismo error que esto venia a arreglar. Son 66 filas
    # que caian mas de diez puntos y se publicaban como estables.
    if len(values) < config.MIN_MONTHS_FOR_REGIME or level_shift is None:
        return WARMUP

    shifts = _shift_series(values)
    # Y tampoco se afirma nada mientras no quepa la propia confirmacion: si hace
    # falta ver la condicion dos meses seguidos, con un solo mes medible no se
    # puede ni confirmar ni descartar.
    if sum(shift is not None for shift in shifts) < config.REGIME_HYSTERESIS:
        return WARMUP

    # 1 y 2. Movimiento de nivel confirmado: manda sobre todo lo demas.
    if _shift_run(shifts, -1) >= config.REGIME_HYSTERESIS:
        return "deteriorating"
    if _shift_run(shifts, +1) >= config.REGIME_HYSTERESIS:
        # Subir tras haber estado deteriorado (o con un techo activo) es
        # recuperarse, que dice mas que «mejora» a secas.
        return "recovering" if _was_falling(shifts) else "improving"

    # 3. Bache: el salto fue hace uno o dos meses, ya ha revertido y la mediana
    #    aguanta. Es la respuesta literal a «bache o caida» del brief.
    reverted = z_own is None or abs(z_own) < config.REGIME_Z
    shift_intact = abs(level_shift) < config.REGIME_SHIFT
    if reverted and shift_intact and any(
        _recent_shock(values, back) for back in (1, config.REGIME_HYSTERESIS)
    ):
        return "blip"

    # 4. Golpe recien llegado: todavia no se sabe si revierte. Solo cuenta como
    #    golpe si la tendencia previa no lo anunciaba; si la venia anunciando,
    #    es continuacion y le toca el regimen de abajo.
    if (z_own is not None and abs(z_own) >= config.REGIME_Z
            and not _continues_trend(values)):
        return "shock_pending"

    # 5. Recuperacion antes de que la histeresis la confirme. Lo que autoriza
    #    saltarsela no es un umbral mayor, sino la prueba extra de que venia de
    #    caer: un rebote tras un deterioro real ya es informacion.
    if level_shift >= config.REGIME_SHIFT and _was_falling(shifts):
        return "recovering"

    return "stable"


def _was_falling(shifts: list[float | None]) -> bool:
    """Hubo deterioro de nivel en los ultimos `REGIME_LOOKBACK` meses."""
    window = shifts[-(config.REGIME_LOOKBACK + 1):-1]
    return any(shift is not None and shift <= -config.REGIME_SHIFT for shift in window)


def _direction_for(regime: str, slope_3m: float | None) -> str:
    """La flecha del numero. Si el regimen ya ha decidido, la flecha le sigue.

    Solo cuando el regimen habla del salto (`blip`, `shock_pending`) o todavia
    no afirma nada (`warmup`) la fija la pendiente corta.
    """
    allowed = _ALLOWED_DIRECTIONS.get(regime)
    if allowed is not None:
        return next(iter(allowed))
    reference = slope_3m if slope_3m is not None else 0.0
    return ("improving" if reference > 0.5
            else "deteriorating" if reference < -0.5 else "stable")


def trajectory_for(series: list[float | None]) -> dict[str, object]:
    values = [v for v in series if v is not None]
    if len(values) < 2:
        return {"direction": "unknown", "slope_3m": None, "slope_6m": None,
                "months_in_direction": None, "regime": WARMUP,
                "level_shift": None, "z_own": None}

    slope_3m, slope_6m = _slope(values, 3), _slope(values, 6)
    level_shift = _level_shift(values)
    z_own = _z_own(values)

    regime = _regime_for(values, level_shift, z_own)
    direction = _direction_for(regime, slope_3m)

    # Meses seguidos moviendose en la direccion publicada. Ya no decide el
    # regimen, pero sigue siendo lo que la ficha enseña como «4 meses».
    run: int | None = 1
    for older, newer in zip(reversed(values[:-1]), reversed(values[1:])):
        delta = newer - older
        if (delta > 0 and direction == "improving") or (delta < 0 and direction == "deteriorating"):
            run += 1
        else:
            break
    if direction == "stable":
        run = None

    return {"direction": direction, "slope_3m": slope_3m, "slope_6m": slope_6m,
            "months_in_direction": run, "regime": regime,
            "level_shift": level_shift, "z_own": z_own}
