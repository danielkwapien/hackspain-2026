# XR-020 independent scorer

## RED baseline

- Command: `PORT=8792 corepack pnpm --filter api dev` from `app/`.
- Check: `API_URL=http://127.0.0.1:8792 BASE_URL=http://127.0.0.1:8792 bash evals/checks/XR-020.sh`.
- Result: exit 1, `FAIL api_json /api/v2/meta .data_kind == "real" and .model_version == "static-baseline-v1"`.
- Existing API responds `no_v2_tables`; it reads the local exports directory and does not expose MotherDuck data.
- Evidence: `plans/motherduck-fastify/red-check.log`, `plans/motherduck-fastify/baseline-meta.json`.
- Port 8787 was not touched. The feature check uses only existing `api_json` primitives.

## GREEN verification

Pending implementation handoff. Counts, source truth, null scores, absence of synthetic timelines/forecasts, query errors, and production build must be checked independently.

Baseline API tests: `cd app && corepack pnpm --filter api test`, 2 files and 25 tests passed (414 ms). Log: `plans/motherduck-fastify/baseline-api-tests.log`.

The final RED check additionally requires `meta.source=motherduck`, `capabilities.snapshots_only=true`, `params=null`, and COMP_0002 `snapshot.status=insufficient_data`. Re-run produced exit 1 at the meta assertion, before builder integration.

## Implementation check, round 1

Independent commands from `app/`:

- `corepack pnpm typecheck`: FAIL, five web fixture type errors (nullable meta.params in api-v2.test.ts:216–219 and nullable index in GroupWidget.test.tsx:93). API typecheck passes.
- `corepack pnpm test`: API 25/25 PASS; web 202 PASS / 1 FAIL, TreemapWidget.test.tsx:88 expects the old empty-delta copy.
- `corepack pnpm --filter web build`: FAIL on the same five web TypeScript errors.

Logs: `plans/motherduck-fastify/scorer-typecheck.log`, `scorer-tests.log`, `scorer-build.log`. Findings handed to frontend builder and coordinator. No implementation or builder tests changed by scorer. Live API check awaits coordinator readiness.

## Implementation check, round 2

- Workspace typecheck: PASS after frontend fixture typing corrections.
- Web production build: PASS; Vite reports a 990.98 kB JavaScript chunk warning.
- API tests: 25/25 PASS. Web tests: 202 PASS / 1 FAIL. Remaining failure is an ambiguous accessibility query (`findByRole("group")`) in TreemapWidget.test.tsx:90, because map and legend both have that role. Builder notified to target the map's accessible name precisely.
- Logs use `scorer-*-green.log` suffix (round label, not a claim that all checks passed).

## Live MotherDuck verification

`API_URL=http://localhost:8787 BASE_URL=http://localhost:5173 bash evals/checks/XR-020.sh`: PASS, exit 0.

Additional live API observations:

- Three universe pages (offset 0/500/1000): 1,286 unique companies, exactly 456 NULL scores. Final page contains 286 rows.
- Search COMP_0002 returns exactly one row with NULL score.
- COMP_0001 is 54.93, belongs to GROUP_0147; original snapshot status partial. v1 COMP_0002 retains original insufficient_data payload.
- Invalid company ID returns 400; missing COMP_9999 returns 404; nonnumeric limit returns 400.
- GROUP_0147: three companies, consolidated score NULL, no invented temporal delta or forecast.
- v1 monitor with demo=1 still returns source motherduck, mode engine, status available and zero alerts. No fixture fallback.
- Meta: cutoff 2026-09-01, source motherduck, 1,286 companies / 250 groups / 1,286 scores, params NULL, snapshots_only true.
- Python tools tests: all five PASS (`uv run pytest -q`).

Evidence: `scorer-live-check.log`, `scorer-api-edge.log`, `scorer-universe-audit.log`, `scorer-company1.json`, `scorer-v1-company2.json`, `scorer-meta.json`, `scorer-python-tests.log` under `plans/motherduck-fastify/`.

The baseline server on port 8792 was stopped after live verification. Primary API 8787 was left running.

## Availability and accounting boundaries

A separate `buildApp().inject` process with both token environment variables removed returned HTTP 503 `source_unavailable` / source `motherduck` for `/health`, `/api/v2/meta`, and `/api/v1/companies`. Response contains a safe configuration hint only, with no credential or filesystem path. No browser login was started. Live API environment was untouched. Evidence: `scorer-no-token.log`.

COMP_0001 legacy detail: monthly activity/invoice records preserve currency, transaction count 203 and latest EUR balance 32477.26. Live assertion PASS: `scorer-financials-check.log`.

