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


def _phrase_for(step) -> str | None:
    """Una frase por paso que movio el numero. Nada se queda fuera.

    Si un modificador nuevo no tiene redaccion propia, cae en la forma
    generica: es preferible una frase sosa a que la explicacion no cuadre
    con la aritmetica.
    """
    delta = step.delta or 0.0
    sign = "suma" if delta > 0 else "resta"
    detail = step.detail or {}

    if step.stage == "override":
        return (f"queda capada en {detail.get('ceiling', 0):.0f} porque "
                f"{str(detail.get('label', step.name)).lower()}")

    if step.name == "weakest_link":
        pillar = config.PILLAR_LABELS.get(detail.get("pillar", ""), detail.get("pillar", ""))
        return f"el pilar mas debil ({pillar}) descuenta {abs(delta):.0f}"

    spec = config.STRATEGIC_MODIFIERS.get(step.name)
    if spec:
        label = str(spec["label"]).lower()
        # La etiqueta de direccion solo se anade si coincide con el signo del
        # ajuste. Una senal puede venir "mejorando" y aun asi restar -mejora
        # desde un nivel malo-, y "(mejorando) resta 1" se lee como un error.
        direction = detail.get("direction")
        agrees = ((direction == "improving" and delta > 0)
                  or (direction == "deteriorating" and delta < 0))
        tail = ""
        if agrees:
            tail = " (mejorando)" if delta > 0 else " (deteriorandose)"
        return f"{label}{tail} {sign} {abs(delta):.0f}"

    return f"{step.name} {sign} {abs(delta):.0f}"


def narrative(trace: Trace, score: float | None, band: str | None) -> dict[str, object]:
    """Una frase que explica el numero, montada desde el rastro."""
    if score is None:
        return {"headline": "Sin score: historia o cobertura insuficiente",
                "sentence": None, "steps": trace.as_list()}

    level_step = trace.first("level", "blended")
    level = level_step.value if level_step else score
    parts: list[str] = []

    for step in trace.deltas:
        phrase = _phrase_for(step)
        if phrase:
            parts.append(phrase)

    headline = f"{score:.0f} ({band})"
    if parts:
        sentence = f"Partimos de un nivel de {level:.0f}: " + "; ".join(parts) + "."
    else:
        sentence = f"Nivel de {level:.0f} sin ajustes: ninguna senal mueve el resultado."

    return {"headline": headline, "sentence": sentence, "steps": trace.as_list()}
