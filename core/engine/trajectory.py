"""Direccion y regimen a partir de la serie mensual ya calculada.

Solo mira el pasado: es exactamente la informacion disponible en ese corte.
El regimen exige persistencia porque un mes suelto es ruido, no un cambio.
"""

from __future__ import annotations

from . import config


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


def trajectory_for(series: list[float | None]) -> dict[str, object]:
    values = [v for v in series if v is not None]
    if len(values) < 2:
        return {"direction": "unknown", "slope_3m": None, "slope_6m": None,
                "months_in_direction": None, "regime": "warmup"}

    slope_3m, slope_6m = _slope(values, 3), _slope(values, 6)
    reference = slope_3m if slope_3m is not None else 0.0
    direction = ("improving" if reference > 0.5
                 else "deteriorating" if reference < -0.5 else "stable")

    run: int | None = 1
    for older, newer in zip(reversed(values[:-1]), reversed(values[1:])):
        delta = newer - older
        if (delta > 0 and direction == "improving") or (delta < 0 and direction == "deteriorating"):
            run += 1
        else:
            break
    if direction == "stable":
        run = None

    level_shift = None
    if len(values) >= 9:
        recent = sorted(values[-3:])[1]
        window = values[-9:-3]
        prior = sorted(window)[len(window) // 2]
        level_shift = round(recent - prior, 2)

    if len(values) < config.MIN_MONTHS_FOR_REGIME:
        regime = "warmup"
    elif direction == "deteriorating" and (run or 0) >= 3:
        regime = "deteriorating"
    elif direction == "improving" and (run or 0) >= 4:
        regime = "improving"
    elif (slope_3m is not None and slope_6m is not None
          and slope_3m * slope_6m < 0 and abs(slope_3m) > 1.0):
        regime = "shock_pending"
    else:
        regime = "stable"

    return {"direction": direction, "slope_3m": slope_3m, "slope_6m": slope_6m,
            "months_in_direction": run, "regime": regime, "level_shift": level_shift}
