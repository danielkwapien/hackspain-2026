"""Narrativa por plantilla DETERMINISTA (contrato §2.8, ENGINE §7.3).

En el mock no hay LLM: `headline`, `body` y `watch_next` salen de los drivers
del mes, citando SIEMPRE el `value_fmt` del driver (que es exactamente el
contrato de placeholders de ENGINE §7.3: el modelo real recibira estos mismos
`value_fmt` y el guardarrail comprobara que no inventa numeros). Por eso
`guardrail_passed` es `true`: no hay ningun token numerico fuera de la
allowlist de `value_fmt`.

Castellano natural, sin emoji, `headline` de 70 caracteres como maximo.
"""

from __future__ import annotations

from . import catalog

HEADLINE_MAX = 70

_BAND_TEXT = {
    "solid": "solida",
    "healthy": "sana",
    "watch": "a vigilar",
    "stress": "en tension",
}

_REGIME_TEXT = {
    "warmup": "historial aun corto",
    "stable": "sin cambios de regimen",
    "improving": "en mejora confirmada",
    "deteriorating": "en deterioro confirmado",
    "blip": "tras un bache puntual ya revertido",
    "shock_pending": "con un movimiento brusco sin confirmar",
    "recovering": "recuperando terreno",
}

_CAP_TEXT = {
    "NEGCASH": "la caja agregada estuvo en negativo dos meses seguidos",
    "SSMISS": "no consta pago de Seguridad Social en dos meses seguidos",
    "DEBTSTOP": "dejo de amortizar deuda que venia pagando",
    "LOCFULL": "la linea de credito esta practicamente agotada",
}

_OUTLOOK_TEXT = {
    "positive": "el outlook a seis meses apunta al alza",
    "stable": "el outlook a seis meses se mantiene plano",
    "negative": "el outlook a seis meses apunta a la baja",
    "watch": "el suelo del outlook a seis meses entra en una banda peor",
}


def _num(value: float, decimals: int = 1) -> str:
    """Numero en castellano (coma decimal)."""
    return f"{value:.{decimals}f}".replace(".", ",")


def _signed(value: float, decimals: int = 1) -> str:
    return ("+" if value >= 0 else "-") + _num(abs(value), decimals)


def _truncate(text: str, limit: int = HEADLINE_MAX) -> str:
    """Recorta por palabra: el titular nunca pasa de `limit` caracteres."""
    if len(text) <= limit:
        return text
    corte = text[:limit - 1].rsplit(" ", 1)[0]
    return corte + "."


def _headline(score, delta_1m, band, regime, cap_code) -> str:
    banda = _BAND_TEXT[band]
    if cap_code:
        return _truncate(
            f"Techo {cap_code}: el score se queda en {_num(score, 0)} ({banda})")
    if regime == "warmup":
        return _truncate(f"Primeros meses: {_num(score, 0)} provisional ({banda})")
    if delta_1m is None or abs(delta_1m) < 1.0:
        return _truncate(f"Estable en {_num(score, 0)} ({banda})")
    verbo = "Sube" if delta_1m > 0 else "Cae"
    return _truncate(
        f"{verbo} {_num(abs(delta_1m))} puntos hasta {_num(score, 0)} ({banda})")


def _driver_phrase(driver) -> str:
    """"31 dias de colchon de caja (−4,2 pts frente a la mediana)"."""
    contribucion = driver["contribution"]
    signo = "+" if contribucion >= 0 else "-"
    return (f"{driver['value_fmt']} "
            f"({signo}{_num(abs(contribucion))} pts frente a la mediana)")


def build(*, score, delta_1m, band, regime, outlook_label, cap_code, penalty,
          drivers, strength_flags, month_index) -> dict:
    """Narrativa de un mes. `drivers` viene ya ordenado por `rank`.

    Devuelve `headline` (<= 70 car.), `body` (2-3 frases), `watch_next` (1
    frase) y `guardrail_passed`.
    """
    utiles = [d for d in drivers if d["value_fmt"]]
    peores = [d for d in utiles if d["contribution"] < 0]
    mejores = [d for d in utiles if d["contribution"] > 0]

    frases = []
    if regime == "warmup":
        frases.append(
            f"Solo hay {month_index} meses de historia, asi que la lectura es "
            f"provisional y no dispara alertas.")
    elif delta_1m is None:
        frases.append(f"Primera lectura del score: {_num(score, 1)} puntos.")
    else:
        frases.append(
            f"El score cierra el mes en {_num(score, 1)} puntos "
            f"({_signed(delta_1m)} frente al mes anterior), {_REGIME_TEXT[regime]}.")

    if peores:
        frases.append(f"Lo que mas pesa en contra es {_driver_phrase(peores[0])}.")
        if len(peores) > 1:
            frases[-1] = frases[-1][:-1] + f", seguido de {_driver_phrase(peores[1])}."
    elif mejores:
        frases.append(f"Lo que mas aporta es {_driver_phrase(mejores[0])}.")

    if cap_code:
        frases.append(
            f"Hay techo {cap_code} porque {_CAP_TEXT[cap_code]}: "
            f"el score no puede pasar de {catalog.CAPS[cap_code]}.")
    elif penalty and penalty > 1.0:
        frases.append(
            f"El pilar mas debil resta {_num(penalty)} puntos de penalizacion.")
    elif mejores and peores:
        frases.append(f"En el otro lado, {_driver_phrase(mejores[0])}.")

    body = " ".join(frases[:3])

    if cap_code:
        watch = (f"Vigilar si el techo {cap_code} se levanta el mes que viene: "
                 f"es lo unico que hoy limita el score.")
    elif peores:
        watch = (f"Vigilar {peores[0]['value_fmt']}: es el driver que marca el "
                 f"mes que viene, y {_OUTLOOK_TEXT[outlook_label]}.")
    else:
        watch = (f"Sin drivers en contra este mes; {_OUTLOOK_TEXT[outlook_label]}.")

    flags = [f for f in strength_flags.split("|") if f]
    if flags and not peores and not cap_code:
        watch = (f"Se mantienen las senales de fortaleza ({', '.join(flags)}); "
                 f"{_OUTLOOK_TEXT[outlook_label]}.")

    return {
        "headline": _headline(score, delta_1m, band, regime, cap_code),
        "body": body,
        "watch_next": watch,
        "guardrail_passed": True,
    }
