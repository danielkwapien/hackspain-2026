# Datos del reto en MotherDuck

Carga completada el 19 de septiembre de 2026. Base `hackspain_2026`, esquema `main`.
Conexión del cliente DuckDB: `md:hackspain_2026`.

## Fuentes y tablas

Los ocho CSV proceden de `/Users/danik/Downloads/output_hackspain_data.zip`, no de los mocks del repositorio. Son datos sintéticos oficiales del reto, no empresas reales.
Los scores proceden de `core/outputs/scores.json`; se importan sin recalcularlos.

| Tabla | Filas |
| --- | ---: |
| groups | 250 |
| companies | 1.286 |
| banking_products | 5.987 |
| debt_products | 2.239 |
| debt_schedule_config | 87 |
| balances | 7.996 |
| invoices | 897.894 |
| transactions | 2.556.437 |
| scores | 1.286 |
| score_exports | 1 |

Los nombres y columnas de los CSV se conservan. Los importes y tipos de cambio se almacenan como `DECIMAL(38,12)`, sin conversión intermedia a coma flotante. Las fechas originales sin zona horaria son `TIMESTAMP`; no se asume UTC. Los campos vacíos del CSV son NULL.

`scores` contiene `company_id`, `contract_version`, `model_version`, `data_version`, `cutoff_date`, `status`, `score`, `band` y `payload`. El campo `payload` conserva el JSON completo de cada resultado, incluidos factores, métricas, trayectoria, meses, alertas y calidad. `score` es `DECIMAL(5,2)` y puede ser NULL.

`score_exports` conserva la cabecera del JSON en columnas y en `metadata`, incluyendo `count`, `schema_version` y `generated_at` con zona horaria.

Esta exportación es **static-baseline-v1**, datos **embat-v2**, corte **2026-09-01**, generada **2026-09-18 23:53:32.723568 UTC**. No es el modelo temporal por grupo de las notas de investigación. Estados: 720 partial, 110 available, 456 insufficient_data. Un score NULL no debe sustituirse por cero.

## Consultas para la siguiente fase

```sql
SELECT c.company_id, c.group_id, s.score, s.band, s.status, s.payload
FROM hackspain_2026.main.companies c
LEFT JOIN hackspain_2026.main.scores s USING (company_id)
WHERE c.company_id = 'COMP_0001';
```

En Fastify, parametrizar los valores en vez de concatenarlos. Mantener el token de MotherDuck exclusivamente en el servidor. Los valores DECIMAL y BIGINT deben serializarse deliberadamente según el contrato de la API; no asumir que el driver devuelve números JavaScript.

## Anomalías originales conservadas

- 1.314 movimientos y 29 balances apuntan a productos ausentes de ambos catálogos. Usar LEFT JOIN si se enriquece el detalle para no perder estas filas.
- 183.627 movimientos corresponden a productos de deuda. El catálogo de productos debe incluir `banking_products` y `debt_products`.
- 10 configuraciones de deuda tienen cuenta de liquidación ausente del catálogo bancario.
- Las facturas contienen fechas extremas: vencimientos hasta 7025 y pagos hasta 6913. Hay 8 fechas valor de movimientos en 2099. Conservar el original y aplicar una política explícita de corte en las métricas, sin normalizar silenciosamente.
- Los importes de deuda pueden ser negativos. No invertir el signo durante la lectura sin atender a su significado.
- No se han impuesto claves foráneas que rechacen las referencias huérfanas originales.

## Verificación

Recuentos locales y remotos coinciden para las diez tablas. Se comprobó una consulta real empresa-score: `COMP_0001`, grupo `GROUP_0147`, score `54.93`, estado `partial`.

Totales remotos contrastados con el preparado:

| Campo | Total exacto |
| --- | ---: |
| transactions.amount | 8539630339.50 |
| invoices.amount | 24118395654.93 |
| invoices.pending_amount | 8355946670.76 |
| balances.balance | 104750994216.23 |
| debt_products.outstanding | -1588849175.61 |

