#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
api_test v2
web_test lib/api-v2
web_test design/tokens
web_test charts/
web_test components/
web_test dashboard/
web_test widgets/
web_test panels/companies
web_test panels/research
web_test panels/compare
