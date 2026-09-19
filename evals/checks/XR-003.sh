#!/usr/bin/env bash
# XR-003: shell de widgets (topbar con espacios, rejilla de 24 columnas, marco con
# selector de entidad y vinculo, widgets Buscador y Score simple).
# Una linea por escenario de features/XR-003/spec.md seccion 2, en el mismo orden.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

web_test layout-store
web_test workspaces
web_test WidgetFrame
web_test EntityPicker
web_test Screener
web_test ScoreCard
web_test MockBanner
