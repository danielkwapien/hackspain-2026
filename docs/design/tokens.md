# Sistema de tokens de X-Ray

La fuente de verdad es [`app/web/src/index.css`](../../app/web/src/index.css). Este
documento describe lo que hay allí; si los dos discrepan, manda la hoja. Los valores
de las tablas están leídos de esa hoja, no transcritos de memoria.

Este ticket (XR-002) **sustituye la §1 «Tokens» de**
[`docs/dani/contrato-visual-v1.md`](../dani/contrato-visual-v1.md) y **respeta sin cambios
sus §2 Composición, §3 Copy y §4 Anti-patrones**. El origen de la escala tonal es
`plans/00-reference/trade-republic-tokens.md` (fuera del repo: `plans/` está gitignored),
con la marca de Embat encima: acento aqua, verde y rojo del semáforo financiero, y el
morado y el rosa corporativos fuera del producto.

Tres capas, en un solo sentido:

```
primitivos  →  semánticos  →  componente
(literales)    (significado)   (medidas, tipo, motion)
                    ↓
              alias de shadcn (ui/*)
```

Reglas que los tests de `src/design/tokens.test.ts` vigilan:

- solo la capa primitiva contiene literales; la semántica únicamente referencia primitivos;
- los alias de shadcn apuntan a un semántico, nunca a un valor propio;
- ningún hex literal en `src/**/*.tsx`: los componentes consumen `var(--x)` o una utilidad
  de Tailwind;
- el contraste de los pares de lectura cumple los mínimos de la tabla de más abajo.

La ruta `/tokens` es el playground de estas tablas, montada solo en desarrollo
(`import.meta.env.DEV`). Lee `index.css` en crudo, así que no puede desincronizarse.

## Capa 1 · Primitivos

Único sitio con valores literales. No se consumen desde componentes.

| Token | Valor | Uso | Ejemplo |
| --- | --- | --- | --- |
| `--white` | `#ffffff` | Texto principal y línea del score | `--content-primary` |
| `--black` | `#000000` | Base de los velos oscuros | `--alpha-black-40` |
| `--navy-950` | `#070b1f` | Fondo de la aplicación | `--bg` |
| `--navy-900` | `#0c1230` | Superficie de widget | `--surface-primary` |
| `--navy-800` | `#111a3a` | Superficie elevada (popover, muted) | `--surface-elevated` |
| `--navy-700` | `#1c2547` | Superficie realzada y borde | `--border-primary` |
| `--navy-600` | `#2a3560` | Tooltip | `--surface-tooltip` |
| `--gray-1` | `#f2f3f4` | Gris claro de reserva | sin uso semántico hoy |
| `--gray-3` | `#b5b7ba` | Gris claro de reserva | sin uso semántico hoy |
| `--gray-4` | `#93969a` | Texto secundario y serie neutra | `--content-secondary` |
| `--gray-5` | `#6a6b6d` | Texto terciario | `--content-tertiary` |
| `--gray-6` | `#4a4c4f` | Deshabilitado y calentamiento | `--content-disabled` |
| `--green-500` | `#02ca50` | Positivo del semáforo | `--content-positive` |
| `--green-700` | `#0e8f45` | Verde apagado de banda sana | `--band-healthy` |
| `--red-500` | `#ff4034` | Negativo del semáforo | `--content-negative` |
| `--orange-500` | `#ff9500` | Aviso del negocio | `--content-alert` |
| `--yellow-500` | `#edc500` | Aviso sobre el dato | `--content-warning` |
| `--aqua-400` | `#5ed3e5` | Acento de Embat, foco y enlace | `--content-accent` |
| `--aqua-600` | `#007b93` | Aqua oscuro de reserva | sin uso semántico hoy |
| `--tone-aqua` | `#6fb9cc` | Tono de pilar | `--chart-pillar-liquidity` |
| `--tone-green` | `#6fbf8e` | Tono de pilar | `--chart-pillar-payments` |
| `--tone-yellow` | `#c9b45f` | Tono de pilar | `--chart-pillar-collections` |
| `--tone-orange` | `#d09257` | Tono de pilar | `--chart-pillar-debt` |
| `--tone-violet` | `#9a93b8` | Tono de pilar | `--chart-pillar-activity` |
| `--alpha-white-5` | `#ffffff0d` | Luz superior del widget | `--surface-widget` |
| `--alpha-white-10` | `#ffffff1a` | Separador tenue | sin uso semántico hoy |
| `--alpha-white-30` | `#ffffff4d` | Trazo tenue | sin uso semántico hoy |
| `--alpha-white-60` | `#ffffff99` | Trazo medio | sin uso semántico hoy |
| `--alpha-black-30` | `#0000004d` | Sombra inferior del widget | `--surface-widget` |
| `--alpha-black-40` | `#00000066` | Velo de modal | `--surface-overlay` |
| `--alpha-green-10` | `#02ca501a` | Intensidad 1 de treemap | `--treemap-pos-1` |
| `--alpha-green-20` | `#02ca5033` | Relleno positivo fino | `--fills-positive-thin` |
| `--alpha-green-35` | `#02ca5059` | Intensidad 3 de treemap | `--treemap-pos-3` |
| `--alpha-green-60` | `#02ca5099` | Intensidad 4 de treemap | `--treemap-pos-4` |
| `--alpha-red-10` | `#ff40341a` | Intensidad 1 de treemap | `--treemap-neg-1` |
| `--alpha-red-20` | `#ff403433` | Relleno negativo fino | `--fills-negative-thin` |
| `--alpha-red-35` | `#ff403459` | Intensidad 3 de treemap | `--treemap-neg-3` |
| `--alpha-red-60` | `#ff403499` | Intensidad 4 de treemap | `--treemap-neg-4` |
| `--alpha-orange-20` | `#ff950033` | Fondo de aviso del negocio | sin uso semántico hoy |
| `--alpha-yellow-20` | `#edc50033` | Fondo de aviso de dato | `--fills-warning-thin` |
| `--alpha-aqua-20` | `#5ed3e533` | Fondo de acento | `--fills-accent-thin` |
| `--alpha-aqua-30` | `#5ed3e54d` | Banda de referencia del score | `--chart-band` |

