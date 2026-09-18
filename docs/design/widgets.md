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
- **Cifras** con `font-mono tabular-nums`, alineadas a la derecha.
- **Colores por variable CSS**, nunca un hex literal en el `.tsx`. El régimen y la banda se
  traducen con `REGIME_LABEL` / `REGIME_CLASS` / `BAND_LABEL` de `widgets/regime.ts`.
- **Copy** en español impersonal de tesorero, según `docs/dani/contrato-visual-v1.md` §3.

## Cómo se comunican los widgets

Cada item del layout lleva un `linkGroup` (`green`, `blue`, `orange` o `gray`). Un widget que fija
una entidad llama a `setEntities(item.i, [entity])` del store: eso la propaga a **todos** los
widgets del mismo color en el espacio activo. `gray` significa «sin vínculo» y solo se cambia a sí
mismo. El punto de la cabecera es el selector de color.

Un widget que necesita entidad la lee de `item.entities`; nunca la busca por su cuenta ni la guarda
en un estado propio.

## Tamaños

La rejilla son 24 columnas, gap de 8 px y filas de 31 px (`dashboard/grid.ts`). Para hacerse una
idea: `w: 8, h: 12` son 584×458 px a 1800 px de ancho, la proporción del widget mediano de Trade
Republic.
