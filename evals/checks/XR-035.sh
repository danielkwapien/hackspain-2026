#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# Bloque 1 — producto navegable
py_test core/tests/test_alert_severity.py                                  # B1.1
web_test src/widgets/alerts/AlertsWidget.test.tsx                          # B1.2
web_test src/dashboard/WidgetBoundary.test.tsx                             # B1.3
api_json '/api/v2/alerts?limit=200' '[.items[].severity] | unique | inside(["urgent","review","watch"])'  # B1.4
web_test src/routes/monitor.test.tsx                                       # B1.5
api_test legacy-tables                                                     # B1.6
api_json /health '.v2.model_version == "embat-layered-v1" and (.engine | test("static-baseline") | not)'  # B1.7
web_test src/routes/routes.test.tsx                                        # B1.8
# Bloque 2 — credibilidad del numero
py_test core/tests/test_regime_publication.py                              # B2.1
py_test core/tests/test_regime.py                                          # B2.2
api_json '/api/v2/signals' '[.items[] | select(.label == null or .weight_in_pillar == 0)] | length == 0'  # B2.3
# Bloque 3 — calidad del dato
py_test core/tests/test_isolation.py                                       # B3.1
py_test core/tests/test_branch_parity.py                                   # B3.2
py_test core/tests/test_loc_utilisation_proxy.py                           # B3.3
# Bloque 4 — prevision y ventanas
api_json '/api/v2/groups/GROUP_0016' '.months[-1].outlook_3m != null and .months[-1].outlook_6m != null'  # B4.1
web_test src/panels/research/series.test.ts                                # B4.2
# Bloque 5 — idioma del comprador e identidad
web_test src/panels/research/TreasuryHeader.test.tsx                       # B5.1
api_json '/api/v2/companies/COMP_0001/aging' '[.buckets[].bucket] == ["0-30","31-60","61-90","90+"]'      # B5.2
api_json '/api/v2/entities/GROUP_0016/profile' '.name != null and .country != null and .industry != null' # B5.3
py_test core/tests/test_identity_not_scored.py                             # B5.4
# Bloque 6 — remate
web_test src/widgets/research-deep/ReportButton.test.tsx                   # B6.1
web_test src/panels/research/ResearchPanel.test.tsx                        # B6.2
