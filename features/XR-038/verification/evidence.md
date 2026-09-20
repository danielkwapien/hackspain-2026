# XR-038 · Verificacion

Todo lo de aqui es salida real pegada. Lo que falle se pega con su error.

## Entorno

Worktree `/Users/alfonsomayoral/Developer/hackspain-embat-XR-038`, rama
`xr/XR-038-kima-ui-2`, nacida de `main` en `606af7b`.

Servidores levantados **desde este worktree** contra MotherDuck real, en puertos
libres: **API 8790**, **web 4180**. Los 8787/5173 son la sesion del Gate sobre
`main`: con ellos `ensure_server` habria reutilizado servidores de otra rama y el
check habria salido verde en falso.

```
--- API ---
200
--- WEB ---
200
--- logs api ---
{"level":30,...,"msg":"Server listening at http://127.0.0.1:8790"}
{"level":30,...,"port":8790,"source":"motherduck","msg":"Read-only API ready"}
--- logs web ---
  VITE v8.3.0  ready in 928 ms
  ➜  Local:   http://localhost:4180/
```

## Criterio 17 · Las diez tablas del reto, intactas

`SELECT count(*)` sobre `md:hackspain_2026`, 2026-09-20:

| tabla | filas | esperado |
|---|---:|---:|
| balances | 7996 | 7.996 |
| banking_products | 5987 | 5.987 |
| companies | 1286 | 1.286 |
| debt_products | 2239 | 2.239 |
| debt_schedule_config | 87 | 87 |
| groups | 250 | 250 |
| invoices | 897894 | 897.894 |
| score_exports | 1 | 1 |
| scores | 1286 | 1.286 |
| transactions | 2556437 | 2.556.437 |

Las diez cuadran. XR-038 solo lee: ningun endpoint nuevo publica nada.

Re-medido al terminar los once commits, por si algo hubiera escrito: **las diez idénticas**
(`balances` 7996 · `banking_products` 5987 · `companies` 1286 · `debt_products` 2239 ·
`debt_schedule_config` 87 · `groups` 250 · `invoices` 897894 · `score_exports` 1 ·
`scores` 1286 · `transactions` 2556437).

## `evals/smoke.sh` (criterio 16)

```
smoke: lock adquirido (05:18:42)
== smoke: corepack pnpm typecheck ==
api typecheck: Done
web typecheck: Done
== smoke: corepack pnpm test ==
api test:  Test Files  8 passed (8)
api test:       Tests  74 passed (74)
web test:  Test Files  77 passed (77)
web test:       Tests  553 passed (553)
== smoke: corepack pnpm --filter web build ==
✓ built in 258ms
== smoke: uv run pytest -q (app/tools) ==
smoke: OK (05:18:59)
```

## `evals/checks/XR-038.sh`

```
API_URL=http://localhost:8790 BASE_URL=http://localhost:4180 bash evals/checks/XR-038.sh
== XR-038: F0 ==   (tokens y keyframes)
== XR-038: F1 ==   (los tres endpoints)
== XR-038: F2 ==   (tipografia y limpieza)
== XR-038: F3 ==   (estructura)
== XR-038: F4 ==   (las tres tablas)
== XR-038: F5 ==   (Operar)
== XR-038: F6 ==   (metodologia)
== XR-038: F7 ==   (cabecera de Cartera)
== XR-038: invariantes ==
XR-038: OK
EXIT=0
```

Cada fase escribio su trozo del check y **lo vio en rojo antes de implementar**. Un
ejemplo, F1 (los endpoints), contra la API real:

```
FAIL api_json /api/v2/companies/COMP_0169/cash .items | length == 6
curl -o /dev/null -w '%{http_code}' http://localhost:8790/api/v2/companies/COMP_0169/cash -> 404
```

## Los 17 criterios, verificados por un agente que no construyo nada

