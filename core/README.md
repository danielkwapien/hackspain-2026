# core/

Los dos motores de score, la capa de datos y las señales. Nada de aquí lee ni escribe
dentro de `app/`: el cálculo se mantiene desacoplado de la aplicación.

## Mapa

```
datastore/   acceso al dataset: catálogo, caché Parquet, validación
signals/     señales por pilar + las cinco perspectivas estratégicas
engine/      el motor por capas: familias → nivel → ajustes → techos
pipeline_embat.py   motor temporal por GRUPO (el principal)
pipeline.py         baseline estático por sociedad
evaluate.py         métricas sin etiqueta, para comparar dos versiones
```

Documentación por paquete: [`datastore/README.md`](datastore/README.md) ·
[`signals/README.md`](signals/README.md) · [`engine/README.md`](engine/README.md).
Estado del proyecto y siguientes pasos: [`ROADMAP.md`](ROADMAP.md).

## Ejecución

```bash
.venv/bin/python core/pipeline_embat.py     # 250 grupos × 24 meses → outputs/scores_embat.json
.venv/bin/python core/pipeline.py           # 1.286 sociedades, foto → outputs/scores.json
.venv/bin/python core/evaluate.py           # métricas → outputs/evaluation.json
.venv/bin/python -m pytest core/tests/ -q   # 12 tests
```

Ninguno exige argumentos. En PyCharm basta con abrir el fichero, elegir un intérprete con
`duckdb` y `pandas`, y pulsar **Run**. Los argumentos de `--help` existen para el test
oculto y las verificaciones:

```bash
.venv/bin/python core/pipeline_embat.py --data-root /ruta/al/test --no-cache
```

`core/outputs/` está en `.gitignore`: son artefactos que se regeneran en segundos.

## Motor temporal — el principal

Por **grupo** (250), con 24 meses point-in-time: la fila del mes M solo usa hechos de fecha
≤ M. `pipeline_embat.py` prepara el panel, `signals/` calcula los valores crudos y `engine/`
los convierte en score y en la frase que lo explica.

`signals/active.py` es el único fichero que hay que editar **juntos**: es donde se decide que
un experimento pasa a formar parte del score oficial.

## Baseline estático

`pipeline.py` + `scoring.py`: una foto por **sociedad** a `2026-09-01`, sin trayectoria.
Combina liquidez, utilización de líneas, mora y comportamiento de pago. `scoring.py` son
funciones puras y sus umbrales; `pipeline.py` lee, valida, agrega y exporta.

Sirve de contraste con el motor temporal: mismas anclas, menos información.