## Capa 2 · Semánticos

Dicen qué significa el color, nunca cuál es. Siempre `var(--primitivo)`.

| Token | Valor | Uso | Ejemplo |
| --- | --- | --- | --- |
| `--bg` | `var(--navy-950)` | Fondo de la aplicación | `<body>` |
| `--surface-primary` | `var(--navy-900)` | Superficie de widget y tarjeta | `Card` |
| `--surface-elevated` | `var(--navy-800)` | Popover, select, estado muted | `Select` |
| `--surface-raised` | `var(--navy-700)` | Fila activa, acento de fondo | fila seleccionada |
| `--surface-overlay` | `var(--alpha-black-40)` | Velo bajo el modal | overlay de diálogo |
| `--surface-tooltip` | `var(--navy-600)` | Fondo de tooltip | tooltip de gráfica |
| `--surface-widget` | `linear-gradient(180deg, var(--alpha-white-5), var(--alpha-black-30))` | Único gradiente permitido: volumen del widget | cabecera de widget |
| `--content-primary` | `var(--white)` | Texto y cifra principal | título de widget |
| `--content-secondary` | `var(--gray-4)` | Texto de apoyo y etiquetas | `text-muted-foreground` |
| `--content-tertiary` | `var(--gray-5)` | Texto auxiliar de tamaño grande | pie de gráfica |
| `--content-disabled` | `var(--gray-6)` | Control inactivo (no es texto legible) | botón deshabilitado |
| `--content-positive` | `var(--green-500)` | Mejora, delta positivo | `+4,8 %` |
| `--content-negative` | `var(--red-500)` | Deterioro, delta negativo | `-4,8 %` |
| `--content-alert` | `var(--orange-500)` | Aviso del negocio (bache, alerta) | badge de alerta |
| `--content-warning` | `var(--yellow-500)` | Aviso sobre el dato (mock, parcial) | banner de demostración |
| `--content-accent` | `var(--aqua-400)` | Acento de Embat: enlace, selección, foco | enlace a la ficha |
| `--fills-positive` | `var(--green-500)` | Barra o área positiva | barra de cobros |
| `--fills-positive-thin` | `var(--alpha-green-20)` | Fondo positivo tenue | fila en verde |
| `--fills-negative` | `var(--red-500)` | Barra o área negativa | barra de pagos |
| `--fills-negative-thin` | `var(--alpha-red-20)` | Fondo negativo tenue | fila en rojo |
| `--fills-warning-thin` | `var(--alpha-yellow-20)` | Fondo de aviso de dato | banda de fixture |
| `--fills-accent-thin` | `var(--alpha-aqua-20)` | Fondo de selección | fila seleccionada |
| `--border-primary` | `var(--navy-700)` | Separación de widget, tabla y control | `border-border` |
| `--border-focus` | `var(--aqua-400)` | Anillo de foco | `--ring` |
| `--border-positive` | `var(--green-500)` | Borde de estado positivo | badge de mejora |
| `--border-negative` | `var(--red-500)` | Borde de estado negativo | badge de deterioro |
| `--regime-improving` | `var(--green-500)` | Régimen: mejorando | sparkline al alza |
| `--regime-deteriorating` | `var(--red-500)` | Régimen: deteriorándose | sparkline a la baja |
| `--regime-blip` | `var(--orange-500)` | Régimen: bache puntual | caída y vuelta |
| `--regime-stable` | `var(--gray-4)` | Régimen: estable | línea plana |
| `--regime-recovering` | `var(--aqua-400)` | Régimen: recuperando | caída y remontada |
| `--regime-warmup` | `var(--gray-6)` | Régimen: calentamiento (sin histórico) | serie corta |
| `--band-solid` | `var(--green-500)` | Banda: sólida | franja superior |
| `--band-healthy` | `var(--green-700)` | Banda: sana | segunda franja |
| `--band-watch` | `var(--orange-500)` | Banda: vigilancia | tercera franja |
| `--band-stress` | `var(--red-500)` | Banda: tensión | franja inferior |
| `--chart-score` | `var(--white)` | Línea del score | serie principal |
| `--chart-band` | `var(--alpha-aqua-30)` | Banda de referencia | área bajo la línea |
| `--chart-positive` | `var(--green-500)` | Serie positiva | entradas |
| `--chart-negative` | `var(--red-500)` | Serie negativa | salidas |
| `--chart-neutral` | `var(--gray-4)` | Serie neutra, ejes | rejilla |
| `--chart-pillar-liquidity` | `var(--tone-aqua)` | Pilar de liquidez | barra de pilar |
| `--chart-pillar-payments` | `var(--tone-green)` | Pilar de pagos | barra de pilar |
| `--chart-pillar-collections` | `var(--tone-yellow)` | Pilar de cobros | barra de pilar |
| `--chart-pillar-debt` | `var(--tone-orange)` | Pilar de deuda | barra de pilar |
| `--chart-pillar-activity` | `var(--tone-violet)` | Pilar de actividad | barra de pilar |
| `--treemap-pos-1` | `var(--alpha-green-10)` | Intensidad positiva 1 (menor) | celda pequeña |
| `--treemap-pos-2` | `var(--alpha-green-20)` | Intensidad positiva 2 | celda media |
| `--treemap-pos-3` | `var(--alpha-green-35)` | Intensidad positiva 3 | celda grande |
| `--treemap-pos-4` | `var(--alpha-green-60)` | Intensidad positiva 4 (mayor) | celda dominante |
| `--treemap-neg-1` | `var(--alpha-red-10)` | Intensidad negativa 1 (menor) | celda pequeña |
| `--treemap-neg-2` | `var(--alpha-red-20)` | Intensidad negativa 2 | celda media |
| `--treemap-neg-3` | `var(--alpha-red-35)` | Intensidad negativa 3 | celda grande |
| `--treemap-neg-4` | `var(--alpha-red-60)` | Intensidad negativa 4 (mayor) | celda dominante |

