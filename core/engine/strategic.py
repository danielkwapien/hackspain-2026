"""Las señales estratégicas como modificadores del nivel.

`signals/` publica cinco perspectivas con un contrato común: un valor 0..100
donde 50 es neutro, más `confidence` y `coverage`. Aquí se convierten en
ajustes **acotados** sobre el nivel ya calculado.

Tres reglas gobiernan la conversión:

1. **Acotados.** Ninguna perspectiva puede secuestrar el score. El techo de
   cada una está en `config.STRATEGIC_MODIFIERS` y se lee de un vistazo.
2. **Escalados por confianza.** Una señal en la que no confiamos encoge su
   ajuste hacia cero en vez de meter ruido. Es lo que hace útil el campo
   `confidence` que ya publica cada señal.
3. **`current_health` nunca modifica.** Es el propio nivel republicado: usarla
   como ajuste sería sumar el score a sí mismo.

## Dependencia de cohorte

Dos de las cinco miran a los demás grupos del fichero, no solo al propio:

- `sector_benchmark_rank` ordena dentro de una cohorte del lote cargado
- `data_driven_peer_learning` busca vecinos entre el resto de grupos

Con 60 grupos en vez de 250 devolverían otro número para el mismo grupo, así
que **entran desactivadas**: romperían la garantía que protege la entrega
(`tests/test_isolation.py`). Son excelentes como diagnóstico y se muestran en
el JSON; para activarlas en el score hace falta congelar su referencia.
"""

from __future__ import annotations

import math

from . import config
from .trace import Trace

NEUTRAL = 50.0
SCALE = 25.0          # 25 puntos sobre el neutro ~ un ajuste de 3/4 del techo


def _delta(value: float, bound: float, confidence: float) -> float:
    """Lleva un valor 0..100 a un ajuste acotado en puntos de score."""
    normalised = (value - NEUTRAL) / SCALE
    return bound * math.tanh(normalised) * max(0.0, min(1.0, confidence))


def modifier_deltas(signals: dict[str, dict]) -> list[tuple[str, float, dict]]:
    """Calcula el ajuste de cada perspectiva activa, mayor efecto primero."""
    out: list[tuple[str, float, dict]] = []
    for name, spec in config.STRATEGIC_MODIFIERS.items():
        if not spec.get("enabled"):
            continue
        payload = signals.get(name)
        if not payload:
            continue
        value, confidence = payload.get("value"), payload.get("confidence")
        if value is None or confidence is None:
            continue
        delta = _delta(float(value), float(spec["bound"]), float(confidence))
        if abs(delta) < config.MODIFIER_MIN_EFFECT:
            continue
        out.append((name, delta, {
            "signal_value": round(float(value), 2),
            "confidence": round(float(confidence), 3),
            "direction": payload.get("direction"),
            "bound": spec["bound"],
        }))
    return sorted(out, key=lambda item: abs(item[1]), reverse=True)


def apply(level: float, signals: dict[str, dict], trace: Trace | None = None) -> float:
    """Suma los ajustes de las perspectivas activas al nivel."""
    score = level
    for name, delta, detail in modifier_deltas(signals or {}):
        score += delta
        if trace is not None:
            trace.add("modifier", name, value=score, delta=delta, **detail)
    return max(0.0, min(100.0, score))
