# Runbook del dashboard v1 (Embat · HackSpain 2026)

Cómo arrancar, verificar y regenerar la vertical v1: inventario Python → `app/exports/v1` → API Fastify →
web React. Todo vive bajo `app/` en la raíz del repositorio.

## 1. Requisitos

| Herramienta | Versión usada | Nota |
|---|---|---|
| Node | 24.19 | `corepack` ya incluye pnpm |
| pnpm | 11.21.0 | fijado en `app/package.json` (`packageManager`) |
| uv | 0.10.10 | `/Users/danik/.local/bin/uv`, Python ≥ 3.12 |
| Dataset | `embat-v2` | fuera del repo: `/Users/danik/projects/hackspain-2026-data/embat-v2/output` (solo lectura) |

Instalación de dependencias (una vez, desde `app/`):

```bash
cd app && corepack pnpm install
```

## 2. Regenerar `app/exports/v1` (comando exacto)

```bash
cd app/tools && uv sync && uv run python dataset_inventory.py --strict-counts --now 2026-09-18T20:45:00Z
```

- Duración real medida: **1,8 s**; salida: 1.286 ficheros de detalle, **10,65 MB** de JSON (≈13 MB en disco).
- `--now` fija `generated_at`: con el mismo `--now` la regeneración es **byte a byte idéntica** (idempotente).
- `--strict-counts` devuelve código 1 si los recuentos no cuadran con el dataset esperado
  (250 grupos / 1.286 sociedades / 2.556.437 movimientos / 897.894 facturas). Sin el flag solo avisa.
- `--data-dir` y `--out` son sobreescribibles; por defecto apuntan al dataset y a `app/exports/v1`.
- El proceso no sirve peticiones y solo escribe dentro de `--out`.
- Tests del inventario (fixture mínimo propio, no dependen del dataset completo):
  `cd app/tools && uv run pytest`.

## 3. API (`app/api`, Fastify, solo lectura)

```bash
cd app && corepack pnpm --filter api dev      # tsx watch, http://127.0.0.1:8787
cd app && corepack pnpm --filter api build    # tsc -> app/api/dist
cd app && corepack pnpm --filter api start    # node dist/server.js
```

| Variable | Defecto | Efecto |
|---|---|---|
| `PORT` | `8787` | Puerto de escucha (host `127.0.0.1`) |
| `EXPORTS_DIR` | `app/exports/v1` | Inventario que sirve la API |
| `FIXTURES_DIR` | `app/fixtures/v1` | Fixtures del modo demostración del monitor |

> Nota de entorno: en esta máquina el WebUI de Hermes escucha en `*:8787`, el mismo puerto por defecto de la
> API. La API se ata a `127.0.0.1`, así que las peticiones a `localhost:8787` llegan a la API, pero para una
> demo conviene evitar la ambigüedad: arranca la API con `PORT=8788` y el frontend con
> `VITE_API_URL=http://localhost:8788`. Comprueba antes quién ocupa el puerto con
> `lsof -nP -i :8787` y apaga la API al terminar (`lsof -nP -i :8788`).

Endpoints: `/health`, `/api/v1/manifest`, `/api/v1/groups`, `/api/v1/groups/:id`,
`/api/v1/companies` (filtros `group_id`, `q`, `sort`, `order`, `offset`, `limit`), `/api/v1/companies/:id`,
`/api/v1/monitor` y `/api/v1/monitor?demo=1`. CORS permitido a `http://localhost:5173` y `http://localhost:4173`.
Si no hay inventario, `/health` y el resto responden **503** `no_exports` con el comando de regeneración.

Comprobación rápida:

```bash
curl -s localhost:8787/health
curl -s 'localhost:8787/api/v1/companies?limit=3'
curl -s localhost:8787/api/v1/companies/COMP_0001
curl -s localhost:8787/api/v1/monitor            # bandeja vacía, sin fixtures
curl -s 'localhost:8787/api/v1/monitor?demo=1'   # fixture con banner DEMO
```

## 4. Web (`app/web`, React + Vite)

```bash
cd app && corepack pnpm --filter web dev       # http://localhost:5173
cd app && corepack pnpm --filter web build     # tsc -b && vite build -> app/web/dist
cd app && corepack pnpm --filter web preview   # http://localhost:4173
```

