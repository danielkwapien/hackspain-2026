# Flujo del pipeline

El punto de entrada es `core/pipeline_embat.py`. Se puede ejecutar sin parámetros:

```bash
python core/pipeline_embat.py
```

## Flujo de datos

```text
datasets/*.csv y *.csv.gz
        ↓
DuckDB valida tipos y campos
        ↓
core/.cache/*.parquet
        ↓
panel común: grupo × mes
        ↓
core/signals/*
        ↓
scoring y trayectoria
        ↓
core/outputs/scores_embat.json
```

Los CSV de `datasets/` son la fuente original. En la primera ejecución se convierten a una caché Parquet;
en las siguientes se reutiliza mientras los originales no cambien.

El panel contiene una fila por grupo y mes. Consolida sociedades, elimina transferencias internas
identificadas, reconstruye la caja mensual y calcula agregados de movimientos, facturas y deuda. Cada fila
solo utiliza información disponible hasta ese mes.

Las señales reciben ese panel común y devuelven un valor por fila. `active.py` decide cuáles participan y
`engine/` las normaliza y combina en un nivel. Sobre ese nivel, `signals/group_signals.py` calcula las cinco
perspectivas estratégicas, y una segunda pasada del motor las aplica como ajustes acotados antes de los
techos. Finalmente se genera un único JSON con los 250 grupos y su serie de 24 meses. Septiembre de 2026 se excluye porque solo contiene un día de datos.
