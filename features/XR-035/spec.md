---
feature: XR-035
depends_on: [XR-033]
parallel: true
conflicts_with: []
lane: amplio
verify: evals/checks/XR-035.sh
max_attempts: 3
---
# Spec: XR-035 — Contrapartes bajo los pilares Pago y Cobros

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-035: <item>") y termina la pasada.

## 1. Objetivo

Hoy la ficha dice que el pilar de Cobros de una empresa vale 29,9 puntos y que
es el mas debil, pero no dice **quien**. Las cuatro barras de senal cuentan que
la cartera va tarde; ninguna nombra al cliente que la lleva tarde. El tercio
inferior de la pestana esta vacio.

XR-035 llena ese hueco con la contraparte, que es la evidencia que falta debajo
de un numero que el usuario ya esta mirando: **Cobros (C) ensena clientes**
(quien te debe, riesgo de cobro) y **Pago (P) ensena proveedores** (a quien
debes, disciplina de pago). No es una pantalla nueva ni un widget nuevo: es el
cuerpo que le faltaba a dos pestanas que ya existen.

La unidad es la **sociedad**, no el grupo: la mediana por sociedad son 31
proveedores y 11 clientes —una tabla legible— frente a 190 y 92 por grupo.

## 2. Comportamiento (escenarios verificables)

- DADO `core/tests/test_counterparties` CUANDO se ejecutan sus tests ENTONCES
  `build_counterparty_rows` agrega facturas por sociedad, mes, lado y
  contraparte; `side` sale del SIGNO del importe (`amount > 0` es `ar`, cliente;
  `amount < 0` es `ap`, proveedor), que es lo unico que separa cobro de pago en
  este dataset; el peso de cada contraparte es su importe sobre el total de su
  lado y suma 1 por sociedad, mes y lado; y una sociedad sin facturas de un lado
  no produce filas de ese lado en vez de filas a cero.

- DADO `core/tests/test_counterparties` CUANDO se ejecutan sus tests ENTONCES el
  importe NO multiplica por `exchange_rate` y solo entran facturas en euros:
  `exchange_rate` vale 1,0 en la mayoria de las monedas extranjeras y ~19.959 en
  IDR, asi que multiplicar convierte 111.158 facturas no-euro en 5,2 billones de
  euros y una sola fila basura se lleva el primer puesto de la tabla. La cifra de
  cobertura (`eur_share`) viaja con cada resumen para que la pantalla pueda
  decir que parte del libro esta mirando.

- DADO `core/tests/test_counterparties` CUANDO se ejecutan sus tests ENTONCES el
  vencido vivo por tramos (`0-30`, `31-60`, `61-90`, `90+`) se reconstruye
  as-of —vencidas al corte menos liquidadas al corte— como hace
  `monthly_invoices` en `pipeline_embat.py`, y NO se lee `status` como bandera
  de vencido ni se usa `pending_amount`: en este dataset `status` no se limpia,
  asi que tomarlo como bandera mete los 24 meses de atrasos historicos en el
  tramo `90+` y lo convierte en basura (medido: 1,17 billones de euros en `90+`
  frente a 2.360 millones en `0-30`). `status = 'paid'` si se usa, pero solo
  para dar por buena `payment_date`, que viene rellena tambien en 237.593
  facturas no pagadas.

- DADO `core/tests/test_counterparties` CUANDO se ejecutan sus tests ENTONCES el
  desvio de pago es la media PONDERADA POR IMPORTE de dias entre vencimiento y
  pago (`days_late_w`) junto al porcentaje de facturas pagadas tarde
  (`pct_late`), y no la mediana: la mediana vale exactamente 0 en los dos lados
  —la mitad de las facturas pagan el dia del vencimiento— y una columna de ceros
  no ordena nada. Solo cuentan facturas con `status = 'paid'` y dentro de
  ventana, porque `payment_date` viene rellena tambien en 237.593 facturas no
  pagadas.

- DADO `/api/v2/companies/COMP_0001/counterparties?side=ap` CUANDO se pide
  ENTONCES responde 200 con `company_id`, `as_of`, `side`, un bloque `summary`
  (`n_counterparties`, `top1_weight`, `effective_counterparties`, `total_amount`,
  `currency: "EUR"`, `eur_share`) y una lista `items`; cada item trae
  `counterparty_id`, `amount_12m`, `weight`, `days_late_w`, `pct_late`,
  `overdue_total`, los cuatro tramos `overdue_0_30`/`31_60`/`61_90`/`90_plus`,
  `n_invoices` y `sparkline_12`.