## Capa 3 · Componente

Medidas, tipografía y motion del tablero. Sin color.

| Token | Valor | Uso | Ejemplo |
| --- | --- | --- | --- |
| `--radius-control` | `6px` | Radio de control y swatch | botón, input |
| `--radius-card` | `8px` | Radio de widget | tarjeta |
| `--radius-pill` | `9999px` | Radio de píldora | badge |
| `--size-topbar` | `60px` | Alto de la barra superior | `AppShell` |
| `--size-button` | `32px` | Alto de botón | botón |
| `--size-input` | `32px` | Alto de campo | input |
| `--size-segment` | `32px` | Alto de control segmentado | tabs |
| `--size-row` | `32px` | Alto de fila de lista | lista de sociedades |
| `--size-table-row` | `24px` | Alto de fila de tabla densa | tabla de movimientos |
| `--size-sparkline-w` | `64px` | Ancho de sparkline | régimen en tabla |
| `--size-sparkline-h` | `16px` | Alto de sparkline | régimen en tabla |
| `--size-chart-large` | `148px` | Alto de gráfica de widget | serie del score |
| `--grid-cols` | `24` | Columnas de la rejilla del tablero | rejilla |
| `--grid-gap` | `8px` | Separación de la rejilla | rejilla |
| `--grid-row` | `31px` | Alto de fila de la rejilla | rejilla |
| `--widget-padding` | `0 16px 16px` | Relleno del widget | cuerpo de widget |
| `--text-micro` | `11px` | Etiquetas, unidades y notas | leyenda |
| `--text-control` | `12px` | Controles, tablas y leyendas | celda |
| `--text-body` | `13px` | Texto corrido | párrafo |
| `--text-widget-title` | `18px` | Título de widget | cabecera |
| `--text-figure` | `20px` | Cifra destacada | score |
| `--duration-fast` | `150ms` | Cambio de estado inmediato | hover, foco |
| `--duration-moderate` | `200ms` | Entrada y salida de capa | popover, tooltip |
| `--duration-emphasis` | `250ms` | Cambio de contexto | panel lateral, modal |
| `--ease-enter` | `cubic-bezier(.165, .84, .44, 1)` | Entrada: rápido y frena | apertura de popover |
| `--ease-exit` | `cubic-bezier(.25, .46, .45, .94)` | Salida: arranca y se va | cierre de popover |
| `--ease-fade` | `cubic-bezier(.25, .1, .25, 1)` | Opacidad pura | banner que aparece |
| `--z-dropdown` | `1000` | Capa de desplegable | select |
| `--z-sticky` | `1100` | Cabecera fija | cabecera de tabla |
| `--z-overlay` | `1300` | Velo | overlay de modal |
| `--z-modal` | `1400` | Modal | diálogo |
| `--z-popover` | `1500` | Popover | filtro |
| `--z-toast` | `1700` | Aviso efímero | toast |
| `--z-tooltip` | `1800` | Tooltip | tooltip de gráfica |
| `--radius-sm` \| `-md` \| `-lg` \| `-xl` | `calc(var(--radius) - 2px)` \| `var(--radius)` \| `calc(var(--radius) + 2px)` \| `calc(var(--radius) + 6px)` | Escala de radios de shadcn | `rounded-md` |
| `--font-sans` | `"Geist Variable", ui-sans-serif, system-ui, sans-serif` | Texto | `<html>` |
| `--font-mono` | `"Geist Mono Variable", ui-monospace, "SF Mono", monospace` | Cifras | `.num` |

