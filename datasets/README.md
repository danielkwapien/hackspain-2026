# datasets/

Dataset oficial del reto de Embat en HackSpain 2026 («X-Ray»), tal como lo entregó la
organización el 18/09/2026. La descripción de campos está en [`data_dictionary.md`](data_dictionary.md).

## Contenido

| Fichero | Filas | Nota |
|---|---|---|
| `groups.csv` | 250 | Un grupo empresarial por fila |
| `companies.csv` | 1.286 | `company_id` es la clave que cruza todo |
| `banking_products.csv` | 5.987 | Cuentas bancarias |
| `debt_products.csv` | 2.239 | Financiación, con `granted` y `outstanding` |
| `debt_schedule_config.csv` | 87 | Cuadros de amortización |
| `balances.csv` | 7.996 | Foto de saldos a 2026-09-01 |
| `invoices.csv.gz` | 897.894 | Facturas del ERP. **Comprimido** (172 MB en claro) |
| `transactions_2024-09_2025-08.csv.gz` | 803.121 | Movimientos con `date < 2025-09-01` |
| `transactions_2025-09_2026-02.csv.gz` | 704.797 | Movimientos con `2025-09-01 ≤ date < 2026-03-01` |
| `transactions_2026-03_2026-09.csv.gz` | 1.048.519 | Movimientos con `date ≥ 2026-03-01` |

`transactions.csv` original (2.556.437 filas, 472 MB) está partido por fecha en tres ficheros
gzip porque GitHub rechaza ficheros de más de 100 MB. Los tres llevan cabecera y juntos son
el fichero original sin modificar ninguna fila.

## Cómo cargarlo

No hace falta descomprimir. DuckDB, pandas y polars leen gzip directamente:

```sql
-- DuckDB
SELECT * FROM read_csv('datasets/transactions_*.csv.gz', header=true, union_by_name=true);
SELECT * FROM read_csv('datasets/invoices.csv.gz', header=true);
```

```python
# pandas
import pandas as pd, glob
tx = pd.concat(pd.read_csv(f) for f in sorted(glob.glob('datasets/transactions_*.csv.gz')))
```

Para reconstruir el CSV original en claro (no lo subas al repo, está en `.gitignore`):

```bash
{ zcat datasets/transactions_2024-09_2025-08.csv.gz; zcat datasets/transactions_2025-09_2026-02.csv.gz | tail -n +2; zcat datasets/transactions_2026-03_2026-09.csv.gz | tail -n +2; } > datasets/transactions.csv
```

## Hechos que conviene saber antes de tocarlo

- **No hay fichero ni columna de resultado / etiqueta / split.** Son exactamente los 8 CSV que
  lista el brief más el diccionario. El «test oculto» de 60–80 grupos lo guarda Embat.
- Los campos de texto (`description`, `concept`) llevan placeholders (`[COMPANY]`, `[REF]`,
  `COUNTERPARTY_xxxxx`…); ver el diccionario.
- `country` está vacío en ~82 % de las empresas y, cuando existe, viene sin normalizar
  (`ES`, `ESPAÑA`, `España`, `Spain`…).
- En `debt_products.csv` los importes `granted` y `outstanding` vienen **negativos**.
- `wc -l` no coincide con el número de filas porque `description` y `concept` contienen
  saltos de línea entre comillas. Usar un parser CSV, no `split('\n')`.
