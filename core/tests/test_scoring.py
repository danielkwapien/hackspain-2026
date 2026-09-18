from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scoring import (  # noqa: E402
    Factor,
    arrears_factor,
    combine_factors,
    debt_utilisation_factor,
    interpolate,
)


class ScoringTests(unittest.TestCase):
    def test_interpolation_supports_descending_scores(self) -> None:
        self.assertEqual(interpolate(0.45, [(0.0, 100.0), (0.9, 10.0)]), 55.0)

    def test_debt_utilisation_penalises_high_use(self) -> None:
        low = debt_utilisation_factor(100.0, 20.0)
        high = debt_utilisation_factor(100.0, 90.0)
        self.assertGreater(low.score, high.score)

    def test_arrears_uses_available_invoice_side(self) -> None:
        factor = arrears_factor(100.0, 25.0, 5, 0.0, 0.0, 0)
        self.assertEqual(factor.metrics["combined_arrears_ratio"], 0.25)
        self.assertEqual(factor.score, 60.0)

    def test_missing_factors_are_reweighted(self) -> None:
        factors = {
            "liquidity": Factor(80.0, {}),
            "debt_utilisation": Factor(60.0, {}),
            "arrears": Factor(None, {}),
            "supplier_payment": Factor(None, {}),
        }
        score, coverage, weights = combine_factors(factors)
        self.assertEqual(coverage, 0.55)
        self.assertAlmostEqual(sum(weights.values()), 1.0, places=3)
        self.assertIsNotNone(score)


if __name__ == "__main__":
    unittest.main()