## Alias de shadcn

Nombres heredados que consumen los componentes `ui/*`. Siempre una referencia a un
semántico, nunca un valor propio. `@theme inline` los expone además como utilidades
(`--color-*`: `bg-card`, `text-muted-foreground`, `border-border`…), junto con la capa
semántica completa (`text-content-positive`, `bg-surface-elevated`…).

| Token | Valor | Uso | Ejemplo |
| --- | --- | --- | --- |
| `--background` | `var(--bg)` | Fondo de página | `bg-background` |
| `--foreground` | `var(--content-primary)` | Texto de página | `text-foreground` |
| `--card` | `var(--surface-primary)` | Fondo de tarjeta | `Card` |
| `--card-foreground` | `var(--content-primary)` | Texto de tarjeta | `Card` |
| `--popover` | `var(--surface-elevated)` | Fondo de capa flotante | `Select` |
| `--popover-foreground` | `var(--content-primary)` | Texto de capa flotante | `Select` |
| `--primary` | `var(--content-accent)` | Acción y enlace principal | `Button` por defecto |
| `--primary-foreground` | `var(--bg)` | Texto sobre acento | `Button` por defecto |
| `--secondary` | `var(--surface-elevated)` | Fondo secundario | `Badge variant="secondary"` |
| `--secondary-foreground` | `var(--content-primary)` | Texto secundario | `Badge` |
| `--muted` | `var(--surface-elevated)` | Fondo apagado | `Skeleton` |
| `--muted-foreground` | `var(--content-secondary)` | Texto apagado | `text-muted-foreground` |
| `--accent` | `var(--surface-raised)` | Fondo de hover y selección | fila de tabla |
| `--accent-foreground` | `var(--content-primary)` | Texto sobre acento de fondo | fila de tabla |
| `--destructive` | `var(--content-negative)` | Acción destructiva y error | `ErrorState` |
| `--destructive-foreground` | `var(--bg)` | Texto sobre destructivo | botón destructivo |
| `--border` | `var(--border-primary)` | Borde por defecto | `border-border` |
| `--input` | `var(--border-primary)` | Borde de campo | `Input` |
| `--ring` | `var(--border-focus)` | Anillo de foco | `:focus-visible` |
| `--positive` | `var(--content-positive)` | Verde de producto | `text-positive` |
| `--negative` | `var(--content-negative)` | Rojo de producto | `text-negative` |
| `--warning` | `var(--content-warning)` | Amarillo de aviso de dato | banner de demostración |
| `--chart-1` | `var(--chart-score)` | Serie 1 de recharts | línea del score |
| `--chart-2` | `var(--chart-band)` | Serie 2 de recharts | banda |
| `--chart-3` | `var(--chart-positive)` | Serie 3 de recharts | entradas |
| `--chart-4` | `var(--chart-negative)` | Serie 4 de recharts | salidas |
| `--chart-5` | `var(--chart-neutral)` | Serie 5 de recharts | neutra |
| `--radius` | `6px` | Radio base de shadcn | `rounded-md` |

