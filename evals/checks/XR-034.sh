#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
web_test charts/treemap-columns
web_test charts/treemap-fit
web_test charts/Treemap
web_test charts/TreemapLayout
web_test widgets/treemap/TreemapColumns
web_test widgets/treemap/TreemapWidget
api_json '/api/v2/treemap?group_by=country&metric=score&size_by=n_companies' '.group_by == "country" and .size_by == "n_companies" and (.groups | length) > 0'
