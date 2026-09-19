# core/

El motor de score, la capa de datos y las señales. Nada de aquí lee ni escribe
dentro de `app/`: el cálculo se mantiene desacoplado de la aplicación.

## Mapa

```
datastore/   acceso al dataset: catálogo, caché Parquet, validación
signals/     señales por pilar + las cinco perspectivas estratégicas
engine/      el motor por capas: familias → nivel → ajustes → techos
pipeline_embat.py   motor temporal por GRUPO
enrich.py           añade al JSON del motor lo que la API publica
publish.py          sube la publicación a MotherDuck
evaluate.py         métricas sin etiqueta, para comparar dos versiones
```

Documentación por paquete: [`datastore/README.md`](datastore/README.md) ·
[`signals/README.md`](signals/README.md) · [`engine/README.md`](engine/README.md).
Contrato de publicación: [`features/XR-033/publication-contract.md`](../features/XR-033/publication-contract.md).

## Ejecución

```bash
.venv/bin/python core/pipeline_embat.py     # 250 grupos × 24 meses → outputs/scores_embat.json
.venv/bin/python core/enrich.py             # → outputs/scores_embat_enriched.json
.venv/bin/python core/publish.py            # publica en MotherDuck
.venv/bin/python core/evaluate.py           # métricas → outputs/evaluation.json
.venv/bin/python -m pytest core/tests/ -q   # 74 tests
```

Ninguno exige argumentos. En PyCharm basta con abrir el fichero, elegir un intérprete con
`duckdb` y `pandas`, y pulsar **Run**. Los argumentos de `--help` existen para el test
oculto y las verificaciones:

```bash
.venv/bin/python core/pipeline_embat.py --data-root /ruta/al/test --no-cache
```

`core/outputs/` está en `.gitignore`: son artefactos que se regeneran en segundos.

## El motor

Por **grupo** (250), con 24 meses point-in-time: la fila del mes M solo usa hechos de fecha
≤ M. `pipeline_embat.py` prepara el panel, `signals/` calcula los valores crudos y `engine/`
los convierte en score y en la frase que lo explica.

`signals/active.py` es el único fichero que hay que editar **juntos**: es donde se decide que
un experimento pasa a formar parte del score oficial.
