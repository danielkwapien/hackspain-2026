#!/usr/bin/env bash
# XR-002: sistema de tokens X-Ray (tres capas), playground /tokens y pantallas intactas.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

web_test tokens
web_test portfolio
web_test company
web_test monitor
