# app/tools

Herramientas batch del dashboard. Ninguna sirve peticiones: se ejecutan una vez y escriben
ficheros que la API y el front leen después.

- `dataset_inventory.py`: inventario del dataset Embat -> `app/exports/v1` (contrato v1).
- `gen_health_reports.py`: informes de Health con Claude -> `app/api/data/reports/<id>.json`.

## Informes de Health

Con la API v2 levantada en `:8787` sobre el mock y `ANTHROPIC_API_KEY` en el entorno:
`uv run --group reports python gen_health_reports.py` (o `--dry-run` para ver los prompts sin
llamar a Claude). Escribe un JSON por empresa de `REPORT_COMPANIES`; nunca corre en CI ni tests.

## Tests

```bash
uv run pytest -q
```
