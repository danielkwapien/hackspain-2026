#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
api_test v2
api_json /api/v2/companies/COMP_0004/timeline '.[0].pillars.L.value != null'
api_json '/api/v2/universe?limit=1' '.items[0] | has("group_name")'
web_test design/tokens
web_test lib/
web_test charts/
web_test components/
web_test dashboard/
web_test widgets/
web_test panels/companies
web_test panels/research
web_test panels/compare