- DADO `/api/v2/companies/COMP_0001/counterparties` CUANDO se pide con
  `side=ar`, con `sort=weight` y con `sort=deterioration` ENTONCES el contrato
  responde 200 en los tres casos, `sort=weight` ordena por peso descendente y
  `sort=deterioration` por desvio de dias descendente; un `side` o un `sort` que
  no existe responde 400 `invalid_query`, y una empresa que no existe responde
  404, como el resto del contrato v2.

- DADO una empresa sin contrapartes de ese lado CUANDO se pide su endpoint
  ENTONCES responde 200 con `items: []` y `summary.n_counterparties: 0`, NUNCA
  404: 553 de las 1.286 sociedades no tienen ninguna contraparte en euros en la
  ventana, y no tener libro no es un error.

- DADO `widgets/research-deep/Counterparties` CUANDO se ejecutan sus tests
  ENTONCES el bloque pinta dos cifras de cabecera (peso de la mayor contraparte
  y numero efectivo de contrapartes, `1/HHI`), una tabla ordenable por peso o por
  deterioro, y una fila por contraparte con su peso, su desvio en dias, su
  vencido vivo y su minigrafica de 12 meses; toda cifra lleva `.num`, coma
  decimal y el signo con glifo.

- DADO `widgets/research-deep/Counterparties` CUANDO la empresa no tiene
  contrapartes de ese lado ENTONCES se pinta el texto de vacio que le toca
  («Sin proveedores en euros en la ventana» / «Sin clientes en euros en la
  ventana») y NO una tabla vacia ni un cero de relleno.

- DADO `widgets/research-deep/PillarSummary` CUANDO se ejecutan sus tests
  ENTONCES el bloque de contrapartes aparece SOLO en las familias `P` (con
  proveedores, `side=ap`) y `C` (con clientes, `side=ar`), y NO en `L`, `D` ni
  `A`, cuyas pestanas quedan exactamente como estan hoy.

## 3. Fuera de alcance

- `evals/`, `TASKQUEUE.md`, `datasets_mocked/`, `data/`: intocables.
- El contrato v2 existente no se toca: XR-035 solo AÑADE una ruta. Ni un
  parametro obligatorio nuevo, ni un cambio de forma en ninguna respuesta
  existente, ni en los origenes CORS.
- El score no cambia. Las contrapartes son evidencia junto al pilar, no entran
  en la formula ni mueven un punto. Si algun dia entran, pasan por
  `evaluate.py` como cualquier otra senal.
- **Nada de red de contrapartes.** Las 124.030 contrapartes pertenecen cada una
  a exactamente UNA sociedad (maximo medido: 1). No se puede decir «este
  proveedor sirve a cuarenta de tus clientes» ni propagar salud por el grafo, y
  la pantalla no lo insinua.
- El motor no se ejecuta dentro de una peticion HTTP: la API lee tablas ya
  publicadas por `core/publish_counterparties.py`.
- Sin dependencias nuevas. Ningun literal de color fuera de `index.css`, ningun
  token nuevo.
- No se tocan las tablas `scores` ni `score_exports` ni las publicadas por
  `core/publish.py`.

## 4. Verificacion

```sh
bash evals/checks/XR-035.sh
```

## 5. Items

1. Publicador `core/publish_counterparties.py` y sus tests.
2. Lectura tipada y ruta `/api/v2/companies/:id/counterparties`.
3. Bloque `Counterparties` en las pestanas `P` y `C`.

## 6. Cobertura medida

Releido de `company_counterparty_summary` ya publicada (corte del motor
2026-08-01, ventana 2025-09-01 a 2026-08-01, solo euros):

| Medida | Proveedores (ap) | Clientes (ar) |
|---|---:|---:|
| Sociedades con alguna | 723 | 616 |
| Mediana de contrapartes | 29 | 10 |
| Peso mediano de la mayor | 47,5 % | 60,4 % |
| Contrapartes efectivas (1/HHI) | 3,3 | 2,1 |
| Desvio mediano ponderado | 0,94 d | 1,47 d |
| `eur_share` mediano | 1,00 | 1,00 |

730 sociedades tienen algun lado, 79.370 filas de contraparte en total, y los
pesos suman 1 en las 1.339 parejas sociedad-lado sin una sola excepcion.

El vencido vivo suma 1.066 millones de euros sobre 4.319 facturados. Si se
leyera `status` como bandera en vez de reconstruir as-of, ese numero seria
1,17 billones: tres ordenes de magnitud de diferencia, y es la comprobacion mas
barata de que la reconstruccion esta haciendo su trabajo.

De las 79.370 filas, 60.069 traen desvio de dias; el resto no tiene ninguna
factura pagada en ventana y viaja nulo, nunca como cero.
