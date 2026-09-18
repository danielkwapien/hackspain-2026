/**
 * Lienzo del tablero: rejilla CSS de 24 columnas con arrastre, redimension,
 * maximizado y movimiento por teclado.
 *
 * Tres decisiones que se notan aguas abajo:
 * - El ancho se mide con `ResizeObserver` sobre el propio lienzo. Nunca
 *   `window.innerWidth` en render: el lienzo no ocupa toda la ventana y leer la
 *   ventana al pintar ata el layout al tamaño del navegador.
 * - El alto lo da el hueco que deja el marco (`h-full` dentro de un `<main>` que
 *   ya está flexado), no un `calc` sobre `100vh`: restar a mano la topbar y el
 *   banner de mock sobra un poco, la página scrollea y esa barra de scroll le
 *   quita ancho a la rejilla. Si los widgets no caben, scrollea el lienzo.
 * - Maximizar es estado local: no va al store y por tanto no se persiste. Volver
 *   al tablero mañana no debe devolverte un widget a pantalla completa.
 * - Durante el arrastre solo se mueve un `transform`; el store se escribe una
 *   sola vez, al soltar.
 */

// Módulo de solo efecto: registra los tipos de widget disponibles en el registro.
import "@/widgets/register-all";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent, ReactElement } from "react";
import { cn } from "cn";
import { Plus } from "lucide-react";
import { WidgetFrame } from "@/widgets/WidgetFrame";
import { getWidget } from "@/widgets/registry";
import {
  GRID_COLS,
  GRID_GAP,
  GRID_PADDING,
  GRID_ROW_HEIGHT,
  cellStyle,
  columnWidth,
  pixelsToCells,
} from "./grid";
import { moveWidget, resizeWidget, useActiveWorkspace } from "./store";
import type { LayoutItem } from "./types";
import { WidgetCatalog } from "./WidgetCatalog";

/** Desplazamiento en celdas de cada flecha. */
const ARROWS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const KEYBOARD_HINT =
  "Mayús y flechas mueve el widget, Mayús+Alt y flechas lo redimensiona, Intro maximiza y Escape restaura";

const RESIZE_HANDLE_SIZE = 12;

type Drag = {
  i: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  base: LayoutItem;
};

/**
 * Qué arranca un `pointerdown`, si es que arranca algo. Fuera del asa de
 * arrastre y del asa de resize el puntero es del contenido del widget: si el
 * lienzo lo captura, el `click` no llega a su destino y una fila del Buscador
 * deja de vincular la empresa.
 */
function dragMode(target: HTMLElement): Drag["mode"] | null {
  if (target.closest("[data-resize-handle]")) return "resize";
  if (!target.closest("[data-widget-drag-handle]")) return null;
  // Los controles de la cabecera son suyos: el lienzo no les roba el puntero.
  return target.closest("button, input, [role=menu]") ? null : "move";
}

function itemLabel(item: LayoutItem): string {
  const entity = item.entities[0];
  if (entity) return entity.name ?? entity.id;
  return getWidget(item.type)?.title ?? item.type;
}

export function Canvas(): ReactElement {
  const workspace = useActiveWorkspace();
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const [colWidth, setColWidth] = useState(() => columnWidth(0));
  const [maximized, setMaximized] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [offset, setOffset] = useState<{ i: string; dx: number; dy: number } | null>(null);

  // El ancho solo sirve para traducir pixeles de arrastre a celdas.
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setColWidth(columnWidth(node.clientWidth)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Derivado, no efecto: cambiar de espacio deja el maximizado sin sujeto.
  const maximizedId = workspace.layout.some((item) => item.i === maximized) ? maximized : null;

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, item: LayoutItem): void {
    if (event.button !== 0) return;
    const mode = dragMode(event.target as HTMLElement);
    if (!mode) return;

    // `preventDefault` se come el foco que daria el clic: se pone a mano.
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { i: item.i, mode, startX: event.clientX, startY: event.clientY, base: item };
    setOffset({ i: item.i, dx: 0, dy: 0 });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({ i: drag.i, dx: event.clientX - drag.startX, dy: event.clientY - drag.startY });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setOffset(null);
    const cells = pixelsToCells(event.clientX - drag.startX, event.clientY - drag.startY, colWidth);
    if (cells.x === 0 && cells.y === 0) return;
    if (drag.mode === "move") {
      moveWidget(drag.i, { x: drag.base.x + cells.x, y: drag.base.y + cells.y });
      return;
    }
    resizeWidget(
      drag.i,
      { w: drag.base.w + cells.x, h: drag.base.h + cells.y },
      getWidget(drag.base.type)?.minSize,
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, item: LayoutItem): void {
    // Solo cuando el foco está en el contenedor: dentro mandan los controles.
    if (event.target !== event.currentTarget) return;

    if (event.key === "Enter") {
      event.preventDefault();
      setMaximized(item.i);
      return;
    }
    if (event.key === "Escape") {
      if (!maximizedId) return;
      event.preventDefault();
      // El marco también escucha Escape en `document` mientras está maximizado.
      event.stopPropagation();
      setMaximized(null);
      return;
    }

    const step = ARROWS[event.key];
    if (!step || !event.shiftKey) return;
    event.preventDefault();
    if (event.altKey) {
      resizeWidget(
        item.i,
        { w: item.w + step.x, h: item.h + step.y },
        getWidget(item.type)?.minSize,
      );
      return;
    }
    moveWidget(item.i, { x: item.x + step.x, y: item.y + step.y });
  }

  return (
    <div
      ref={canvasRef}
      className="relative h-full w-full overflow-auto"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
        gridAutoRows: `${GRID_ROW_HEIGHT}px`,
        gap: `${GRID_GAP}px`,
        padding: `${GRID_PADDING}px`,
      }}
    >
      {workspace.layout.map((item) => {
        const isMaximized = maximizedId === item.i;
        const dragging = offset?.i === item.i;
        return (
          <div
            key={item.i}
            role="group"
            tabIndex={0}
            aria-label={itemLabel(item)}
            title={KEYBOARD_HINT}
            hidden={maximizedId !== null && !isMaximized}
            className={cn(
              "group/widget relative min-h-0 min-w-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              isMaximized
                ? "absolute inset-4 z-20 transition-all duration-200 ease-[cubic-bezier(0.165,0.84,0.44,1)] motion-reduce:transition-none"
                : null,
              dragging ? "z-30 shadow-lg" : null,
            )}
            style={{
              ...(isMaximized ? {} : cellStyle(item)),
              ...(dragging ? { transform: `translate(${offset.dx}px, ${offset.dy}px)` } : {}),
            }}
            onPointerDown={(event) => handlePointerDown(event, item)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={(event) => handleKeyDown(event, item)}
          >
            <WidgetFrame
              item={item}
              isMaximized={isMaximized}
              onMaximize={() => setMaximized(isMaximized ? null : item.i)}
            />
            <button
              type="button"
              data-resize-handle=""
              aria-label="Redimensionar widget"
              className="absolute right-0 bottom-0 cursor-se-resize rounded-br-lg opacity-0 transition-opacity group-hover/widget:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
              style={{ width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE }}
            >
              <span
                aria-hidden="true"
                className="block size-full rounded-br-lg border-r-2 border-b-2 border-muted-foreground"
              />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        aria-label="Añadir widget"
        className="absolute right-4 bottom-4 z-10 flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => setCatalogOpen(true)}
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>

      <WidgetCatalog open={catalogOpen} onClose={() => setCatalogOpen(false)} />
    </div>
  );
}
