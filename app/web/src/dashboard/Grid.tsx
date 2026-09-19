/**
 * Lienzo del tablero: rejilla CSS de 24 columnas × 24 filas con arrastre,
 * redimensión, maximizado y movimiento por teclado. «Principal» pasa por aquí
 * igual que los tableros de usuario, con `locked`: solo se puede maximizar.
 *
 * Decisiones que se notan aguas abajo:
 * - Se mide con `ResizeObserver` en un `useLayoutEffect`, nunca con la ventana:
 *   el lienzo no ocupa toda la ventana y hay que conocer la fila antes del
 *   primer pintado. La altura de fila se escribe inline en `--grid-row` para que
 *   las 24 filas llenen el alto del `main`; si un tablero desborda, scrollea el
 *   lienzo, no la página.
 * - Durante el arrastre solo cambia un `transform`; el store se escribe una sola
 *   vez al soltar. El residuo entre el punto de suelta y la celda final se aplica
 *   como `transform` y se lleva a `none` en el siguiente frame con la transición
 *   de entrada: el widget se asienta en su celda en vez de saltar.
 * - Maximizar es estado local: no va al store y no se persiste.
 * - Por debajo de 1280 px los widgets se apilan en una columna por `(y, x)` y no
 *   se editan: el arrastre en celdas no tiene sentido sin la rejilla.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from "react";
import { cn } from "cn";
import { EmptyState } from "@/components/states";
import { useMediaQuery } from "@/lib/use-media-query";
import { WidgetFrame } from "@/widgets/WidgetFrame";
import { getWidget } from "@/widgets/registry";
import {
  GRID_PADDING,
  MIN_ROW_HEIGHT,
  cellStyle,
  columnWidth,
  gridMetrics,
  pixelsToCells,
  rowHeight,
} from "./grid-math";
import { getState, moveWidget, resizeWidget, selectActiveDashboard } from "./store";
import { GRID_ROWS } from "./types";
import type { Dashboard, LayoutItem } from "./types";

/** Desplazamiento en celdas de cada flecha. */
const ARROWS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const KEYBOARD_HINT =
  "Mayús y flechas mueve el widget, Mayús+Alt y flechas lo redimensiona, Intro maximiza y Escape restaura";

/** Bajo `xl` de Tailwind (1280 px) la rejilla se apila. */
const STACKED_QUERY = "(max-width: 1279.98px)";

type Mode = "move" | "resize";

type Drag = { i: string; mode: Mode; startX: number; startY: number; base: LayoutItem };

/** Lo que se pinta fuera del store: el desplazamiento del gesto o el residuo que se asienta. */
type Gesture = { i: string; mode: Mode; dx: number; dy: number; phase: "drag" | "settle" };

/**
 * Qué arranca un `pointerdown`, si es que arranca algo. Fuera del asa de
 * arrastre y del asa de resize el puntero es del contenido del widget: si el
 * lienzo lo captura, el `click` no llega a su destino.
 */
function dragMode(target: HTMLElement): Mode | null {
  if (target.closest("[data-resize-handle]")) return "resize";
  if (!target.closest("[data-widget-drag-handle]")) return null;
  // Los controles de la cabecera son suyos: el lienzo no les roba el puntero.
  return target.closest("button, input, [role=menu]") ? null : "move";
}

function gestureStyle(gesture: Gesture | null): CSSProperties {
  if (!gesture) return {};
  if (gesture.mode === "move") {
    return { transform: `translate(${gesture.dx}px, ${gesture.dy}px)` };
  }
  return { width: `calc(100% + ${gesture.dx}px)`, height: `calc(100% + ${gesture.dy}px)` };
}

function itemOf(layout: LayoutItem[], i: string): LayoutItem | undefined {
  return layout.find((item) => item.i === i);
}

export type GridProps = { dashboard: Dashboard; locked: boolean; className?: string };

