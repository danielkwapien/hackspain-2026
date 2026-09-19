/**
 * Cuerpo del Mapa: el universo partido en tres columnas semánticas.
 *
 * Un solo treemap con 830 empresas en 432 px reparte fichas de 98 px² de área
 * mediana y deja CERO etiquetas: el mapa se ve, pero no se lee. El heatmap de
 * Trade Republic, al mismo ancho, dibuja 97 fichas y etiqueta 9, y su ficha
 * etiquetada más pequeña mide 52 × 41 px. De ahí la forma de este componente:
 * en vez de repartir todo el censo, se parte el universo por umbral sobre la
 * métrica (`splitColumns`), se enseña solo lo que cabe LEGIBLE en cada caja
 * (`fitCount`) y se dice cuántas quedan fuera. Lo que no cabe no se pinta
 * diminuto: se cuenta.
 *
 * Tres decisiones que no son estética:
 *
 * - **La columna se nombra por lo que significa**, nunca por su color. La
 *   columna dice lo mismo que diría una leyenda de color y además se lee sin
 *   distinguir el verde del rojo: por eso el panel ya no lleva leyenda.
 * - **Las tres columnas comparten una sola escala de intensidad**: el máximo
 *   |valor − neutral| de TODA la vista, no el de cada caja. Si cada una se
 *   normalizara contra su propio máximo, el mismo tono significaría cosas
 *   distintas en cada columna y el color mentiría.
 * - **La cabecera de la columna dice cuántas y cuánto**: el censo completo y el
 *   total de la magnitud elegida sobre ese censo, no sobre las diez que se
 *   pintan. «406,4 M pendientes de cobro con empresas en tensión» es la frase
 *   que se viene a buscar, y el top-10 visible es solo el 68,6 % de ella. El
 *   TÍTULO no se trunca nunca: es lo que da sentido al resto del renglón, así
 *   que cuando el ancho no da se cae primero el total y luego el censo.
 * - **El pie dice cuánto se queda fuera**, no solo cuántas: «y 474 más ·
 *   EUR 421,1 M». Un recuento sin su dinero no distingue cuatro euros de
 *   cuatrocientos millones, y lo que no se pinta se cuenta.
 * - **Las tres posiciones no bailan nunca**: una columna vacía se pinta igual,
 *   con su título y su texto de vacío, y el pie reserva su alto aunque no sobre
 *   nadie. Si la columna del medio desapareciera al quedarse sin gente, la de
 *   la derecha ocuparía su sitio y el lector leería «tensión» donde pone
 *   «vigilancia».
 *
 * A poco ancho las tres no caben legibles una al lado de otra: se apilan en
 * vertical y el tope por columna baja a `STACKED_PER_COLUMN`.
 */

import { useMemo } from "react";
import type { ReactElement } from "react";
import {
  COLUMN_SPLIT,
  MAX_PER_COLUMN,
  STACKED_PER_COLUMN,
  Treemap,
  columnWidths,
  fitCount,
  splitColumns,
  textWidth,
  tileValue,
} from "@/charts";
import type { ColumnDatum, TreemapUnit } from "@/charts";
import type { TreemapResponse } from "@/lib/api-v2";
import { formatCount } from "@/lib/format";
import { fmtSizeTotal } from "@/widgets/treemap/TreemapHeader";

type Metric = TreemapResponse["metric"];

export type TreemapColumnsProps = {
  /**
   * Entidades CON métrica en el corte, ya aplanadas por el widget. Las que no
   * la tienen no llegan aquí: no entran en ninguna columna ni en ningún censo,
   * y el subtítulo las cuenta aparte.
   */
  items: readonly ColumnDatum[];
  metric: Metric;
  /** Magnitud del área: decide cómo se lee el total de cada columna. */
  sizeBy?: TreemapResponse["size_by"];
  width: number;
  height: number;
  onSelect?: (id: string) => void;
  onHover?: (id: string) => void;
};

/**
 * Título de cada columna, en orden mejor → medio → peor.
 *
 * Con `score` el vocabulario es el de la banda del motor (`BAND_LABEL`), el que
 * ya usa la Cartera («0 tensión · 3 vigilancia»): un score es un NIVEL, no una
 * dirección, y llamar «Mejorando» a un score alto sería mentir sobre lo que
 * mide. Un Δ sí es dirección, y ahí los títulos la nombran.
 */
export const COLUMN_TITLES: Record<Metric, readonly [string, string, string]> = {
  score: ["Sanas", "Vigilancia", "Tensión"],
  delta_1m: ["Mejorando", "Estable", "Deteriorando"],
  delta_3m: ["Mejorando", "Estable", "Deteriorando"],
};

