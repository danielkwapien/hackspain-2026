---
feature: XR-034
depends_on: []
parallel: true
conflicts_with: [XR-033]
lane: amplio
verify: evals/checks/XR-034.sh
max_attempts: 3
---
# Spec: XR-034

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-034: <item>") y termina la pasada.

## 1. Objetivo
El widget Mapa reparte el universo en tres columnas semanticas (por umbral sobre
la metrica elegida), enseña como mucho diez entidades por columna con nombre y
cifra legibles en TODAS las fichas, y dice cuantas quedan fuera; el reparto
dentro de cada columna sigue siendo el squarified de `TreemapLayout`. La
cabecera son tres desplegables al estilo del heatmap de Trade Republic
(Universo, Tamano, Color) y el area de la ficha sale de una magnitud que EXISTE
hoy, no de `op_in_12m`, que el motor aun no emite.

## 2. Comportamiento (escenarios verificables)
- DADO `charts/treemap-columns` CUANDO se ejecutan sus tests ENTONCES `COLUMN_SPLIT` define un `neutral` y un `threshold` por metrica (`delta_1m`/`delta_3m`: 0 ± 1; `score`: 50 ± 10, que reproduce la banda de vigilancia del motor, 40/60), `splitColumns` manda cada item a mejor/medio/peor por ese umbral y deja fuera los de metrica nula, cada columna ordena por magnitud descendente desempatando por distancia al `neutral` y luego por `id`, recorta a `MAX_PER_COLUMN` = 10 (o a `STACKED_PER_COLUMN` = 5 cuando el widget apila) y publica su censo `total`, del que el widget deriva el «y N mas», y `columnWidths` reparte el ancho proporcional al censo de cada columna con un suelo de `MIN_COLUMN_SHARE` = 0,2 sumando exactamente el ancho dado.
- DADO `charts/treemap-fit` CUANDO se ejecutan sus tests ENTONCES `fitCount` devuelve el mayor `n` ≤ `max` cuyo layout squarified dentro de la caja deja TODAS las fichas con su nombre entero y su cifra — lo decide reusando `showsLabel` y `truncateLabel` de `treemap-label`, no un umbral nuevo —, deja el tope (10, o 5 apilado) al llamante, que recorta la lista antes de preguntar, devuelve 0 sin items y su suelo de 1 solo se sostiene cuando esa ficha se VE: con la mayor de magnitud 0 —el squarified le da 0 x 0— devuelve 0, y la columna lo cuenta en su pie en vez de fingir una ficha invisible.
- DADO `charts/Treemap` CUANDO se ejecutan sus tests ENTONCES acepta `neutral` y `scale` opcionales para que las tres columnas compartan una sola escala de intensidad, el signo del color sale de comparar el valor con `neutral` (no con 0), y en una caja de columna con diez items iguales ninguna ficha queda sin nombre ni sin cifra.
- DADO `charts/TreemapLayout` CUANDO se ejecutan sus tests ENTONCES las tres invariantes siguen verdes: teselado exacto sin huecos ni solapes, determinismo independiente del orden de entrada y ningun `NaN` en los bordes.
- DADO `widgets/treemap/TreemapColumns` CUANDO se ejecutan sus tests ENTONCES el cuerpo del Mapa pinta tres columnas con titulo por metrica (con `score`: «Sanas», «Vigilancia», «Tension», el vocabulario de `BAND_LABEL`; con un Δ: «Mejorando», «Estable», «Deteriorando»), cada columna lleva su linea «y N mas» cuando sobran entidades, se cumple SIEMPRE que fichas pintadas + «y N mas» = censo de la columna, una columna sin entidades se pinta igual con su titulo y su texto de vacio, y una con censo pero sin magnitud que dibujar recibe el mismo trato con el texto que le toca («ninguna con <magnitud> que dibujar»).
- DADO `widgets/treemap/TreemapWidget` CUANDO se ejecutan sus tests ENTONCES la entidad del mapa es la EMPRESA (el bucket colapsa: por pais el reparto sale 1/17/0 y por ERP 0/19/2, y por grupo la API manda `delta: null` en los 250; con empresas sale 173/480/177 sobre las 830 con score, con el umbral estricto: los 34 que valen 60,00 caen en vigilancia), el subtitulo dice cuantas empresas hay en el universo elegido, el corte, cuantas no tienen metrica y cuantas no tienen la magnitud elegida, ya no existe la linea «Area igual por empresa · color por score al corte» ni ninguna leyenda de color, y cambiar cualquiera de los tres desplegables (universo, tamano, color) recalcula las tres columnas.
- DADO `/api/v2/treemap` CUANDO se pide con `size_by=n_invoices`, `size_by=n_transactions` o `size_by=pending_eur` ENTONCES responde 200, el campo `size_by` refleja lo pedido y la suma de tamanos es mayor que cero (hoy `op_in_12m` devuelve 0 en las 1286 empresas). `pending_eur` suma SOLO el pendiente positivo de facturas en euros: el dataset trae 39 monedas y no hay tabla de cambio, asi que mezclarlas seria una cifra falsa, y el euro va dicho en la etiqueta.
- DADO `widgets/treemap/TreemapHeader` CUANDO se ejecutan sus tests ENTONCES la cabecera son tres desplegables —Universo (todas, mi cartera, favoritos, y un pais o un ERP concretos), Tamano (pendiente de cobro en EUR, numero de facturas, numero de movimientos) y Color (score y, cuando el corte los tiene, los dos Δ)—, elegir un universo filtra las empresas que entran en las tres columnas, y el filtro por cartera y favoritos se resuelve en el cliente contra la watchlist sin pedir nada a la API.
- DADO la API v2 CUANDO se pide `/api/v2/treemap` con `group_by=country` y `size_by=n_companies` ENTONCES el contrato responde con `group_by`, `metric`, `size_by` y `groups` intactos.

