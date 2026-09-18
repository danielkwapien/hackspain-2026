"""Funciones puras para el baseline estático de salud financiera."""

from __future__ import annotations

from dataclasses import dataclass


MODEL_VERSION = "static-baseline-v1"

FACTOR_WEIGHTS = {
    "liquidity": 0.30,
    "debt_utilisation": 0.25,
    "arrears": 0.30,
    "supplier_payment": 0.15,
}


@dataclass(frozen=True)
class Factor:
    score: float | None
    metrics: dict[str, float | int | str | None]
    reason: str | None = None


def interpolate(value: float, anchors: list[tuple[float, float]]) -> float:
    """Interpola linealmente entre anclas ordenadas y limita el resultado a 0..100."""
    if value <= anchors[0][0]:
        return round(anchors[0][1], 2)
    if value >= anchors[-1][0]:
        return round(anchors[-1][1], 2)
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x0 <= value <= x1:
            result = y0 + (value - x0) * (y1 - y0) / (x1 - x0)
            return round(max(0.0, min(100.0, result)), 2)
    raise ValueError("Las anclas deben estar ordenadas y cubrir el valor")


def liquidity_factor(cash: float, debt: float) -> Factor:
    """Caja frente a caja más deuda observada; no es un current ratio contable."""
    if cash == 0 and debt == 0:
        return Factor(None, {"cash_balance": 0.0, "debt_outstanding": 0.0}, "no_position_data")
    positive_cash = max(cash, 0.0)
    ratio = positive_cash / (positive_cash + debt) if positive_cash + debt else 0.0
    score = interpolate(ratio, [(0.0, 0.0), (0.2, 35.0), (0.5, 70.0), (0.8, 90.0), (1.0, 100.0)])
    return Factor(score, {
        "cash_balance": round(cash, 2),
        "debt_outstanding": round(debt, 2),
        "liquidity_ratio": round(ratio, 4),
    })


def debt_utilisation_factor(granted: float, outstanding: float) -> Factor:
    """Utilización de líneas revolving; sin líneas equivale a utilización cero."""
    if granted <= 0:
        return Factor(100.0, {
            "revolving_granted": 0.0,
            "revolving_outstanding": 0.0,
            "utilisation_ratio": 0.0,
        }, "no_revolving_facilities")
    ratio = max(0.0, outstanding / granted)
    score = interpolate(ratio, [(0.0, 100.0), (0.3, 90.0), (0.6, 60.0), (0.9, 20.0), (1.0, 0.0)])
    return Factor(score, {
        "revolving_granted": round(granted, 2),
        "revolving_outstanding": round(outstanding, 2),
        "utilisation_ratio": round(ratio, 4),
    })


def arrears_factor(
    supplier_open: float,
    supplier_overdue: float,
    supplier_documents: int,
    customer_open: float,
    customer_overdue: float,
    customer_documents: int,
) -> Factor:
    """Mora por importe, dando más peso a pagos propios que a cobros de clientes."""
    ratios: list[tuple[float, float]] = []
    supplier_ratio = None
    customer_ratio = None
    if supplier_documents:
        supplier_ratio = supplier_overdue / supplier_open if supplier_open else 0.0
        ratios.append((supplier_ratio, 0.60))
    if customer_documents:
        customer_ratio = customer_overdue / customer_open if customer_open else 0.0
        ratios.append((customer_ratio, 0.40))
    metrics = {
        "supplier_open_amount": round(supplier_open, 2),
        "supplier_overdue_amount": round(supplier_overdue, 2),
        "supplier_arrears_ratio": round(supplier_ratio, 4) if supplier_ratio is not None else None,
        "customer_open_amount": round(customer_open, 2),
        "customer_overdue_amount": round(customer_overdue, 2),
        "customer_arrears_ratio": round(customer_ratio, 4) if customer_ratio is not None else None,
    }
    if not ratios:
        return Factor(None, metrics, "no_invoice_data")
    combined = sum(value * weight for value, weight in ratios) / sum(weight for _, weight in ratios)
    score = interpolate(combined, [(0.0, 100.0), (0.1, 85.0), (0.25, 60.0), (0.5, 25.0), (0.75, 0.0)])
    metrics["combined_arrears_ratio"] = round(combined, 4)
    return Factor(score, metrics)


def supplier_payment_factor(
    paid_amount: float,
    paid_late_amount: float,
    median_payment_days: float | None,
    median_days_late: float | None,
) -> Factor:
    """Comportamiento de facturas de proveedor ya pagadas."""
    metrics = {
        "supplier_paid_amount": round(paid_amount, 2),
        "supplier_paid_late_amount": round(paid_late_amount, 2),
        "late_payment_rate": None,
        "median_payment_days": median_payment_days,
        "median_days_late": median_days_late,
    }
    if paid_amount <= 0 or median_days_late is None:
        return Factor(None, metrics, "no_valid_paid_supplier_invoices")
    late_rate = paid_late_amount / paid_amount
    rate_score = interpolate(late_rate, [(0.0, 100.0), (0.1, 90.0), (0.3, 60.0), (0.6, 20.0), (0.75, 0.0)])
    delay_score = interpolate(median_days_late, [(0.0, 100.0), (7.0, 80.0), (15.0, 60.0), (30.0, 30.0), (60.0, 0.0)])
    metrics["late_payment_rate"] = round(late_rate, 4)
    return Factor(round(0.7 * rate_score + 0.3 * delay_score, 2), metrics)


def combine_factors(factors: dict[str, Factor]) -> tuple[float | None, float, dict[str, float]]:
    """Combina factores disponibles y renormaliza sus pesos."""
    available = {name: factor for name, factor in factors.items() if factor.score is not None}
    coverage = sum(FACTOR_WEIGHTS[name] for name in available)
    if coverage < 0.50:
        return None, round(coverage, 2), {}
    effective = {name: FACTOR_WEIGHTS[name] / coverage for name in available}
    score = sum(float(factors[name].score) * weight for name, weight in effective.items())
    return round(score, 2), round(coverage, 2), {name: round(weight, 4) for name, weight in effective.items()}


def band_for(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 80:
        return "solid"
    if score >= 60:
        return "healthy"
    if score >= 40:
        return "watch"
    return "stress"


def build_drivers(factors: dict[str, Factor], effective_weights: dict[str, float]) -> list[dict[str, object]]:
    labels = {
        "liquidity": "Liquidez frente a deuda",
        "debt_utilisation": "Utilización de financiación disponible",
        "arrears": "Mora de facturas",
        "supplier_payment": "Comportamiento de pago a proveedores",
    }
    drivers = []
    for name, weight in effective_weights.items():
        factor_score = factors[name].score
        if factor_score is None:
            continue
        impact = round(weight * (factor_score - 50.0), 2)
        drivers.append({
            "factor": name,
            "label": labels[name],
            "direction": "positive" if impact >= 0 else "negative",
            "impact": impact,
            "message": f"{labels[name]}: {factor_score:.1f}/100.",
        })
    return sorted(drivers, key=lambda item: abs(float(item["impact"])), reverse=True)[:3]
