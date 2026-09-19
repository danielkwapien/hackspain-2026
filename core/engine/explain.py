"""La explicacion sale del rastro, no de mirar el numero final.

Esto es lo que hace que la narrativa sea defendible: la frase que se lee en
la demo esta construida con los mismos pasos que produjeron el numero, asi
que no puede contradecirlo.

Aqui NO se llama a ningun modelo de lenguaje. Se producen frases
deterministas y el JSON de drivers; si mas adelante un LLM redacta la
version larga, recibe esto ya calculado y solo puede reformularlo.
"""

from __future__ import annotations

from . import config
from .families import Factor
from .trace import Trace


def build_drivers(factors: dict[str, Factor], effective_weights: dict[str, float]) -> list[dict]:
    """Contribucion de cada familia frente al punto neutro."""
    drivers = []
    for name, weight in effective_weights.items():
        value = factors[name].score
        if value is None:
            continue
        impact = round(weight * (value - config.NEUTRAL), 2)
        drivers.append({
            "factor": name,
            "label": config.PILLAR_LABELS[name],
            "direction": "positive" if impact >= 0 else "negative",
            "impact": impact,
            "message": f"{config.PILLAR_LABELS[name]}: {value:.1f}/100.",
        })
    return sorted(drivers, key=lambda item: abs(float(item["impact"])), reverse=True)[:3]


_PHRASES = {
    "momentum": "la trayectoria {sign} {delta:.0f} puntos tras {run} meses {word}",
    "peer_context": "la posicion entre pares {sign} {delta:.0f}",
    "weakest_link": "el pilar mas debil ({pillar}) descuenta {abs_delta:.0f}",
}


def narrative(trace: Trace, score: float | None, band: str | None) -> dict[str, object]:
    """Una frase que explica el numero, montada desde el rastro."""
    if score is None:
        return {"headline": "Sin score: historia o cobertura insuficiente",
                "sentence": None, "steps": trace.as_list()}

    level_step = trace.first("level", "blended")
    level = level_step.value if level_step else score
    parts: list[str] = []

    for step in trace.deltas:
        delta = step.delta or 0.0
        sign = "suma" if delta > 0 else "resta"
        detail = step.detail
        if step.name == "momentum":
            run = detail.get("months_in_direction", 0)
            word = "de mejora" if delta > 0 else "de deterioro"
            parts.append(_PHRASES["momentum"].format(
                sign=sign, delta=abs(delta), run=run, word=word))
        elif step.name == "peer_context":
            parts.append(_PHRASES["peer_context"].format(sign=sign, delta=abs(delta)))
        elif step.name == "weakest_link":
            parts.append(_PHRASES["weakest_link"].format(
                pillar=config.PILLAR_LABELS.get(detail.get("pillar", ""), detail.get("pillar", "")),
                abs_delta=abs(delta)))
        elif step.stage == "override":
            parts.append(f"queda capada en {detail.get('ceiling', score):.0f} porque "
                         f"{detail.get('label', step.name).lower()}")

    headline = f"{score:.0f} ({band})"
    if parts:
        sentence = f"Partimos de un nivel de {level:.0f}: " + "; ".join(parts) + "."
    else:
        sentence = f"Nivel de {level:.0f} sin ajustes: ninguna senal mueve el resultado."

    return {"headline": headline, "sentence": sentence, "steps": trace.as_list()}