## 3. Fuera de alcance
- `evals/`, `TASKQUEUE.md`, `datasets_mocked/`, `core/`, `data/`: intocables.
- `app/api`: el unico cambio permitido es ADITIVO y en `size_by` — tres valores
  nuevos (`n_invoices`, `n_transactions`, `pending_eur`) y lo que haga falta para
  calcularlos. Ni un parametro obligatorio nuevo, ni un cambio en la forma de la
  respuesta, ni en los origenes CORS: quien llama hoy al endpoint sigue igual.
  Filtrar por pais, por ERP, por cartera o por favoritos NO toca la API: el
  payload ya trae los buckets y la watchlist vive en el cliente.
- `charts/TreemapLayout.ts`: el algoritmo squarified no se toca. La particion en
  columnas es una capa PREVIA que llama a `layout` una vez por columna.
- Nada de `layoutGrouped` ni de bandas de titulo de grupo dentro del mapa: las
  cabeceras de grupo desaparecen del Mapa, el titulo ahora es el de la columna.
- Ningun literal de color fuera de `app/web/src/index.css`; ningun token nuevo.
- Toda cifra con `.num` (tabular-nums), coma decimal y signo con glifo.
- Sin dependencias nuevas. Sin animacion de entrada de fichas (solo, si acaso,
  la transicion al cambiar de agrupacion o metrica).
- `op_in_12m` sigue llegando nulo hasta XR-033: el mapa NO imputa 0 ni inventa
  magnitud; cae a `n_companies` como ya hace hoy el widget.
- Otros widgets, otros tableros, el buscador y la seleccion: no se tocan.

## 4. Verificacion
- [ ] bash evals/smoke.sh          → exit 0
- [ ] bash evals/checks/XR-034.sh  → exit 0   # nacio en rojo sobre main
- [ ] capturas comparables en plans/XR-034-treemap/evidence/ (NN-mapa-tr.png y
      NN-mapa-local.png al mismo ancho) y measures-tr.txt con las medidas de
      Trade Republic que fijan `MIN_TILE`.

Esta seccion puede incluir lineas web_test / api_test / py_test: en backend y en
logica de front, el test va primero y el test que FALLA es el check rojo. Escribe
la linea del test antes que el codigo, no despues.

## 5. Prioridades (de arriba abajo)
1. Tests en rojo (`bash evals/checks/XR-034.sh` ≠ 0).
2. U1 `charts/treemap-columns.ts`: `COLUMN_SPLIT`, `splitColumns`, `columnWidths`.
3. U2 `charts/treemap-fit.ts`: `fitCount` sobre `showsLabel`/`truncateLabel`.
4. U3 `charts/Treemap.tsx`: `neutral` y `scale` compartidos.
5. U4 `widgets/treemap/TreemapWidget.tsx`: tres columnas, titulos por metrica,
   «y N mas», columna vacia, subtitulo honesto, sin leyenda de color.
6. U8 API: `size_by` con `n_invoices`, `n_transactions` y `pending_eur`.
7. U9 cabecera de tres desplegables (Universo, Tamano, Color).
8. U5 responsive: a poco ancho las columnas se apilan y bajan a cinco.
9. U6 accesibilidad: foco visible, navegacion por teclado entre fichas y
   contraste AA del texto sobre cualquier tono del semaforo.
10. U7 evidencia (capturas contra Trade Republic) y `compound`.
