# XR-037 · evidencia de verificación

Ejecutado contra los servidores de ESTA rama, no contra los del Gate:

```sh
API_URL=http://localhost:8798 BASE_URL=http://localhost:4199 bash evals/checks/XR-037.sh
```

Los puertos no son cosméticos. `ensure_server` (`evals/checks/lib.sh`) reutiliza
cualquier servidor que ya escuche en `API_URL`, y durante este ticket había una API
viva en **8789** perteneciente al worktree `XR-032` **sirviendo datos mock**. Con los
puertos del enunciado, el check habría medido código de otra rama contra datos falsos
y habría salido verde en falso. Los puertos 4173, 4175, 4176, 4177 y 4178 también
estaban ocupados por otras sesiones, de ahí el 4199 (y la línea de CORS que lo admite).

Origen confirmado antes de medir nada:

```
$ curl -s http://localhost:8798/health
{"status":"ok",...,"source":"motherduck","data_kind":"real","engine":"embat-layered-v1",
 "cutoff_date":"2026-08-01",...}
```

## Suites

```
$ API_URL=http://localhost:8798 BASE_URL=http://localhost:4199 bash evals/smoke.sh
smoke: OK (01:38:43)                                              exit 0

$ API_URL=http://localhost:8798 BASE_URL=http://localhost:4199 bash evals/checks/XR-037.sh
                                                                  exit 0
  35 bloques «Tests N passed», ninguna linea FAIL

$ cd app && corepack pnpm test
api test: Tests  60 passed (60)
web test: Tests 467 passed (467)                                  exit 0

$ corepack pnpm typecheck
api typecheck: Done / web typecheck: Done                         exit 0

$ corepack pnpm --filter web lint
0 errores (warnings preexistentes de only-export-components)      exit 0

$ bash evals/checks/XR-002.sh
                                                                  exit 0
```

`pnpm -C app check` **no existe** como script en este repo: `app/package.json` solo
declara `dev`, `build`, `typecheck` y `test`. El equivalente es `typecheck` + el `lint`
de `app/web`, que es lo que está arriba.

## La lista de aceptación, punto por punto