## Semántica de datos

Qué significa cada color cuando lo lleva un dato. No hay color decorativo: si algo está
coloreado, el color afirma algo.

**Régimen del motor** (seis estados, seis colores distintos, más una forma):

| Régimen | Token | Lectura | Forma de la sparkline |
| --- | --- | --- | --- |
| Mejorando | `--regime-improving` | El score sube de forma sostenida | pendiente al alza |
| Deteriorándose | `--regime-deteriorating` | El score baja de forma sostenida | pendiente a la baja |
| Bache | `--regime-blip` | Caída puntual ya revertida | caída y vuelta |
| Estable | `--regime-stable` | Sin movimiento relevante | plana |
| Recuperando | `--regime-recovering` | Remonta después de una caída | valle y subida |
| Calentamiento | `--regime-warmup` | Histórico insuficiente para juzgar | ruido inicial |

**Banda de salud del score** (de mejor a peor): `--band-solid` (Sólida),
`--band-healthy` (Sana), `--band-watch` (Vigilancia), `--band-stress` (Tensión). La banda
califica el nivel; el régimen, la dirección. Nunca se sustituyen.

**Dirección de un delta**: positivo `--content-positive`, negativo `--content-negative`,
sin cambio o sin base comparable `--content-secondary` con el valor ausente `—`. El signo
va siempre en el texto: el color acompaña, no informa solo.

**Estado de alerta del negocio**: naranja `--content-alert` (bache, aviso, severidad que
pide mirar) y rojo `--content-negative` cuando el dato ya es un deterioro.

**Estado de dato mock o parcial**: amarillo `--content-warning` sobre
`--fills-warning-thin`. El amarillo se reserva a avisos **sobre el dato** (fixture, demo,
histórico incompleto) y no aparece nunca en un resultado del negocio. El naranja es lo
contrario: solo negocio, nunca procedencia del dato.

**Pilares del score**: cinco tonos desaturados (`--chart-pillar-*`) que no reutilizan el
semáforo, para que una barra de pilar no se lea como bueno o malo.

## Tipografía y cifras

- Texto: **Geist Variable** (`--font-sans`), servida desde `@fontsource-variable/geist`.
  Sin CDN.
- Cifras: **Geist Mono Variable** (`--font-mono`) mediante la clase `.num`, con
  `font-variant-numeric: tabular-nums`. Además `html` lleva
  `font-feature-settings: "tnum"`: las columnas de números no bailan al cambiar de valor.
- Pesos: `400` texto corrido, `500` etiquetas y controles, `600` títulos y cifras. No hay
  `700`, ni `font-synthesis` (`font-synthesis-weight: none`).
- Escala de cinco tamaños: `--text-micro` 11px, `--text-control` 12px, `--text-body` 13px
  (tamaño base del `body`), `--text-widget-title` 18px, `--text-figure` 20px. No se usan
  tamaños fuera de la escala.
- Formato de cifra, según §2 del contrato visual: coma decimal (`12,3`), millares con
  punto, `pts` como unidad del score (`12,3 pts`) y `%` para deltas (`-4,8 %`), con espacio
  antes del símbolo. Valor ausente: `—`, nunca `0`.
- Toda cifra va con `.num`, incluidos identificadores y fechas, para que las tablas alineen.

## Motion

| Duración | Valor | Cuándo |
| --- | --- | --- |
| `--duration-fast` | `150ms` | Cambio de estado inmediato: hover, foco, pulsación |
| `--duration-moderate` | `200ms` | Entrada y salida de una capa: popover, tooltip, desplegable |
| `--duration-emphasis` | `250ms` | Cambio de contexto: panel lateral, modal, cambio de pantalla |

