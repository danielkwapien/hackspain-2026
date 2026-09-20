# XR-038 · Fase 3 · Estructura (W1.7, W1.8, W2.1, W2.2, W2.4). No hay cifras
# nuevas: lo que cambia es el reparto vertical de la ficha y el del widget
# profundo. Ancla los criterios 5, 6 y 7 de §8 del informe.

# 5 · Las cuatro cards de «Contexto» ocupan cada una el ancho completo,
# apiladas (`flex flex-col`, no `grid-cols-2`), con el titulo a
# `--text-section` peso 600 y la cifra a `--text-figure-lg`. La cabecera
# «CONTEXTO» sube al mismo escalon que «TESORERIA» (W1.5).
web_test src/panels/research/StrategicCards.test.tsx

# 6 · La grafica de la ficha mide 252 px (168 × 1,5), constante. Medirla con
# `ResizeObserver` retroalimenta: el contenedor crece con su contenido y la
# grafica pisa lo de abajo. 252 sigue bajo el techo de 260.
web_test src/panels/research/SheetChart.test.tsx

# 7a · El widget profundo ya no pinta `Liquidez · P 0,42 · peso efectivo 0,25 ·
# 3 de 4 senales disponibles`, ni el `<p>` ni el calculo de `available`.
web_test src/widgets/research-deep/PillarSummary.test.tsx

# 7b · …y su toggle de familia ocupa el ancho completo, con las cinco opciones
# a partes iguales y en mayusculas, por `className` en ESTA llamada: el
# primitivo `Segmented` lo comparten el rango de la grafica, el orden de
# contrapartes y el de unidad. Aqui vive tambien la cobertura de senales que
# W2.1 saca del cuerpo: no se borra la informacion, se pasa al `title` del
# toggle de la familia activa.
web_test src/widgets/research-deep/ResearchDeepWidget.test.tsx

# W2.4 · En las cinco familias: nombre de senal a `--text-body` blanco peso
# 600 y valor a `--text-figure`. Con esos dos tamanos la celda no cabe en 64 px.
web_test src/panels/research/FamilyStats.test.tsx

# W2.4 · …y por eso `--size-stat-row` sube a 72 px. Se repite `tokens.test.ts`
# de la fase 0 a proposito: la altura de la celda es parte de este cambio.
web_test src/design/tokens.test.ts

# La ficha entera sigue montando con la grafica mas alta y Contexto a ancho
# completo: el criterio 3 (fase 2) se mide aqui mismo y no se puede romper.
web_test src/panels/research/ResearchPanel.test.tsx
