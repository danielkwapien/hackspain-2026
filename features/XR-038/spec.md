---
feature: XR-038
depends_on: [XR-037]
parallel: false
conflicts_with: []
lane: amplio
verify: evals/checks/XR-038.sh
---
# Spec: XR-038 — Kima, segunda pasada de UI

Fuente de verdad: `INFORME-UI-KIMA-2.md` (gitignored, en el repo principal). Seis
bloques de cambio (W1–W6), todos los numeros de este fichero medidos contra
`md:hackspain_2026`, ninguno estimado. Esta feature **solo lee** de MotherDuck:
las diez tablas del reto no se tocan.

## 1. Objetivo

La pantalla de XR-037 es correcta y se lee pequena. Casi todo lo que importa
—el Score, las cifras de Tesoreria, los titulos de seccion, las insignias de
identidad— vive a 11-13 px en gris, y tres de las cinco familias del widget
profundo ensenan cuatro senales y dos tercios del widget en blanco. XR-038 sube
la escala tipografica **con dos tokens nuevos y ninguno mas**, llena esas tres
familias con tablas de evidencia servidas por tres endpoints nuevos, y anade el
widget «Operar», que es el unico componente nuevo.

## 2. Reglas duras

- **Dos tokens nuevos, ni uno mas.** `--text-section` (15 px) y `--text-figure-lg`
  (30 px), en `app/web/src/index.css`. Cada «mas grande» de esta spec sube un
  escalon dentro de la escala; **un `px` suelto es un fallo de la spec**, no una
  decision de implementacion.
- Escala vigente: `--text-micro` 11 · `--text-control` 12 · `--text-body` 13 ·
  `--text-panel-title` 14 · `--text-section` 15 · `--text-tile` 16 ·
  `--text-widget-title` 18 · `--text-figure` 20 · `--text-figure-lg` 30.
- Las diez tablas del reto quedan intactas. Ningun endpoint nuevo publica nada.
- `evals/` es el examen; el check se escribe primero y se ve EN ROJO.

## 3. Comportamiento (escenarios verificables)

### W1 · Widget «Investigacion» (la ficha)

- **W1.1** `EntityIdentity` pinta **seis insignias mas el regimen**: codigo,
  industria, pais, **ERP**, **grupo**, **historia** (`months_hist`), a
  `--text-control` (12 px), `px-2.5 py-1`, pegadas al titulo con `gap-1`. El
  regimen va aparte, con su color de `REGIME_CLASS`, y el dinero 12 m sigue a la
  derecha. `erp` es **NULL en 541 de 1.286 (42 %)**: cuando falta, la insignia
  **no se pinta** — ni hueco ni «Sin ERP». Los valores crudos son camelCase y se
  traducen con un diccionario en `lib/definitions.ts` (los 20 valores en §7.4 del
  informe: `businessCentral` → `Business Central`, `sageX3` → `Sage X3`, …). El
  asterisco de «dato inferido» de industria y pais pasa a `border-dashed`
  conservando el `title`.
- **W1.2** `SheetHeader`: etiquetas `text-center` a `--text-control`; Score a
  `--text-figure-lg` peso 600 **con su unidad** (`81,1 pts (▲ +41,1 pts)`), el
  `pts` a `--text-body` en secundario y el delta a `--text-control` con su tono;
  Confianza a `--text-figure` conservando `confidenceTone`. `fmtPoints` vuelve
  aqui; `fmtPointsBare` **no se borra**, lo usan otros.
- **W1.3** La celda **Conclusion** saca el texto de la capsula glass: suelto, a
  `--text-body` en `--content-primary`, `text-pretty`, hasta dos lineas, **con el
  `InfoTip`** que ya llevan las otras cinco. Varias fortalezas → separadas por
  `·`; ninguna → «Sin senales destacadas» en `--content-secondary`.
- **W1.4** Los titulos de las seis celdas de pilares y de las cards de Tesoreria
  pasan a `--content-primary` a `--text-control` **peso 400**; el valor, blanco a
  **peso 600 y 30 px**. Jerarquizan el tamano y el peso, no el color.
