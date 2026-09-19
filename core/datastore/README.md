# datastore

Capa de acceso al dataset. Un solo sitio que sabe qué ficheros hay, qué
columnas tienen y de qué tipo son.

## Uso

```python
from datastore import DataStore, ParquetCache, validate

store = DataStore()                 # datasets/ por defecto
ParquetCache(store).warm()          # materializa las 8 tablas (2s la primera vez)
validate(store)                     # levanta excepción si el dataset no sirve
store.con.sql("SELECT count(*) FROM transactions")
```

## Raíz configurable

**Es lo que permite ejecutar el pipeline sobre los datos de la organización sin
tocar código.** Prioridad: argumento explícito → `EMBAT_DATA_ROOT` → `datasets/`.

```bash
.venv/bin/python core/pipeline_embat.py --data-root /ruta/al/test --no-cache
EMBAT_DATA_ROOT=/ruta/al/test .venv/bin/python core/pipeline_embat.py
```

## Por qué cada pieza

**`catalog.py`** — tipos declarados, no inferidos. La inferencia por muestreo
se equivoca en varias columnas y un tipo mal inferido no falla: produce números
equivocados en silencio. Declarar los tipos además destapó que `description` y
`concept` llevan comillas dobladas dentro del campo, y que con autodetección el
mismo fichero se lee o se rompe según qué columnas se pidan. Las opciones de
parseo están fijadas.

**`cache.py`** — Parquet columnar y tipado. El pipeline pasa de 21 s a 2,4 s.
Se invalida sola con la huella (nombre, tamaño, mtime) de los ficheros de
origen y la raíz. Escribe a temporal y renombra, así que una ejecución
interrumpida no deja un Parquet a medias. Vive en `core/.cache/`, está
gitignorada y se puede borrar.

**`validate.py`** — separa lo que ya sabemos que trae el dataset de lo que sería
una sorpresa. Paran la ejecución: ficheros o columnas que faltan, tablas
vacías, claves duplicadas, claves que no cruzan. Se informan y siguen: la
columna vacía de `balances`, las fechas imposibles, las facturas no pagadas con
`payment_date`, el 25 % sin categoría. Hoy: **0 errores, 4 avisos**.

## Determinismo

Los importes se redondean a céntimos en cada agregación. DuckDB suma en
paralelo y la suma en coma flotante no es asociativa: sin redondear, el mismo
fichero daba totales distintos entre ejecuciones (~1e-4 sobre saldos de 1e11),
suficiente para cruzar un ancla y mover el score 25 puntos.

`core/tests/test_isolation.py` comprueba las dos propiedades que de verdad
importan para la entrega: que dos ejecuciones coinciden, y que **el score de un
grupo no cambia cuando el fichero trae menos grupos**.