export function Grid({ dashboard, locked, className }: GridProps): ReactElement {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const stacked = useMediaQuery(STACKED_QUERY);
  const editable = !locked && !stacked;

  const [colWidth, setColWidth] = useState(() => columnWidth(0));
  const [rowPx, setRowPx] = useState(MIN_ROW_HEIGHT);
  const [maximized, setMaximized] = useState<string | null>(null);
  /* Tras el primer maximizado los vecinos vuelven de `hidden` y el navegador
     reiniciaría su `animate-panel-enter` escalonado: la entrada del marco se apaga. */
  const [everMaximized, setEverMaximized] = useState(false);
  const [gesture, setGesture] = useState<Gesture | null>(null);

  useLayoutEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setColWidth(columnWidth(box ? box.inlineSize : node.offsetWidth));
      setRowPx(rowHeight(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Derivado, no efecto: quitar el widget deja el maximizado sin sujeto.
  const maximizedId = itemOf(dashboard.layout, maximized ?? "") ? maximized : null;

  function maximize(i: string): void {
    setMaximized(i);
    setEverMaximized(true);
  }

  /* Escape restaura desde cualquier sitio, también en Principal y apilado, donde
     el item no recibe el foco. Un Escape ya consumido (menú, selector) no cuenta. */
  useEffect(() => {
    if (!maximizedId) return;
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setMaximized(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [maximizedId]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, item: LayoutItem): void {
    if (event.button !== 0) return;
    const mode = dragMode(event.target as HTMLElement);
    if (!mode) return;

    // `preventDefault` se come el foco que daría el clic: se pone a mano.
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { i: item.i, mode, startX: event.clientX, startY: event.clientY, base: item };
    setGesture({ i: item.i, mode, dx: 0, dy: 0, phase: "drag" });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    setGesture({
      i: drag.i,
      mode: drag.mode,
      dx: event.clientX - drag.startX,
      dy: event.clientY - drag.startY,
      phase: "drag",
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const cells = pixelsToCells(dx, dy, colWidth, rowPx);

    if (drag.mode === "resize") {
      if (cells.x !== 0 || cells.y !== 0) {
        resizeWidget(
          drag.i,
          { w: drag.base.w + cells.x, h: drag.base.h + cells.y },
          getWidget(drag.base.type)?.minSize,
        );
      }
      setGesture(null);
      return;
    }

    if (cells.x !== 0 || cells.y !== 0) {
      moveWidget(drag.i, { x: drag.base.x + cells.x, y: drag.base.y + cells.y });
    }
    /* El residuo se mide contra la celda que el store acabó dando (compactado,
       recortado al borde), no contra la que pidió el puntero. */
    const landed = itemOf(selectActiveDashboard(getState()).layout, drag.i) ?? drag.base;
    const { gap } = gridMetrics();
    setGesture({
      i: drag.i,
      mode: "move",
      dx: dx - (landed.x - drag.base.x) * (colWidth + gap),
      dy: dy - (landed.y - drag.base.y) * (rowPx + gap),
      phase: "settle",
    });
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setGesture(null));
    } else {
      setGesture(null);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, item: LayoutItem): void {
    // Solo cuando el foco está en el contenedor: dentro mandan los controles.
    if (event.target !== event.currentTarget) return;

    if (event.key === "Enter") {
      event.preventDefault();
      maximize(item.i);
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

  if (dashboard.layout.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center p-4", className)}>
        <EmptyState
          title="Este tablero está vacío"
          description="Añade hasta 4 widgets desde «Añadir widget», arriba a la derecha."
        />
      </div>
    );
  }

  const items = stacked
    ? [...dashboard.layout].sort((a, b) => a.y - b.y || a.x - b.x)
    : dashboard.layout;

  const canvasStyle = {
    "--grid-row": `${rowPx}px`,
    display: "grid",
    gridTemplateColumns: stacked ? "minmax(0, 1fr)" : "repeat(var(--grid-cols), minmax(0, 1fr))",
    gridTemplateRows: stacked ? undefined : `repeat(${GRID_ROWS}, var(--grid-row))`,
    gridAutoRows: stacked ? "minmax(360px, auto)" : "var(--grid-row)",
    gap: "var(--grid-gap)",
    padding: `${GRID_PADDING}px`,
  } as CSSProperties;

  return (
    <div
      ref={canvasRef}
      data-grid=""
      className={cn("relative h-full w-full overflow-auto", className)}
      style={canvasStyle}
    >
      {items.map((item, index) => {
        const isMaximized = maximizedId === item.i;
        const active = gesture?.i === item.i ? gesture : null;
        const title = getWidget(item.type)?.title ?? item.type;
        return (
          <div
            key={item.i}
            data-grid-item={item.i}
            role={editable ? "group" : undefined}
            tabIndex={editable ? 0 : undefined}
            aria-label={editable ? title : undefined}
            title={editable ? KEYBOARD_HINT : undefined}
            hidden={maximizedId !== null && !isMaximized}
            className={cn(
              "group/widget relative min-h-0 min-w-0 rounded-[var(--radius-card)]",
              editable && "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              // El marco maximizado aparece fundido en su nuevo tamaño en vez de saltar.
              isMaximized &&
                "absolute inset-4 z-[var(--z-overlay)] animate-crossfade motion-reduce:animate-none",
              everMaximized && "[&>[role=region]]:animate-none",
              active && "z-10",
              // La transición solo vive en reposo: durante el gesto el transform sigue al puntero.
              !active &&
                "transition-transform duration-[var(--duration-moderate)] ease-[var(--ease-enter)] motion-reduce:transition-none",
            )}
            style={{
              ...(isMaximized || stacked ? {} : cellStyle(item)),
              ...gestureStyle(active),
            }}
            onPointerDown={editable ? (event) => handlePointerDown(event, item) : undefined}
            onPointerMove={editable ? handlePointerMove : undefined}
            onPointerUp={editable ? handlePointerUp : undefined}
            onPointerCancel={editable ? handlePointerUp : undefined}
            onKeyDown={editable ? (event) => handleKeyDown(event, item) : undefined}
          >
            <WidgetFrame
              item={item}
              locked={locked}
              isMaximized={isMaximized}
              onMaximize={() => (isMaximized ? setMaximized(null) : maximize(item.i))}
              index={index}
            />
            {editable && !isMaximized ? (
              <button
                type="button"
                data-resize-handle=""
                aria-label="Redimensionar widget"
                className="absolute right-0 bottom-0 size-3 cursor-se-resize rounded-br-[var(--radius-card)] opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover/widget:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
              >
                <span
                  aria-hidden="true"
                  className="block size-full rounded-br-[var(--radius-card)] border-r-2 border-b-2 border-content-secondary"
                />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
