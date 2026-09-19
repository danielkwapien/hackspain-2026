#!/usr/bin/env bash
# XR-030: rediseno del frontal al estilo Trade Republic (una pagina, tres paneles, fondo navy
# con orbe y superficies glass). Una linea por escenario de features/XR-030/spec.md seccion 2,
# en el mismo orden.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

web_test design/tokens
web_test api-v2
web_test selection
web_test app-shell
web_test CompaniesPanel
web_test ComparePanel
web_test ResearchPanel