/** Hueco entre columnas, en px (`gap-2`). */
const COLUMN_GAP = 8;

/**
 * Por debajo de este ancho medido las tres columnas se apilan en vertical.
 *
 * 500 px no es un redondeo: por debajo, cada columna baja de 160 px, el
 * squarified ya pone dos fichas por fila —80 px de ancho— y en 80 px no entra
 * el código de la empresa, así que `fitCount` se queda en cuatro fichas por
 * columna (medido: a 480 px de panel caen a tres, a 500 suben a diez). El hueco
 * real del Mapa en el tablero fijo son 432 px, o sea que ahí se apila: apiladas,
 * cada columna usa el ancho entero y enseña sus cinco con el código legible.
 */
const STACK_WIDTH = 500;

/** Alto fijo de la cabecera: el de la cabecera de sector de Trade Republic. */
const HEADER_HEIGHT = 18;

/** Alto del pie «y N más»; se reserva siempre, sobre gente o no. */
const FOOTER_HEIGHT = 18;

/** Cuerpo de cabecera y pie de columna (`--text-micro`), en px, para medir qué cabe. */
const META_FONT_SIZE = 11;

/** Separación entre las piezas de la cabecera (`gap-1`), en px. */
const META_GAP = 4;

/** El punto que separa el censo del total, con sus dos huecos. */
const SEPARATOR_WIDTH = META_GAP + textWidth("·", META_FONT_SIZE) + META_GAP;

/** Columna sin nadie: se dice corto y se deja el sitio. */
const EMPTY_COLUMN = "Sin empresas";

/** Suma de la magnitud, con la regla del layout: lo que no es positivo no suma. */
function sum(items: readonly { size: number }[]): number {
  return items.reduce((total, item) => total + (item.size > 0 ? item.size : 0), 0);
}

/** Cabecera y pie son apoyo, no dato: mismo cuerpo y mismo color. */
const META_CLASS = "text-[length:var(--text-micro)] text-content-secondary";