- **W1.5** «TESORERIA» y «CONTEXTO» a `--text-section` peso 600 en
  `--content-primary`, conservando `uppercase tracking-wide`.
- **W1.6** Cards de Tesoreria: cifra a `--text-figure-lg`, etiqueta a
  `--text-control` blanca, pie explicativo a `--text-micro` en secundario. La
  rejilla de seis **se queda**.
- **W1.7** `StrategicCards`: **una card por fila a todo el ancho**
  (`flex flex-col gap-2`), titulo a `--text-section` peso 600, cifra a
  `--text-figure-lg`, direccion y ajuste a `--text-body`, evidencia a
  `--text-control`, y la `PillarBar` a la fila entera con grosor 6 px.
- **W1.8** `SheetChart`: `CHART_HEIGHT = 252` (168 × 1,5). **No** se sustituye por
  una medida dinamica: medir con `ResizeObserver` retroalimenta. 252 sigue bajo el
  techo de 260.

### W2 · Widget «Investigacion profunda»

- **W2.1** Fuera la linea `Liquidez · P 0,42 · peso efectivo 0,25 · 3 de 4 senales
  disponibles` (`PillarSummary`), con su `<p>` y el calculo de `available`. La
  **cobertura de senales no desaparece**: pasa a un `InfoTip` o `title` en el
  toggle de la familia activa.
- **W2.2** El `Segmented` de familia a `w-full` con las cinco opciones a `flex-1`,
  texto a `--text-body`, `uppercase tracking-wide`, peso 600. Por `className` en
  **esta** llamada: el primitivo lo comparten el rango de la grafica, el orden de
  contrapartes y el de unidad.
- **W2.3** **Liquidez, Deuda y Actividad tienen tabla de evidencia**, sobre tres
  endpoints nuevos (`/cash`, `/debt`, `/activity`), patron exacto de
  `motherduck/counterparties.ts` + ruta en `v2/routes.ts`.
  - *Liquidez «Donde esta la caja»*: `banking_products` + `balances`. Columnas
    Banco · Producto · Tipo · Moneda · Saldo. Encima, **saldo total en EUR** y
    **numero de bancos**. **`balances.available` es NULL en las 7.996 filas: no
    hay columna «Disponible».** `granted` (33 %) fuera por defecto. **Multimoneda
    sin FX**: se totaliza EUR y las demas van aparte, nunca sumadas. Productos sin
    fila en `balances` → `LEFT JOIN` y «—», nunca 0.
  - *Deuda «Posiciones de financiacion»*: `debt_products`. Columnas Producto ·
    Tipo · Banco · Moneda · Concedido · Saldo vivo, **en magnitudes (`abs()`)** con
    encabezados que digan que son. **Prohibido calcular ratio de utilizacion**
    desde estas dos columnas: `granted` es negativo en 2.043 de 2.239 filas y
    `outstanding` negativo en 1.351, positivo en 155 y **cero en 743**.
    El **70,6 %** de las sociedades no tiene deuda → estado vacio «Sin productos
    de financiacion registrados», nunca una tabla de ceros. **No** se usa
    `debt_schedule_config` (40 sociedades, 3,1 %) como columna.
  - *Actividad «Ultimos movimientos»*: `transactions` + `LEFT JOIN` a los dos
    catalogos por `product_id`. Columnas Fecha · Categoria · Banco·producto ·
    Importe (tono por signo) · Estado. **El 77,6 % de las descripciones lleva
    marcadores de anonimizacion (1.636.103 de 2.555.981): la descripcion NO puede
    ser la columna principal**; identifica el movimiento **categoria +
    banco/producto**. Categoria `-` → «Sin clasificar» y **no se esconde** (es la
    mayor, 635.530). Filtro `date <= cutoff`. Movimientos con producto ausente de
    los catalogos (1.314) → «—», nunca se descarta la fila.
