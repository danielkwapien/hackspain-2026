#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
api_json '/api/v2/meta' '.source == "motherduck" and .data_kind == "real" and .model_version == "static-baseline-v1" and .capabilities.snapshots_only == true and .params == null'
api_json '/api/v2/universe?unit=company&limit=500' '.total == 1286 and .data_kind == "real"'
api_json '/api/v2/universe?unit=group&limit=500' '.total == 250 and .data_kind == "real"'
api_json '/api/v2/companies/COMP_0001' '.score == 54.93 and .audit.model_version == "static-baseline-v1" and .delta_1m == null and .delta_3m == null and .delta_6m == null and (.timeline | length) <= 1 and ([.outlook.h3,.outlook.h6,.outlook.low,.outlook.high] | all(. == null))'
api_json '/api/v2/companies/COMP_0002' '.score == null and .snapshot.status == "insufficient_data" and (.timeline | length) <= 1 and .delta_1m == null and .outlook.h6 == null'
api_json '/api/v1/companies/COMP_0042' '(.detail.monthly_activity | (map(.n_tx)|add) == 1848 and (map(.n_tx_pending)|add) == 18 and (((map(.net)|add) + 645204.15)|fabs) < 0.001)'
api_json '/api/v1/companies/COMP_0004' '(.detail.coverage.snapshot.n_products_with_balance == 12) and (.detail.coverage.snapshot.balance_total_by_currency == [{currency:"EUR",total:121401.46}]) and ((.detail.monthly_invoices.items|map(.n_pending)|add) == 295)'
