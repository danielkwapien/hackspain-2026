#!/usr/bin/env bash
# XR-012: primitivas de grafica compartidas en app/web/src/charts/.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

web_test charts/format
web_test charts/palette
web_test Sparkline
web_test RangeBar
web_test PillarBar
web_test LineNoAxes
web_test ChartTooltip
web_test Treemap
web_test migration
