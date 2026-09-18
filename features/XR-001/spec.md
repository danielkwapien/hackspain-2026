---
feature: XR-001
depends_on: []
parallel: true
conflicts_with: []
lane: amplio
verify: evals/checks/XR-001.sh
max_attempts: 3
---
# Spec: XR-001

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

Plan completo de la sesion: `plans/XR-001-mock-dataset/PLAN.md` (gitignored).
Contrato de datos: `plans/00-reference/mock-data-contract.md`.
Diseno del motor: `docs/alfonso/ENGINE-EMBAT.md` §4, §5, §6, §7, §8, §11.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-001: <item>") y termina la pasada.

## 1. Objetivo

`datasets_mocked/` contiene el dataset completo, determinista y coherente con las
invariantes del motor X-Ray (score, pilares, senales, drivers, regimen, outlook,
alertas, narrativas, grupos, frames) para las 1.286 empresas y 250 grupos reales
durante 24 meses, y `app/api` lo sirve con endpoints `/api/v2/*` que la UI
consumira sin cambios cuando llegue el motor real.

## 2. Comportamiento (escenarios verificables)

- DADO las formulas de ENGINE §5-§8 CUANDO se ejercitan las funciones puras de
  `datasets_mocked/xray_mock/core.py` (normalizacion por anclas y percentil,
  pilar renormalizado, nivel, penalizacion, caps de dos meses, bandas,
  contribuciones aditivas, descomposicion del delta, Theil-Sen, reglas de
  regimen con histeresis, outlook, confianza, presupuesto y cool-down de
  alertas) ENTONCES `datasets_mocked/tests/test_core_formulas.py` pasa entero.
- DADO el dataset generado en `datasets_mocked/` CUANDO se comprueban las siete
  invariantes del contrato mas la suma de pesos, el dominio de `regime`, el
  presupuesto de alertas, la cobertura de `frames/` y el determinismo con
  `--seed 42` ENTONCES `datasets_mocked/tests/test_mock_invariants.py` pasa entero.
- DADO `datasets_mocked/exports/v1/` CUANDO se validan `results/*.json` contra el
  contrato `dashboard-v1` (§3 de `docs/dani/contrato-dashboard-v1.md`) mas la
  extension `xray` y el `manifest.json` con `data_kind: "mock"` ENTONCES
  `datasets_mocked/tests/test_exports_contract.py` pasa entero.
- DADO las fixtures fijas de `app/api/test/fixtures/v2/` CUANDO se ejercitan los
  endpoints `/api/v2/universe`, `/companies/:id`, `/companies/:id/signals`,
  `/companies/:id/timeline`, `/groups/:id`, `/alerts`, `/treemap`, `/frames`,
  `/catalog/signals`, `/meta` y `/health` ENTONCES `app/api/test/v2.test.ts` pasa
  entero (y `app/api/test/app.test.ts` sigue en verde).
- DADO la API arrancada con `EXPORTS_DIR=datasets_mocked/exports/v1` CUANDO se
  pide `GET /api/v2/meta` ENTONCES responde `data_kind == "mock"`.
- DADO la misma API CUANDO se pide `GET /api/v2/companies/COMP_1267` ENTONCES
  responde con al menos 3 drivers.

## 3. Fuera de alcance

- `app/web`: no se toca ni un fichero.
- El inventario real `app/exports/v1/` no se regenera ni se modifica.
- El contrato v1 (`/api/v1/*`, `/health`, `/api/v1/monitor`) no cambia de forma:
  solo se le anade la lectura de `data_kind` cuando el directorio servido es mock.
- `datasets/` es solo lectura.
- Nada de FX fila a fila: la consolidacion de grupo usa la tabla constante de
  ENGINE §3.3.
- Nada de LLM: las narrativas son plantillas deterministas.
- `evals/` y `TASKQUEUE.md` son intocables para el builder.

## 4. Verificacion

- [ ] bash evals/smoke.sh          → exit 0
- [ ] bash evals/checks/XR-001.sh  → exit 0   # nacio en rojo sobre main
- [ ] evidencia en `plans/XR-001-mock-dataset/evidence/`: `checks.txt`,
      `generation.log`, `sample-COMP_1267.json`, `sample-universe.json`

Nota operativa: el check exporta `EXPORTS_DIR` al mock y fija `PORT`/`API_URL` en el
8791 antes de las dos lineas `api_json`. El 8787 lo usan otras sesiones y el WebUI local,
y `ensure_server` reutiliza cualquier cosa que ya escuche ahi (serviria el inventario real
en vez del mock y el check fallaria culpando al builder): por eso el check tiene puerto
propio y no depende de que el 8787 este libre.

## 5. Prioridades (de arriba abajo)

1. `xray_mock/catalog.py` + `xray_mock/core.py` con las 28 senales y las
   funciones puras del motor; `test_core_formulas.py` en verde.
2. `xray_mock/real_inputs.py`: DuckDB sobre `datasets/*.csv` y `*.csv.gz`, cache
   parquet en `datasets_mocked/.cache/`.
3. `xray_mock/simulate.py` + `narrative.py` + `export.py` + `generate_mock.py`
   (CLI `--seed --data-dir --out --inventory --limit --now`).
4. Generacion completa (1.286 empresas, 250 grupos, 24 meses) con frames y
   `exports/v1`; `test_mock_invariants.py` y `test_exports_contract.py` en verde.
5. API v2 en `app/api`: loader de tablas v2, los diez endpoints, `app/api/test/v2.test.ts`
   con las fixtures committeadas, `docs/api/v2.md` y `docs/api/examples/*.json`.
6. `datasets_mocked/README.md` (que es real, que es sintetico, como regenerar,
   como apuntar la API) y evidencia.