export function TreemapColumns({
  items,
  metric,
  sizeBy,
  width,
  height,
  onSelect,
  onHover,
}: TreemapColumnsProps): ReactElement {
  const stacked = width < STACK_WIDTH;

  const unit: TreemapUnit = metric === "score" ? "pts" : "delta";

  const { columns, scale, boxHeight } = useMemo(() => {
    const split = COLUMN_SPLIT[metric];
    const limit = stacked ? STACKED_PER_COLUMN : MAX_PER_COLUMN;
    // Sin recortar: el total de la columna se mide sobre su censo COMPLETO, no
    // sobre las diez que caben. «406,4 M € en tensión» es el dato; el top-10
    // que se pinta es solo el 68,6 % de esa cifra y decir su suma sería
    // responder a una pregunta que nadie ha hecho.
    const parts = splitColumns(items, split, items.length);
    // Una magnitud que no existe en el corte (`pending_eur` con el origen
    // local) suma 0 en todo el universo: el squarified daría tiles de área 0 y
    // el mapa se vería vacío. Áreas iguales y manda el orden, que el widget
    // dice en su línea de estado.
    const flat = !items.some((item) => item.size > 0);

    const scale = items.reduce(
      (max, item) =>
        Number.isFinite(item.value) ? Math.max(max, Math.abs(item.value - split.neutral)) : max,
      0,
    );

    // Apiladas, cada bloque se lleva un tercio del alto; en fila, las tres el alto entero.
    const blockHeight = stacked ? Math.floor((height - COLUMN_GAP * 2) / parts.length) : height;
    const boxHeight = blockHeight - HEADER_HEIGHT - FOOTER_HEIGHT;
    const widths = stacked
      ? parts.map(() => width)
      : columnWidths(
          parts.map((column) => column.total),
          Math.max(0, width - COLUMN_GAP * (parts.length - 1)),
        );

    const columns = parts.map((column, index) => {
      const box = { width: widths[index], height: boxHeight };
      // El tope lo aplica la columna aquí, antes de preguntar qué cabe: a
      // `fitCount` se le da ya la lista recortada.
      const candidates = column.items.slice(0, limit).map((item) => ({
        ...item,
        size: flat ? 1 : item.size,
      }));
      // `fitCount` mide la cifra que el tile va a pintar, así que se le da ya
      // formateada con `tileValue`: es la misma que sale en pantalla.
      const measured = candidates.map((item) => ({
        id: item.id,
        size: item.size,
        valueText: tileValue(item.value, unit),
      }));
      const fits = box.width > 0 && box.height > 0 ? fitCount(measured, box) : 0;
      const shown = candidates.slice(0, fits);
      const rest = column.total - fits;

      const title = COLUMN_TITLES[metric][index];
      const census = formatCount(column.total);
      // Suma de la magnitud en TODA la columna y la de lo que NO se pinta:
      // `null` cuando no hay magnitud que sumar y la cifra sería un 0 vacío.
      const hasMagnitude = sizeBy !== undefined && !flat && column.total > 0;
      const columnSize = sum(column.items);
      const magnitude = hasMagnitude ? fmtSizeTotal(sizeBy, columnSize) : null;
      // Lo que no se pinta se CUENTA: «y 474 más · EUR 421,1 M». Sin el dinero,
      // el pie no dice si lo que se queda fuera son cuatro euros o 421 millones.
      const restMagnitude =
        hasMagnitude && rest > 0
          ? fmtSizeTotal(sizeBy, Math.max(0, columnSize - sum(shown)))
          : null;

      // El título de la columna es lo que da sentido al mapa y NUNCA se trunca:
      // si el renglón no da para todo, cae primero el total y luego el censo.
      const titleWidth = textWidth(title, META_FONT_SIZE);
      const withCensus = titleWidth + META_GAP + textWidth(census, META_FONT_SIZE);
      const showCensus = withCensus <= box.width;
      const showMagnitude =
        magnitude !== null &&
        showCensus &&
        withCensus + SEPARATOR_WIDTH + textWidth(magnitude, META_FONT_SIZE) <= box.width;
      // Mismo criterio en el pie, que tampoco recorta: antes que desbordar
      // sobre la columna vecina, el pie se queda sin su total.
      const showRestMagnitude =
        restMagnitude !== null &&
        textWidth(`y ${formatCount(rest)} más`, META_FONT_SIZE) +
          SEPARATOR_WIDTH +
          textWidth(restMagnitude, META_FONT_SIZE) <=
          box.width;

      return {
        key: column.key,
        title,
        total: column.total,
        census,
        showCensus,
        magnitude: showMagnitude ? magnitude : null,
        restMagnitude: showRestMagnitude ? restMagnitude : null,
        shown,
        rest,
        box,
      };
    });

    return { columns, scale, boxHeight };
  }, [items, metric, sizeBy, unit, width, height, stacked]);

  const neutral = COLUMN_SPLIT[metric].neutral;

  return (
    <div className={`flex gap-2 ${stacked ? "flex-col" : "flex-row"}`} style={{ width, height }}>
      {columns.map((column) => (
        <div key={column.key} className="flex flex-col" style={{ width: column.box.width }}>
          <div
            className={`flex shrink-0 items-center gap-1 ${META_CLASS}`}
            style={{ height: HEADER_HEIGHT }}
          >
            {/* Sin `truncate`: «Tensi…» no nombra nada. Lo que no cabe se
                cae entero, y el título es lo último en caerse. */}
            <span className="shrink-0 whitespace-nowrap">{column.title}</span>
            {column.showCensus ? <span className="num">{column.census}</span> : null}
            {/* «406,4 M en tensión» es la frase que el cliente necesita: el
                censo dice cuántas y esto dice cuánto. */}
            {column.magnitude === null ? null : (
              <>
                <span>·</span>
                <span className="num whitespace-nowrap">{column.magnitude}</span>
              </>
            )}
          </div>

          <div style={{ height: Math.max(0, boxHeight) }}>
            {column.shown.length > 0 ? (
              <Treemap
                items={column.shown.map((item) => ({
                  id: item.id,
                  name: item.name,
                  size: item.size,
                  color_value: item.value,
                }))}
                width={column.box.width}
                height={boxHeight}
                unit={unit}
                neutral={neutral}
                scale={scale}
                label={`${column.title}, ${column.total} empresas`}
                onSelect={(datum) => onSelect?.(datum.id)}
                onHover={(datum) => onHover?.(datum.id)}
              />
            ) : column.total === 0 ? (
              <p className={META_CLASS}>{EMPTY_COLUMN}</p>
            ) : // Con censo pero sin sitio (una caja degenerada), el pie ya lo cuenta:
            // decir «sin empresas» encima de «y 12 más» sería mentira.
            null}
          </div>

          <div
            className={`flex shrink-0 items-center ${META_CLASS}`}
            style={{ height: FOOTER_HEIGHT }}
          >
            {column.rest > 0 ? (
              <span className="whitespace-nowrap">
                {"y "}
                <span className="num">{formatCount(column.rest)}</span>
                {" más"}
                {column.restMagnitude === null ? null : (
                  <>
                    {" · "}
                    <span className="num">{column.restMagnitude}</span>
                  </>
                )}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
