from __future__ import annotations

import hashlib
import json
from typing import TypedDict

from engine import MODEL_VERSION, config
from signals import specs_by_pillar

PILLAR_CODES = {
    "liquidity": "L",
    "payment": "P",
    "collections": "C",
    "debt": "D",
    "activity": "A",
}

API_SIGNAL_IDS = {
    "buffer_days": "L1",
    "ap_pct_paid_late": "P1",
    "ap_days_late": "P2",
    "ss_regularity": "P4",
    "tax_regularity": "P5",
    "ar_pct_paid_late": "C1",
    "collection_ratio": "C4",
    "loc_utilisation": "D1",
    "debt_service_ratio": "D3",
    "feeint_share": "D4",
    "op_in_growth": "A1",
    "inflow_cv": "A2",
    "net_ocf_ratio": "A3",
}


class EngineParameters(TypedDict):
    model_version: str
    pillar_weights: dict[str, float]
    family_blend: dict
    combine_blend: tuple
    penalty_lambda: float
    penalty_tau: float
    shrink_exponent: float
    ewma_alpha: float
    strategic_modifiers: dict
    caps_enabled: bool
    caps: dict
    min_months_for_score: int
    min_coverage: float
    signals: dict


def parameters_payload() -> EngineParameters:
    return {
        "model_version": MODEL_VERSION,
        "pillar_weights": config.PILLAR_WEIGHTS,
        "family_blend": config.FAMILY_BLEND,
        "combine_blend": config.COMBINE_BLEND,
        "penalty_lambda": config.PENALTY_LAMBDA,
        "penalty_tau": config.PENALTY_TAU,
        "shrink_exponent": config.SHRINK_EXPONENT,
        "ewma_alpha": config.EWMA_ALPHA,
        "strategic_modifiers": config.STRATEGIC_MODIFIERS,
        "caps_enabled": config.CAPS_ENABLED,
        "caps": config.CAPS,
        "min_months_for_score": config.MIN_MONTHS_FOR_SCORE,
        "min_coverage": config.MIN_COVERAGE,
        "signals": specs_by_pillar(),
    }


def params_version() -> str:
    encoded = json.dumps(
        parameters_payload(),
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"