Veredicto **17/17 PASA**. Condujo Chromium por CDP contra el frontal levantado y midio el
DOM; no leyo codigo. Lo que sostiene cada uno:

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Seis insignias + regimen | `chipCount=6`, `fontSize=12px`, regimen en span aparte con `text-regime-recovering` |
| 2 | Sin ERP, cinco insignias | `COMP_0002` → `erp:null`; 5 chips, sin hueco ni «—» |
| 3 | Score a 30 px con unidad | `81,1` computado a `30px`; `textAlign: center`; `81,1 pts (▲ +41,1 pts)` |
| 4 | Conclusion fuera de capsula | `<span class="line-clamp-2 text-[length:var(--text-body)] …">Crece sin mora</span>` + `aria-label="Definicion de Conclusion"` |
| 5 | Contexto a ancho completo | cuatro cards apiladas, cada una al ancho del widget |
| 6 | Grafica a 252 px | `chartHeights` incluye `252px`, constante |
| 7 | Sin linea de pilar, toggle ancho | las cinco familias en mayusculas a lo ancho; sin la linea de cobertura |
| 8 | Las tres tablas | `/cash`: 6 items, 5 bancos, EUR 217.665,33; Deuda 10 filas; Actividad ninguna fecha posterior a `01/08/2026` |
| 9 | Sin deuda, estado vacio | `COMP_0001` → `items:[]` y «Sin productos de financiacion registrados», sin ceros |
| 10 | Sin marcadores de anonimizacion | el contrato de `/activity` no trae `description`; columnas Fecha/Categoria/Banco·producto/Importe/Estado, con «Sin clasificar» visible |
| 11 | Pop-up sin scroll | 1440×900 `scrollHeight=868=clientHeight`; 1280×800 `768=768` |
| 12 | Mapa sin censo, Filtros a la derecha | sin linea de censo en el DOM; `Filtros` en `x=359` de 432 |
| 13 | Siete widgets, filas de 24 | fila 1 Mapa/Busquedas/Operar, fila 2 Cartera/Favoritos/Comparativa/Alertas; `8+10+6=24`, `6+5+8+5=24` |
| 14 | Operar calcula y confirma | 500.000 al 10 % → `53.739,12 / 553.739,12 / 23.072,46`; `disabled=true` antes de marcar, `false` despues; aviso presente en t=0/1/2 s y ausente en t=2,8 s |
| 15 | Movimiento reducido | `matchMedia(...).matches=true`; ningun `<svg>` animado (el sobre no vuela) y el aviso `role=status` sigue presente con `animationName: none` |
| 16 | Suite en verde | la salida de `smoke.sh` de arriba |
| 17 | Diez tablas intactas | la tabla del principio, re-medida al final |

## Dos defectos que el check NO vio, encontrados mirando la pantalla

El check estaba verde con los dos dentro. Es la leccion de `AGENTS.md`: «el check verde no
prueba que la pantalla funcione». Los dos estan arreglados y medidos.

**1 · Columnas pegadas a 0 px** (`EvidenceBlock.tsx`, lo encontro el revisor adversarial).
`Importe` (derecha) iba justo antes de `Estado` (izquierda) y se tocaban:

```
antes   Importe: { text: "-3.055,77",    right: 1320.484 }
        Estado:  { text: "Contabilizado", left: 1320.484 }   -> 0,00 px
        en pantalla: «ImporteEstado» y «-3.055,77Contabilizado»

despues (pl-2 first:pl-0, las tres tablas a 1440x900)
        Liquidez  cabecera 188,18 · 75,67 · 117,31 · 96,31
        Deuda     cabecera  79,08 · 88,87 · 153,70 · 36,29 · 31,23
        Actividad cabecera  49,61 · 94,11 · 202,42 ·  8,00
        ninguna pareja a 0 px, ninguna celda truncando
```

8 px y no 12 porque la holgura de Actividad sobre su ancho natural es de 76 px: con 12, a
1280×800 se parten en dos lineas `Banco · producto` y `Banco`.

**2 · Dos de las seis cifras de Tesoreria truncadas a 30 px.**

```
antes   Tendencia de caja   «+10...»   necesita 116,4 px en una caja de 88,7
        Vencido de clientes «31,...»   necesita  89,0 px en una caja de 88,7
despues (grid-cols-3)  las seis enteras, caja 201,3 px, margen minimo +57,2
```

El techo fisico de una sexta parte de la fila es **111,3 px** (668/6, sin gap ni padding) y
`+100,0 %` a 30 px pide **143,6**: con seis columnas no cabe con ningun reparto. Es la
unica frase del informe de la que esta pasada se aparta, y esta medida.
