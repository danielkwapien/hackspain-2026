# Cómo añadir un widget al tablero

El tablero (`app/web/src/dashboard/`) no conoce ningún widget concreto: pinta lo que haya en el
registro (`app/web/src/widgets/registry.ts`). Añadir uno son diez líneas y un componente.

## Las diez líneas

```ts
// app/web/src/widgets/mi-widget/index.ts
import { registerWidget } from "../registry";
import { MiWidget } from "./MiWidget";

registerWidget({
  type: "mi-widget",                 // clave estable: se persiste en el layout
  title: "Mi widget",                // nombre del tipo, en español
  description: "Una línea para el catálogo.",
  defaultSize: { w: 8, h: 8 },       // celdas de la rejilla de 24 columnas
  minSize: { w: 4, h: 6 },           // el resize no baja de aquí
  needsEntity: "one",                // "none" | "one" | "many"
  entityKinds: ["company"],          // qué puede elegirse en el selector
  maxEntities: 1,                    // el selector en modo multi no pasa de aquí
  showsTypeTitle: true,              // pinta el título de 18 px bajo la cabecera
  component: MiWidget,
});
```

Y una línea en `app/web/src/widgets/register-all.ts`, que es lo único que importa el lienzo:

```ts
import "./mi-widget";
```

## El componente

Recibe un solo prop, el item del layout, y se ocupa **solo del contenido**: el marco
(`WidgetFrame`) ya pinta la cabecera, el punto de vínculo, el selector de entidad, el botón de
maximizar y el menú.

```tsx
export function MiWidget({ item }: WidgetContentProps) {
  const entity = item.entities[0];
  if (!entity) return <EmptyState title="Sin empresa seleccionada" description="Elige una en la cabecera del widget." />;
  // ...
}
```

Reglas que el widget sí tiene que cumplir:

- **Estados explícitos**: carga (skeleton con la forma del contenido), vacío, error (causa y
  «Reintentar»), datos insuficientes. Nunca un cero de relleno donde falta el dato.
- **Cifras** con `font-mono tabular-nums`, alineadas a la derecha, al tamaño de la escala
  (`--text-figure` la cifra destacada, `--text-control` la tabla, `--text-micro` la nota).
- **Color por token**, nunca un hex literal en el `.tsx` (lo vigila `src/design/tokens.test.ts`).
  El contenido usa la capa semántica (`text-content-secondary`, `bg-surface-raised`,
  `bg-surface-elevated`, `text-content-positive` / `text-content-negative` en los deltas), no los
  alias de shadcn, que se quedan en `components/ui/**`.
- **Régimen y banda** se traducen con `REGIME_LABEL` / `REGIME_CLASS` y `BAND_LABEL` /
  `BAND_CLASS` de `widgets/regime.ts`: un color por régimen (`--regime-improving`,
  `--regime-deteriorating`, `--regime-blip`, `--regime-stable`, `--regime-recovering`,
  `--regime-warmup`) y uno por banda (`--band-solid`, `--band-healthy`, `--band-watch`,
  `--band-stress`). El único régimen sin token propio es `shock_pending`, que se pinta con
  `--content-alert` por ser un aviso del negocio.
- **El régimen como texto sale de `REGIME_CLASS`** y cumple 4,5:1 sobre el fondo. `--regime-warmup`
  es color de **trazo**, no de texto (mide 2,26:1): como etiqueta, `warmup` usa
  `--content-secondary`, y su token de régimen vive en `REGIME_STROKE_CLASS`, para la serie.
- **Motion** por token y respetando `prefers-reduced-motion`: entrada de capa
  `var(--duration-moderate) var(--ease-enter)`, salida `var(--duration-fast) var(--ease-exit)`,
  hover y foco `var(--duration-fast)`.
- **Copy** en español impersonal de tesorero, según `docs/dani/contrato-visual-v1.md` §3.

El marco lo pinta `WidgetFrame` y el widget no lo repite: fondo `--surface-widget` (el único
gradiente del sistema), radio `--radius-card`, relleno `--widget-padding`, cabecera de
`--size-row` y borde `--border-primary` al pasar por encima o al recibir el foco.

El sistema completo, con las tres capas y lo que significa cada color, está en
[`docs/design/tokens.md`](tokens.md); la fuente de verdad es `app/web/src/index.css`.

## Cómo se comunican los widgets

Cada item del layout lleva un `linkGroup` (`green`, `blue`, `orange` o `gray`). Un widget que fija
una entidad llama a `setEntities(item.i, [entity])` del store: eso la propaga a **todos** los
widgets del mismo color en el espacio activo. `gray` significa «sin vínculo» y solo se cambia a sí
mismo. El punto de la cabecera es el selector de color, y su color sale de `LINK_GROUP_CLASS`
(`widgets/registry.ts`), que mapea los cuatro vínculos a la capa semántica: no hay tokens
`--link-group-*`.

Un widget que necesita entidad la lee de `item.entities`; nunca la busca por su cuenta ni la guarda
en un estado propio.

## Tamaños

La rejilla son `--grid-cols` (24) columnas, `--grid-gap` (8 px) de separación y filas de
`--grid-row` (31 px). El lienzo los pinta con `var()` y `dashboard/grid.ts` los lee una sola vez de
la hoja para traducir píxeles a celdas al arrastrar; sus números solo son el fallback de un entorno
sin hoja. Para hacerse una idea: `w: 8, h: 12` son 584×458 px a 1800 px de ancho, la proporción del
widget mediano de Trade Republic.
