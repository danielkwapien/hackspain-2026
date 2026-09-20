# XR-038 · Fase 1 · API. Los tres endpoints de evidencia de W2.3 (`/cash`,
# `/debt`, `/activity`), patron de `/counterparties`. Todo lo que se afirma aqui
# esta medido contra `md:hackspain_2026`, no contra fixtures: COMP_0169 tiene
# 6 productos bancarios en 5 bancos y 10 productos de deuda, y 908 sociedades
# (COMP_0001 entre ellas) no tienen ninguna deuda.

# Liquidez: «Donde esta la caja».
api_json /api/v2/companies/COMP_0169/cash '.items | length == 6'
api_json /api/v2/companies/COMP_0169/cash '.summary.n_banks == 5'
# `balances.available` es NULL en las 7.996 filas: no se sirve «Disponible».
api_json /api/v2/companies/COMP_0169/cash '[.items[] | has("available")] | any | not'
# Multimoneda sin FX: se totaliza EUR (217.665,33) y USD viaja aparte, nunca sumado.
api_json /api/v2/companies/COMP_0169/cash '[.summary.by_currency[].currency] | sort == ["EUR","USD"]'
api_json /api/v2/companies/COMP_0169/cash '.summary.total_eur > 217665 and .summary.total_eur < 217666'
# Abanca CHECKING_03 no tiene fila en `balances`: viaja nulo, nunca 0.
api_json /api/v2/companies/COMP_0169/cash '[.items[] | select(.balance == null)] | length == 1'

# Deuda: «Posiciones de financiacion», en magnitudes y sin ratio de utilizacion.
api_json /api/v2/companies/COMP_0169/debt '.items | length == 10'
api_json /api/v2/companies/COMP_0169/debt '[.items[] | .granted_abs >= 0 and .outstanding_abs >= 0] | all'
api_json /api/v2/companies/COMP_0169/debt '[.. | objects | keys[]] | map(select(test("utilis|utiliz"))) | length == 0'
# Una sociedad sin deuda responde lista vacia, no una tabla de ceros.
api_json /api/v2/companies/COMP_0001/debt '.items == []'

# Actividad: «Ultimos movimientos», al corte del motor (2026-08-01). Sin filtrar,
# el ultimo movimiento de COMP_0169 es de 2026-09-01.
api_json /api/v2/companies/COMP_0169/activity '.items | length > 0'
api_json /api/v2/companies/COMP_0169/activity '[.items[] | .date <= "2026-08-01"] | all'
api_json /api/v2/companies/COMP_0169/activity '[.items[] | .date] | max == "2026-08-01"'
# La categoria `-` viaja tal cual y no se esconde; la etiqueta la pone el front.
api_json /api/v2/companies/COMP_0169/activity '[.items[] | .category] | index("-") != null'

api_test test/evidence-tables.test.ts
