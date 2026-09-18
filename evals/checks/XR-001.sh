#!/usr/bin/env bash
# XR-001: dataset mock del motor X-Ray + API v2 que lo sirve.
# Las dos lineas api_json necesitan que la API sirva el mock: EXPORTS_DIR se
# exporta antes de que ensure_server arranque el dev server.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

export EXPORTS_DIR="$LIB_ROOT/datasets_mocked/exports/v1"

py_test datasets_mocked/tests/test_core_formulas.py
py_test datasets_mocked/tests/test_mock_invariants.py
py_test datasets_mocked/tests/test_exports_contract.py
api_test v2
api_json /api/v2/meta '.data_kind == "mock"'
api_json /api/v2/companies/COMP_1267 '.drivers | length >= 3'