La comparación canónica de los 1.286 payloads locales contra scores.json dio cero diferencias. La huella agregada local/remota coincide: `3d60a65ce7d564ad4cd182c27e3454a5`, obtenida mediante `md5(string_agg(payload::varchar, '' order by company_id))`.

## Copia de carga local

Artefactos de sesión en `plans/supabase-import/` (gitignored):

- `prepare.py`: prepara la copia local a partir de los CSV extraídos y scores.json. Ejecutar desde la raíz con `uv run plans/supabase-import/prepare.py`. Reemplaza únicamente sus tablas y exports locales.
- `hackspain.duckdb`: copia local completa, aproximadamente 273 MiB.
- `upload/*.parquet`: archivos individuales tipados, aproximadamente 147 MiB en total, utilizables en Add data del panel.
- `upload/manifest.json`: recuentos y SHA-256 de las fuentes.

La subida se hizo desde el cliente local con `CREATE DATABASE hackspain_2026 FROM '<ruta absoluta>/hackspain.duckdb'`. No volver a ejecutarlo contra la misma base para reemplazar datos; cualquier actualización posterior debe planificarse explícitamente.

Fastify ya consulta esta fuente en los contratos V1 y V2; ver la sección de integración XR-020.

Un segundo agente contrastó directamente los importes y nulls de los CSV originales contra el preparado y la nube: PASS. La revisión adversaria confirmó que las referencias huérfanas y fechas extremas proceden del origen; el preparador se ajustó para permitir reejecuciones locales.

## Integración Fastify (XR-020)

Fastify consulta MotherDuck por defecto. Los contratos `/api/v1/*` y `/api/v2/*` comparten la misma fuente; no se lee `datasets_mocked` en ese modo. La configuración local para tests/fixtures requiere `DATA_SOURCE=local` o `buildApp({exportsDir: ...})` explícito.

Configurar `app/api/.env` (gitignored; permiso recomendado 600) con `MOTHERDUCK_TOKEN`. No colocar el token en variables `VITE_*`. El servidor carga ese fichero tanto en desarrollo como desde `dist/server.js`. El destino de esta integración es `md:hackspain_2026`.

Arranque habitual desde la raíz:

```sh
cd app
corepack pnpm dev
```

Web: `http://localhost:5173`. API: `http://localhost:8787`. Una conexión ausente o fallida devuelve 503 `source_unavailable`; no se sustituyen datos por mocks. La carga del snapshot se comparte entre peticiones y tiene caché de 60 segundos. Consultas de detalle parametrizadas por empresa; imports y consultas no alteran los scores.

La interfaz muestra «Dataset del reto» y una ficha específica del baseline con sus cuatro factores. Las empresas con score NULL siguen en el universo. No se publican puntuaciones consolidadas de grupo, variaciones ni previsiones inexistentes. El mapa usa área uniforme por empresa porque no hay cobros consolidados en moneda comparable. Los productos desconocidos se conservan con moneda `UNKNOWN` cuando no puede resolverse; esa agrupación no debe interpretarse como una moneda convertible.

Los recuentos de movimientos/facturas describen los ficheros completos. Actividad mensual y saldos se limitan al corte. Cobertura de actividad: meses con actividad sobre los 25 meses naturales que toca la ventana 2024-09-01 a 2026-09-01; el último es parcial. Esto es distinto de la cobertura de factores del score.

Por petición de Dani se detuvo y desactivó únicamente el LaunchAgent `ai.hermes.webui`, que ocupaba el puerto 8787. El resto de servicios de Hermes no se modificaron. Su plist permanece disponible para reactivación posterior; antes de reactivarlo deberá liberarse o cambiarse ese puerto.

Las series de actividad suman solo `booked`; pendientes se cuentan aparte y las filas sin estado no se incluyen en los flujos. «Caja observada» incluye únicamente productos bancarios, sin netear deuda; el detalle conserva los balances de los demás productos. Los estados `payment_in_progress`, `paymentOrder` y `shipped` se agrupan junto a `pending` en el gráfico de facturas, manteniendo el contrato del inventario original.