Found substantive coverage denominator issue: coverage.ts uses active months for both numerator and denominator. Legacy portfolio/company screens display this as 9/9 for COMP_0001, implying full coverage. Reported to backend builder and root for correction to the actual dataset window.

## Final scorer verdict

PASS after corrections:

- Workspace tests: API 25/25, web 203/203.
- Workspace typecheck and production web build pass.
- Python tools: 5/5.
- Feature check XR-020 passes against live MotherDuck-backed API; repeated after coverage correction.
- Coverage correction verified live: COMP_0001 now has 9 active months / 25 total calendar months, consistent with manifest window 2024-09-01 through 2026-09-01 inclusive.
- Missing-token 503 boundary verified in an isolated process.
- All retained null scores, pagination, identifier error cases, provenance, snapshot restrictions, and legacy monitor checks above pass.

Final logs: `scorer-tests-final.log`, `scorer-typecheck-final.log`, `scorer-build-final.log`, `scorer-api-final.log`, `scorer-live-final.log`, `scorer-coverage-final.json`. Build retains the non-blocking large-chunk warning. Browser QA belongs to the independent UI QA lane and is not claimed by this scorer.

## Legacy EnginePanel regression

Visual lane discovered a legacy React crash after the preceding scorer pass. Independent RED execution of `corepack pnpm --filter web exec vitest run src/components/engine-panel.test.tsx` failed 1/1 with: `Objects are not valid as a React child (found: object with keys {direction, months_in_direction, regime})`. Evidence: `scorer-engine-red.log`. Coordinator notified before applying the fix. Backend PASS remains valid; UI regression verification pending.

Legacy EnginePanel GREEN: regression 1/1 PASS after rendering the trajectory direction as text and representing unknown as unpublished. Full frontend suite now **204/204 tests across 40 files PASS**. Workspace typecheck PASS. Evidence: `scorer-engine-green.log`, `scorer-web-204.log`, `scorer-typecheck-final.log`. This supersedes the earlier 203-test count.

## Final build and lint

- `cd app && corepack pnpm -r build`: PASS, including API `tsc -p tsconfig.build.json` and frontend production build. Final JS bundle 991.64 kB; existing non-blocking chunk-size advisory remains.
- `cd app && corepack pnpm --filter web lint`: PASS, exit 0, 15 warnings. A warning on new SnapshotSheet.tsx concerns exporting a shared label helper alongside components (Fast Refresh only). Other warnings are component-export patterns and the TanStack table React Compiler compatibility advisory; several are in unchanged files. No baseline lint was run, so remaining warnings are not all asserted pre-existing.
- No tests repeated for this build/lint-only handoff. Final test total remains API 25, web 204, Python 5, all passing.

Logs: `scorer-workspace-build-final.log`, `scorer-lint-final.log`.

Final labels-only extraction verified: frontend lint PASS with **14 warnings**, removing the new SnapshotSheet Fast Refresh warning. Frontend production build PASS again (`scorer-web-build-labels.log`). API compilation remains covered by the prior full workspace build PASS. Tests were not repeated for this behavior-preserving label extraction; last totals remain API 25, web 204, Python 5, all PASS. The final lint evidence is `scorer-lint-final.log`.

## Final accounting correction, automated verification only

No browser or computer-use tools were used in this follow-up; final manual UI acceptance is reserved to the user.

Compared live MotherDuck read-only SQL directly with the API on distinguishing cases:

- COMP_0042: 1,848 booked transactions, net -645204.15; 18 pending transactions (amount -652044.75) remain separate. The 1,503 NULL-status transactions (amount -1421752.44) do not enter booked monthly totals. API matches (floating-point representation differs below 0.001).
- COMP_0004 has 14 debt balance records. Cash is EUR 121401.46 from exactly 12 banking products; API matches and does not subtract debt from cash.
- COMP_0004 invoices: 287 pending plus 8 payment_in_progress = 295 pending bucket records; API matches.
- COMP_0038 invoices: 25 pending plus 8 paymentOrder = 33 pending bucket records; API matches.

Added persistent `api_json` assertions for COMP_0042 and COMP_0004 to XR-020. The original RED feature evidence remains above; these accounting assertions were added after the correction, so no pre-fix RED run is claimed for them.

Final API typecheck, 25 tests, API production build, and full live XR-020 feature check all PASS. Evidence: `scorer-api-typecheck-accounting.log`, `scorer-api-tests-accounting.log`, `scorer-api-build-accounting.log`, `scorer-live-accounting-final.log`, `scorer-company42.json`, `scorer-company4.json`. Direct comparison SQL ran against MotherDuck `hackspain_2026` through the read-only connector; source rows quoted above are the returned aggregates.