| Easing | Valor | Cuándo |
| --- | --- | --- |
| `--ease-enter` | `cubic-bezier(.165, .84, .44, 1)` | Lo que entra: arranca rápido y frena |
| `--ease-exit` | `cubic-bezier(.25, .46, .45, .94)` | Lo que sale: arranca suave y se va |
| `--ease-fade` | `cubic-bezier(.25, .1, .25, 1)` | Solo opacidad, sin desplazamiento |

Cuándo NO se anima:

- **Datos que cambian por replay**: al avanzar el mes, las cifras y las series se
  sustituyen de golpe. Una cifra que interpola es una cifra que miente durante 200ms.
- **Listas y tablas largas**: nada de entradas escalonadas por fila. Se pintan y ya.
- **`prefers-reduced-motion: reduce`**: todo componente que anime cubre esta consulta y se
  queda en el cambio de estado, sin desplazamiento. Hoy ningún componente anima, así que la
  hoja todavía no declara la regla.
- Nada anima por encima de `250ms`: es un tablero de trabajo, no una presentación.

## Contraste

Ratios WCAG 2.1 medidos con `contrastRatio(expandToken(...), expandToken(...))` sobre los
valores resueltos de `index.css`, no estimados. Umbrales: `>= 4.5` AA texto, `>= 3` AA para
texto grande y elementos gráficos.

| Texto | Fondo | Ratio | Veredicto |
| --- | --- | --- | --- |
| `--content-primary` | `--bg` | 19,50 | AA texto |
| `--content-primary` | `--surface-primary` | 18,34 | AA texto |
| `--content-secondary` | `--bg` | 6,57 | AA texto |
| `--content-secondary` | `--surface-primary` | 6,18 | AA texto |
| `--content-tertiary` | `--bg` | 3,66 | AA grande/gráfico |
| `--content-tertiary` | `--surface-primary` | 3,44 | AA grande/gráfico |
| `--content-positive` | `--surface-primary` | 8,36 | AA texto |
| `--content-negative` | `--surface-primary` | 5,27 | AA texto |
| `--content-alert` | `--surface-primary` | 8,34 | AA texto |
| `--content-warning` | `--surface-primary` | 10,99 | AA texto |
| `--content-accent` | `--surface-primary` | 10,42 | AA texto |
| `--band-solid` | `--surface-primary` | 8,36 | AA texto |
| `--band-healthy` | `--surface-primary` | 4,40 | AA grande/gráfico |
| `--band-watch` | `--surface-primary` | 8,34 | AA texto |
| `--band-stress` | `--surface-primary` | 5,27 | AA texto |
| `--regime-stable` | `--surface-primary` | 6,18 | AA texto |
| `--regime-recovering` | `--surface-primary` | 10,42 | AA texto |
| `--chart-score` | `--surface-primary` | 18,34 | AA texto |
| `--border-focus` | `--surface-primary` | 10,42 | AA texto |

Tres excepciones conocidas, todas deliberadas:

| Token | Fondo | Ratio | Por qué se acepta |
| --- | --- | --- | --- |
| `--content-disabled` | `--surface-primary` | 2,13 | Control inactivo: no transporta información legible |
| `--regime-warmup` | `--surface-primary` | 2,13 | Ausencia de dato; siempre acompañado de etiqueta en texto |
| `--border-primary` | `--surface-primary` | 1,23 | Separación estructural, no contenido |

`--content-tertiary` y `--band-healthy` se quedan entre 3 y 4,5: valen para cifra grande,
leyenda y elemento gráfico, no para texto pequeño de lectura.

Los cuatro primeros bloques los vigila `src/design/tokens.test.ts`; la tabla completa se
puede ver medida en vivo en `/tokens`.

## Qué NO hace este sistema

- **Sin morado ni rosa de Embat en producto**: viven en la marca, no en el tablero. El
  único violeta es `--tone-violet`, un tono desaturado de pilar.
- **Sin sombras difusas**: la profundidad se consigue con superficies (`--surface-*`) y
  bordes, no con `box-shadow`.
- **Sin gradientes decorativos**: el único gradiente del sistema es `--surface-widget`, y
  su rango total es del 5% de blanco al 30% de negro.
- **Sin color literal fuera de `index.css`**: ningún `#rrggbb` en `src/**/*.tsx`. Si hace
  falta un color nuevo, entra por la capa primitiva y se le da nombre semántico.
- **Sin tema claro**: `:root` y `.dark` llevan los mismos valores y `color-scheme: dark`.
- **Sin tamaños, radios ni duraciones fuera de la escala**: si algo pide un valor nuevo,
  se discute el token, no se escribe el número en el componente.