- **W2.4** `FamilyStats`, **en las cinco familias**: nombre de senal a
  `--text-body` blanco peso 600; valor a `--text-figure` peso 600; contribucion y
  Δ1m igual; `PillarBar` a 6 px. `--size-stat-row` sube de 48 a ~72 px.
- **W2.5** «Como se calcula»: prosa ampliada a cuatro o cinco bloques de dos o
  tres parrafos en registro profesional, **sin publicar el modelo** (ni pesos por
  senal, ni anclas, ni umbrales de regimen). **Dos formulas como maximo**, en
  monoespaciada dentro de una card. `BandScale` y `WeightsRow` **cada uno en su
  fila a ancho completo**, barras a 10 px y textos a `--text-body` con etiquetas
  en blanco. **El dialogo sigue SIN scroll** a 1440×900 y 1280×800: si no cabe, se
  recorta el texto o se reparte en dos columnas.

### W3 · Widget «Mapa»

- **W3.1** `Filtros` se separa del grupo con `ml-auto` a la derecha; los controles
  suben de `--text-control` a `--text-body` y de `--size-segment-sm` a
  `--size-segment`. La fila envolvera antes: mirar el widget a **8 de 24
  columnas**, no maximizado.
- **W3.2** Fuera la linea de censo **entera**: el bloque `status`, la prop `status`
  de `TreemapHeader` y los calculos que solo la alimentaban (`missing`,
  `missingSize`, `sizeTotal`, `flatSize`, `sameSize`) si no los usa nadie mas.
- **W3.3** El nombre de columna a `--text-body` peso 600 en `--content-primary`;
  recuento e importe se quedan a `--text-micro` en secundario.

### W4 · Componente nuevo «Operar»

- **W4.1** `dashboard/fixed/investigacion.ts` pasa a siete widgets:
  fila 1 (h13) Mapa w8 · Busquedas w10 · **Operar w6**;
  fila 2 (h11) Cartera w6 · Favoritos w5 · Comparativa w8 · Alertas w5.
  Las dos filas suman 24 exactas. Comparativa se queda en 8 porque declara
  `minSize: { w: 8 }`. Favoritos y Alertas van a 5: **bajar su `minSize.w`
  declarado a 5** en `widgets/register-all.ts`.
- **W4.3** Widget «Operar», lista de filas etiqueta-izquierda / valor-derecha con
  el boton al fondo (anatomia de Trade Republic, §W4.2 del informe). Controles:
  selector de sociedad (`components/CompanyPicker.tsx`, por defecto la del store
  `useSelection`, con industria · pais · score a `--text-micro`), `Segmented`
  `Ofrecer`/`Reclamar`, importe (1.000–10.000.000 €, formato es-ES al blur),
  interes anual (0,1–25 %, un decimal), plazo (3/6/12/24/36/60 meses). Calculadas:
  intereses, total, cuota mensual.
  **Aritmetica: cuota francesa** (decision de Alfonso, §10 del informe):
  `c = P·i / (1 − (1+i)^−n)` con `i` mensual; `total = c·n`;
  `intereses = total − P`. Con `i = 0` degrada a `c = P/n`.
  Con `Reclamar` el vocabulario cambia: `Intereses a percibir`, `Total a recibir`,
  `Cobro mensual`.
- **W4.4** `Operar` abre un `Dialog` (`components/ui/dialog.tsx`) en tamano
  `overlay` con el resumen de la operacion, la nota de no vinculante y una
  casilla «Confirmo que tengo autorizacion…». **`Enviar oferta` lleva `disabled`
  real en el `<button>`** hasta marcarla. No hay `checkbox` en `components/ui/`:
  se crea uno con `focus-visible:ring` y `aria-checked`.
- **W4.5** Al confirmar: el dialogo se cierra, un icono `Mail` cruza la pantalla
  desvaneciendose y un aviso central «Oferta de deuda enviada a <empresa>» se va
  solo a los 2,5 s. Dos `@keyframes` nuevos en `index.css` declarados como
  utilidades: `--animate-envelope-fly` y `--animate-toast-enter`. Llevan
  `motion-reduce:animate-none`: **con movimiento reducido el sobre no vuela pero
  el aviso sigue apareciendo**. El aviso lleva `role="status"` y
  `aria-live="polite"`. **No se envia ningun correo**: es una simulacion y no hay
  que construir backend.

