"""El rastro del score: cada paso deja escrito lo que hizo y por que.

Es la pieza que sostiene la narrativa. La explicacion no se reconstruye
despues mirando el numero final: se va escribiendo mientras se calcula, asi
que por construccion coincide con la aritmetica. Si el score dice 40 y el
rastro dice 68 menos 5 y techo 40, es que eso es exactamente lo que paso.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Step:
    stage: str                       # family | level | penalty | modifier | override | final
    name: str
    value: float | None = None       # valor resultante del paso
    delta: float | None = None       # cuanto movio el score, si aplica
    detail: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"stage": self.stage, "name": self.name}
        if self.value is not None:
            out["value"] = round(float(self.value), 2)
        if self.delta is not None:
            out["delta"] = round(float(self.delta), 2)
        if self.detail:
            out["detail"] = self.detail
        return out


@dataclass
class Trace:
    steps: list[Step] = field(default_factory=list)

    def add(self, stage: str, name: str, value: float | None = None,
            delta: float | None = None, **detail: Any) -> None:
        self.steps.append(Step(stage, name, value, delta, detail))

    def of(self, stage: str) -> list[Step]:
        return [step for step in self.steps if step.stage == stage]

    def first(self, stage: str, name: str | None = None) -> Step | None:
        for step in self.steps:
            if step.stage == stage and (name is None or step.name == name):
                return step
        return None

    @property
    def deltas(self) -> list[Step]:
        """Pasos que movieron el numero, de mayor a menor efecto."""
        moved = [s for s in self.steps if s.delta not in (None, 0.0)]
        return sorted(moved, key=lambda s: abs(s.delta or 0.0), reverse=True)

    def as_list(self) -> list[dict[str, Any]]:
        return [step.as_dict() for step in self.steps]
