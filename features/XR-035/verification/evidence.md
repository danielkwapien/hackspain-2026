# XR-035 · Evidencia

Medido el 19/09/2026 sobre `xr/XR-035-counterparties`, contra `md:hackspain_2026`
y con la aplicación levantada en 5173/8787.

## El check pasó de rojo a verde

Antes de escribir código, sobre la rama recién creada:

```
FAIL py_test core/tests/test_counterparties.py
ERROR: file or directory not found: core/tests/test_counterparties.py
```

Después:

```sh
bash evals/checks/XR-035.sh
EXIT=0
```

## Publicación

```sh
.venv/bin/python core/publish_counterparties.py --database md:hackspain_2026
{"companies": 730, "counterparty_rows": 79370, "month": "2026-08", "summary_rows": 1339}
```

Relectura independiente de `company_counterparty_summary`:

| Medida | Proveedores (ap) | Clientes (ar) |
|---|---:|---:|
| Sociedades | 723 | 616 |
| Mediana de contrapartes | 29 | 10 |
| Peso mediano de la mayor | 47,5 % | 60,4 % |
| Contrapartes efectivas | 3,3 | 2,1 |
| `eur_share` mediano | 1,00 | 1,00 |

Invariante comprobada en la publicación y en el check: los pesos suman 1 en las
1.339 parejas sociedad-lado, sin una sola excepción. El vencido vivo suma 1.066
millones de euros sobre 4.319 facturados; leyendo `status` como bandera serían
1,17 billones.

## API

```
GET /api/v2/companies/COMP_0001/counterparties?side=ap
  summary: n_counterparties 41, top1_weight 0.3796,
           effective_counterparties 4.32, eur_share 1
  items[0]: COUNTERPARTY_09820, 167.951,29 EUR, peso 0,38,
            days_late_w −19,86, sparkline de 12 puntos
```

| Caso | Respuesta |
|---|---|
| `side=zz` | 400 `invalid_query` |
| `sort=zz` | 400 `invalid_query` |
| `COMP_9999` | 404 `company_not_found` |
| Lado sin libro (`COMP_0404`, `ar`) | 200, `items: []`, `n_counterparties: 0` |

El resto del contrato v2 sigue en 200: `meta`, `universe`, `companies/:id`,
`companies/:id/signals`, `groups/:id`, `alerts`, `treemap`, `catalog/signals`.
La ruta es aditiva y no cambia la forma de ninguna respuesta existente.

## Pantalla

Verificado en Chrome, sin un solo error ni aviso en consola.

**Cobros → COMP_0001.** El pilar vale 29,9 puntos y es el más débil de la
empresa. Debajo, ahora, el porqué: **88,7 % de los cobros dependen de un solo
cliente que paga 59 días tarde**, con 50,8 k EUR vencidos y una minigráfica que
cae. Contrapartes efectivas: 1,3. Seis clientes en doce meses.

**Pago → COMP_0001.** Proveedores, peso de la mayor 38,0 %, contrapartes
efectivas 4,3, siete proveedores. Los desvíos son casi todos negativos —esta
empresa paga antes de vencimiento— salvo uno a +141 días.

**Orden por deterioro.** Reordena por días descendentes (+141, +39, +39, +34,
+26, +20, +19) y deja fijas las dos cifras de cabecera, que son del lado entero
y no del orden.

**Sin libro (`COMP_0002`).** «Sin proveedores en euros en la ventana». Ni tabla
vacía ni ceros de relleno, junto a los «No aplica» que la ficha ya enseñaba.

**Familias sin contraparte.** Liquidez, Deuda y Actividad quedan exactamente
como estaban; un test lo fija.

## Suites

| Suite | Resultado |
|---|---|
| `core` (sin `test_isolation`) | 30 pruebas |
| `app/api` | 48 pruebas |
| `app/web` | 384 pruebas |
| `pnpm typecheck` | limpio |
| `pnpm --filter web lint` | sin avisos nuevos |

## Lo que no hace

- No toca el score. Las contrapartes son evidencia junto al pilar, no entran en
  la fórmula. Si algún día entran, pasan por `evaluate.py`.
- No hay red de contrapartes: las 124.030 pertenecen cada una a una sola
  sociedad (máximo medido: 1), así que no se puede decir «este proveedor sirve a
  cuarenta de tus clientes» y la pantalla no lo insinúa.
- Solo se publica el mes de corte. Las doce mensualidades viajan en
  `sparkline_12`; materializar 24 meses multiplicaría por 24 unas 79.000 filas
  sin que nadie las pida.