| # | Criterio | Resultado |
|---|---|---|
| 1 | Ninguna sociedad pierde su país | ✅ **1.286** con `country` y **230** con `country_declared` en `/api/v2/treemap`; `?group_by=country` da 38 países que suman 1.286 |
| 2 | Mapa con los cuatro filtros por defecto | ✅ `1.286 empresas · 08/2026 · 7 sin métrica · 653 sin pendiente de cobro`, leído en pantalla con contexto limpio |
| 3 | «Sin ERP» recupera las 541 | ✅ al seleccionarlo el censo pasa a `541 empresas · 08/2026 · 5 sin métrica · 484 sin pendiente de cobro` |
| 4 | Alertas viejas intactas | ⚠️ `company_alerts` = **11.824** y `group_alerts` = **2.371**. Ver «Lo que no cuadra» |
| 5 | Las diez tablas del reto | ✅ recuento fila a fila contra `docs/data/motherduck.md`, las diez OK (ver abajo) |
| 6 | La Comparativa distingue A de B | ✅ trazos medidos en el DOM: `rgb(111,185,204)` (#6fb9cc) y `rgb(154,147,184)` (#9a93b8) |
| 7 | El pop-up no scrollea | ✅ a 1440×900 y a 1280×800; ningún elemento del diálogo con `scrollHeight > clientHeight` salvo un `h2.sr-only` |
| 8 | Arranca en Investigación con entidad | ✅ con `localStorage` vacío verificado: `Investigación` con `aria-selected="true"` y la ficha de `Droguerías Tajuña S.A.U. · COMP_0169 · Score 81,1 (▲ +41,1 pts) · Confianza 100 %` |
| 9 | Tests y typecheck en verde | ✅ 60 + 467 tests, typecheck de api y web `Done` |

Recuento de las diez tablas del reto, tras publicar las alertas nuevas:

```
groups: 250            companies: 1286        banking_products: 5987
debt_products: 2239    debt_schedule_config: 87   balances: 7996
invoices: 897894       transactions: 2556437  scores: 1286
score_exports: 1
```

Las diez coinciden con `docs/data/motherduck.md`. `SHOW TABLES` pasa de 27 a 29: las
27 de antes más `company_alerts_v2` y `group_alerts_v2`.

## Publicación de alertas

```
$ .venv/bin/python core/publish_alerts.py --database md:hackspain_2026
{
  "by_cause": {
    "company_alerts_v2": { "band_drop": 1977, "buffer_days": 11824, "cap_applied": 263,
                           "concentration": 856, "score_drop": 1783 },
    "group_alerts_v2":   { "band_drop": 344,  "buffer_days": 2371,  "cap_applied": 93,
                           "score_drop": 268 }
  },
  "company_rows": 16703, "group_rows": 3076, "month": "2026-08",
  "untouched": { "company_alerts": 11824, "group_alerts": 2371 }
}
```

El script verifica él mismo que las tablas viejas no cambian y aborta con
`PublicationError` si lo hicieran. La bandeja, con `latest_per_company`, pasa de 19.779
alertas a **1.492 entidades**, una fila por sociedad: 32 «Colchón de caja», 13 «Bajada
de banda», 3 «Concentración» y 2 «Caída del score» en las 50 primeras, 50 sociedades
distintas.

## Lo que no cuadra con el informe, medido

1. **`company_alerts` tiene 11.824 filas, no 11.825.** El total de P4 sí cuadra
   (11.824 + 2.371 = 14.195), así que el 11.825 es un desliz de una fila. Manda la base;
   la spec y el check fijan 11.824.
2. **`cap_applied` da 263 filas, no 1.491.** La regla escrita en I2 es la *transición*
   (`cap_code` deja de ser nulo), que son 263 filas sobre las **196 empresas** que el
   propio informe mide. Las 1.491 son los meses-empresa *con* techo activo (801 + 690),
   que es lo que contó P4. Se implementó la regla, no la columna «Filas»: una alerta por
   cada mes que sigue capado repetiría la misma noticia hasta doce veces.
   `band_drop` (1.977) y `concentration` (856 = 424 `ar` + 432 `ap`) salen exactos.
3. **`raw_parameters` no es un campo hueco.** H2 lo nombra junto a `params`, pero contra
   MotherDuck llega relleno (trae los techos del motor); solo es nulo con el mock. Se
   quedan fuera de `/meta` `params` y `reference`, que sí venían siempre nulos.
4. **«Meses en negativo» no es `0 de 12`.** El catálogo declara `neg_cash_share` con
   ventana `3m`, así que la tarjeta pinta su `value_fmt` con el pie «últimos 3 meses»
   en vez de inventar el denominador.
5. **`PAD_Y = 20` no basta para las burbujas de pico.** La burbuja mide 20,1 px reales,
   no ~18, y se salía 5,9 px por el `overflow-hidden`. Quedó en 28.
6. **El Mapa no tiene cuatro controles, sino seis** (los cuatro filtros más Tamaño y
   Color). A la vista costaban 64 px de los 333 del mapa, así que se aplicó la
   alternativa que el propio informe ofrece: botón `Filtros · N` con cajón. Coste real:
   32 px.

## Lo que no se ha verificado

- **`selectedGroup: "GROUP_0090"`** no se comprobó leyendo el store interno; sí se
  comprobó lo que el criterio pide, que es el estado visible al arrancar.
- La verificación 9 se ejecutó con `typecheck` + `lint` porque `pnpm check` no existe
  en este repo.
- El generador de ejemplos (`pnpm --filter api examples`) **está roto desde antes de
  este ticket**: aborta con `GET /api/v2/companies/COMP_0004/report → 404`, también en
  modo local. Por eso `docs/api/examples/meta.json` y `treemap.json` se regeneraron
  ejecutando la misma transformación del generador sobre una API local efímera, y los
  otros diez ejemplos quedaron intactos. El fallo no se ha arreglado: está fuera de
  alcance.
