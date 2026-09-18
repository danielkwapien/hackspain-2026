# app/exports/v1/results — resultados del motor analítico (vacío)

Aquí publicará el pipeline analítico (`data-analysis/`) un fichero por entidad,
`results/<entity_id>.json`, con el contrato de la §3 de `docs/dani/contrato-dashboard-v1.md`
(versión de contrato `dashboard-v1`) cuando exista motor de score.

Reglas de consumo en `app/api`:

- Si existe `results/<companyId>.json` con `status: "available" | "partial" | "insufficient_data"`,
  la API lo expone como `engine` en el detalle de sociedad y funde su resumen en el listado.
- Si no existe el fichero, `engine = { "status": "pending_engine", "score": null, ... }`. La UI
  muestra «Pendiente de cálculo».
- `insufficient_data` no lleva número; `partial` lo lleva con aviso de cobertura.

Este directorio está vacío a propósito: no se generan resultados sintéticos ni de relleno.