`VITE_API_URL` sobreescribe la URL de la API (defecto `http://localhost:8787`).
Antes de una demo: `corepack pnpm install` y API en marcha; sin API la UI muestra el estado de error con
la causa y el botón de reintentar.

## 5. Verificación (todo desde `app/`)

```bash
corepack pnpm install        # si falta node_modules
corepack pnpm typecheck      # api + web
corepack pnpm test           # api (vitest, 8 tests) + web (vitest + testing-library, 6 tests)
corepack pnpm build          # api (tsc) + web (vite build)
cd tools && uv run pytest    # inventario (5 tests)
```

Al terminar una comprobación manual, no dejes servidores vivos (el orquestador usa después 5173 y el puerto
de la API): `lsof -nP -i :5173 -i :8787 -i :8788 -i :8797` y apaga lo que hayas arrancado.

## 6. Versiones fijadas (verificadas contra el registro el 18/09/2026)

| Paquete | Versión | Motivo |
|---|---|---|
| react / react-dom | 19.2.x | último estable |
| vite | 8.3.x | scaffold actual |
| typescript | ~6.0.2 | versión que usa el scaffold de Vite; `baseUrl` ya está deprecado, los alias `@/*` van sin él |
| tailwindcss + @tailwindcss/vite | 4.3.x | CSS-first (`@theme`), sin `tailwind.config` |
| shadcn CLI | 4.21 | `init -t vite -b radix -p nova`; los componentes importan `cn` del paquete `cn` |
| recharts | 3.8.0 | lo fija el componente `chart` de shadcn |
| react-router | 7.18.x | la línea 7 es la que pide el contrato de la lane (existe 8.x; no se usa) |
| @tanstack/react-query | 5.103.x | caché de datos remotos |
| vitest | 5.0.x | API (node) y web (jsdom) |
| polars | 1.44.x | inventario Python |
| fonts | `@fontsource-variable/geist` + `geist-mono` 5.3.x | self-hosted, sin CDN |

## 7. Decisiones tomadas en esta rama

1. **Bucket mensual por `date`** (fecha de apunte del banco), no por `value_date`: es la fecha que fija el
   mes de la serie y el corte. `transactions.date` y `invoices.issuance_date` definen el mes.
2. **Moneda de cada movimiento derivada del producto** (`banking_products` ∪ `debt_products` por
   `product_id`); si un `product_id` no aparece, la moneda publicada es `UNKNOWN` y se cuenta en las notas.
3. **Flujos solo con `status=booked`**; los `pending` se cuentan aparte (`n_tx_pending`) y las filas sin
   estado no entran en ninguna serie (29.839 filas).
4. **`2026-09` es un mes parcial** (1 día de datos): cada fila mensual lleva `partial: true` y no es
   comparable con un mes completo.
5. **Signos de deuda tal cual**: `granted` y `outstanding` son valores actuales de la extracción, con signo
   negativo; no son series y no se transforman ni se agregan.
6. **Sin FX**: no se convierte ni se consolida ninguna moneda; todas las agregaciones son por moneda.
   `exchange_rate` tiene sentido y moneda base sin verificar.
7. **`snapshot.balance_total_by_currency` suma solo productos bancarios** (caja observada por moneda); las
   posiciones de deuda se exponen por producto con su `outstanding`.
8. **`pending_amount_sum` no lleva dirección**: `invoices.csv` mezcla `document_type` sin separación
   emitida/recibida verificada; el aviso viaja en `monthly_invoices.direction_note`.
9. **País normalizado** (`ES`/`ESPAÑA`/`España`/`ESPANYA`/`Espanya` → `ES`, `Portugal` → `PT`); 1.056 de
   1.286 sociedades no traen país y se publican como `null`.
10. **Estados de factura agrupados** en `n_paid` / `n_overdue` / `n_pending` (`pending`, `payment_in_progress`,
    `paymentOrder`, `shipped`) / `n_cancel`.
11. **Sin motor de score**: toda entidad es `pending_engine` con `score: null`; los fixtures de
    `app/fixtures/v1` solo se sirven con `?demo=1` y nunca sustituyen a resultados reales.
12. **`app/` como raíz del workspace pnpm** (`api` + `web`), con `allowBuilds: esbuild` en
    `app/pnpm-workspace.yaml` (pnpm 11 ya no lee el campo `pnpm` de `package.json`).
