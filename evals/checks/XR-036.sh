#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Publicador: agregacion, EUR-only, tramos as-of y desvio ponderado.
py_test core/tests/test_counterparties.py

# Contrato de la ruta nueva.
api_json '/api/v2/companies/COMP_0001/counterparties?side=ap' \
  '.side == "ap" and .currency == "EUR" and (.summary | has("top1_weight") and has("effective_counterparties") and has("eur_share"))'
api_json '/api/v2/companies/COMP_0001/counterparties?side=ar' '.side == "ar"'
api_json '/api/v2/companies/COMP_0001/counterparties?side=ap&sort=weight' \
  '[.items[].weight] as $w | ($w | length) > 0 and ($w == ($w | sort | reverse))'
api_json '/api/v2/companies/COMP_0001/counterparties?side=ap&sort=deterioration' \
  '[.items[].days_late_w] as $d | ($d == ($d | sort | reverse))'
api_json '/api/v2/companies/COMP_0001/counterparties?side=ap' \
  '.items | length > 0 and all(.[]; has("overdue_0_30") and has("overdue_90_plus") and has("sparkline_12"))'

# Los pesos de un lado suman 1: si no, la tabla miente sobre la concentracion,
# que es justo la columna por la que se ordena. Con `limit` alto a proposito: la
# invariante es sobre el lado entero, no sobre una pagina.
api_json '/api/v2/companies/COMP_0001/counterparties?side=ap&limit=500' \
  '([.items[].weight] | add) as $s | ($s > 0.99 and $s < 1.01)'

# Un lado vacio es 200 con lista vacia, nunca 404.
api_json '/api/v2/companies/COMP_0404/counterparties?side=ar' \
  '.summary.n_counterparties >= 0 and (.items | type) == "array"'

# Parametros invalidos y entidad inexistente respetan el resto del contrato v2.
# Con `api_json` y no con `route_ok`: `route_ok` mide contra el servidor web,
# que sirve la SPA y devuelve 200 en cualquier ruta, asi que sobre una ruta de
# API no comprueba nada. El cuerpo del error si distingue los dos casos.
api_json '/api/v2/companies/COMP_0001/counterparties?side=zz' '.error == "invalid_query"'
api_json '/api/v2/companies/COMP_0001/counterparties?sort=zz' '.error == "invalid_query"'
api_json '/api/v2/companies/COMP_9999/counterparties' '.error == "company_not_found"'

# Pantalla: el bloque y su sitio en las pestanas P y C.
web_test widgets/research-deep/Counterparties
web_test widgets/research-deep/PillarSummary
