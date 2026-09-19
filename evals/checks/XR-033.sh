#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
py_test core/tests/test_engine_publication.py
api_test temporal-engine
web_test temporal-diagnostics