### W5 · Cartera y Alertas

- **W5.1** En el helper `Stat` de `PortfolioWidget`: etiqueta a `--text-control`
  blanca, valor a `--text-figure` peso 600.
- **W5.2** `AlertsWidget`: nombre de empresa a `--text-body` en
  `--content-primary` peso 600; tipo de alerta a `--text-body` en
  `--content-secondary`; el mes se queda a `--text-micro`. `alert.message`
  **sigue sin pintarse** en el cuerpo (vive en `title` y `sr-only`). `ROW_HEIGHT`
  sube de 28 a 34 px **y el calculo de altura de la virtualizacion tiene que
  seguir cuadrando**.

### W6 · Marca y cabecera

- Logo `size-5` → `size-7`; `Kima` a `--text-figure` peso 600; pestanas a
  `--text-tile`; texto del buscador a `--text-section`. `--size-topbar` (60 px)
  **no crece** y el `SearchTrigger` sigue centrado.
- **El fichero del logo no existe: la imagen llego en blanco.** Se aplican **solo
  los tamanos** y `Logo.tsx` se deja como esta. **No se inventa un logo.**

## 4. Verificacion

`API_URL=http://localhost:8790 BASE_URL=http://localhost:4180 bash evals/checks/XR-038.sh`

Los puertos por defecto (8787/5173) son la sesion del Gate sobre main: con ellos
el check verificaria otra rama y saldria verde en falso.

## 5. Criterios de aceptacion (los 17 del informe, §8)

1. `COMP_0169` ensena seis insignias mas el regimen, con el ERP, a 12 px, pegadas al titulo.
2. Una sociedad **sin ERP** (541) ensena cinco insignias, sin hueco ni «—».
3. El Score se lee `81,1 pts (▲ +41,1 pts)` a 30 px, etiqueta centrada encima.
4. **Conclusion** ensena «Crece sin mora» a 13 px, fuera de capsula, con su ⓘ.
5. Las cuatro cards de **Contexto** ocupan el ancho completo, apiladas.
6. La grafica de la ficha mide **252 px**.
7. El widget profundo no tiene la linea `Liquidez · P 0,42 · …` y su toggle ocupa el ancho completo en mayusculas.
8. **Liquidez, Deuda y Actividad tienen tabla.** Con `COMP_0169`: 6 productos en 5 bancos; 10 productos de deuda; movimientos hasta `2026-08-01`, ninguno posterior.
9. Una sociedad **sin deuda** (908) ensena el estado vacio, no una tabla de ceros.
10. La tabla de Actividad no muestra `[NUM]` ni `[COMPANY]` como contenido principal de ninguna columna.
11. «Como se calcula» **sigue sin scroll** a 1440×900 y 1280×800, con `BandScale` y `WeightsRow` cada uno a ancho completo.
12. El Mapa no tiene la linea de censo y su boton `Filtros` esta a la derecha.
13. El tablero Investigacion tiene **siete widgets**, Operar en la primera fila y Favoritos entre Cartera y Comparativa. Las dos filas suman 24.
14. En Operar: los tres campos actualizan las tres cifras; `Operar` abre el dialogo; **`Enviar oferta` deshabilitado** hasta marcar la casilla; al confirmar salen animacion y aviso, y el aviso se va solo.
15. Con `prefers-reduced-motion: reduce`, el sobre no vuela pero **el aviso sigue apareciendo**.
16. `pnpm -C app test` y `pnpm -C app typecheck` en verde.
17. Las diez tablas del reto intactas: `groups` 250, `companies` 1.286, `banking_products` 5.987, `debt_products` 2.239, `debt_schedule_config` 87, `balances` 7.996, `invoices` 897.894, `transactions` 2.556.437, `scores` 1.286, `score_exports` 1.
