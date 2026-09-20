/**
 * Marco glass único de todos los widgets, en los tableros fijos y en los de
 * usuario: cabecera de 32 px con el título a 14/600 y los controles a la derecha,
 * y el cuerpo ocupando el resto sin desbordar. El contenido lo resuelve el
 * registro (`definition.component`).
 *
 * Es una región con nombre (`aria-labelledby` al `h2`) para que el lector de
 * pantalla salte entre widgets. Entra con `animate-panel-enter` escalonado 40 ms
 * por `index`; bajo `prefers-reduced-motion` no anima. Sin hover de borde ni
 * escala en el marco: el marco no es un control, los botones sí.
 *
 * Dos decisiones que se notan aguas abajo:
 * - La cabecera (`div[data-widget-drag-handle]`) es el asa de arrastre; el lienzo
 *   arrastra desde ahí y deja el cuerpo al contenido. Con `locked` no hay asa
 *   visual, ni menú, y «Elegir empresa» queda deshabilitado.
 * - El menú es un `div role="menu"` a mano, sin Radix: en jsdom su popover es
 *   frágil y aquí hace falta control exacto del foco.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { ReactElement } from "react";
import { EllipsisVertical, Link2, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "cn";
import { CompanyPicker } from "@/components/CompanyPicker";
import { WidgetBoundary } from "@/dashboard/WidgetBoundary";
import {
  canAddWidget,
  duplicateWidget,
  removeWidget,
  selectActiveDashboard,
  setWidgetEntity,
  useDashboards,
} from "@/dashboard/store";
import type { DashboardsState, LayoutItem } from "@/dashboard/types";
import { getWidget } from "./registry";
import { useCompanyName } from "./useCompanyName";

/** Escalonado de la entrada: el tercer widget arranca a 80 ms, nunca más tarde. */
const ENTER_STAGGER_MS = 40;

const PICKER_LABEL = "Elegir empresa";
const FOLLOW_PLACEHOLDER = "Selección";
const LOCKED_PICKER_TITLE = "En un tablero fijo la ficha sigue la selección";
const FULL_TITLE = "Máximo 4 widgets por tablero";

/* El glass de los paneles de XR-030, con `h-full` porque ahora llena una celda. */
const FRAME_CLASS =
  "animate-panel-enter motion-reduce:animate-none flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface-glass px-4 pb-4 shadow-[inset_0_0_0_1px_var(--border-glass)] backdrop-blur-[var(--blur-glass)]";

/* Botones de 24 × 24: el hover solo escala donde hay puntero de verdad. */
const ICON_BUTTON_CLASS =
  "flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-content-secondary transition-[color,background-color,transform] duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover [@media(hover:hover)]:hover:text-content-primary [@media(hover:hover)]:hover:scale-[1.02] active:scale-[.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none";

const MENU_CLASS =
  "absolute top-full right-0 z-[var(--z-popover)] mt-1 w-40 origin-top-right rounded-[var(--radius-card)] bg-surface-elevated p-1 shadow-[inset_0_0_0_1px_var(--border-glass)] animate-menu-enter motion-reduce:animate-none";

const MENU_ITEM_CLASS =
  "flex h-[var(--size-row)] w-full items-center rounded-[var(--radius-control)] px-2 text-left text-[length:var(--text-body)] text-content-primary transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover focus-visible:bg-surface-glass-hover focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none";

export type WidgetFrameProps = {
  item: LayoutItem;
  locked: boolean;
  isMaximized: boolean;
  onMaximize: () => void;
  /** Posición en la entrada escalonada. */
  index: number;
};

export function WidgetFrame({
  item,
  locked,
  isMaximized,
  onMaximize,
  index,
}: WidgetFrameProps): ReactElement {
  const definition = getWidget(item.type);
  const titleId = useId();

  /* La entidad se lee del store, no de la prop: el marco es quien la escribe y
     debe verse al instante aunque el lienzo aún no haya repintado el item. */
  const entity = useDashboards((state: DashboardsState) => {
    const live = selectActiveDashboard(state).layout.find((candidate) => candidate.i === item.i);
    return live ? live.entity : item.entity;
  });
  const canDuplicate = useDashboards(canAddWidget);
  const companyName = useCompanyName(entity);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Un clic fuera cierra el menú sin devolver el foco.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent): void {
      if (!menuWrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  if (!definition) {
    return (
      <section
        role="region"
        aria-label="Widget desconocido"
        className={FRAME_CLASS}
        style={{ animationDelay: `${index * ENTER_STAGGER_MS}ms` }}
      >
        <p role="alert" className="pt-4 text-[length:var(--text-body)] text-content-secondary">
          Tipo de widget desconocido
        </p>
      </section>
    );
  }

  function closeMenu(): void {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  const Content = definition.component;
  const liveItem = entity === item.entity ? item : { ...item, entity };
  const pickerValue = entity ? { id: entity, name: companyName ?? entity } : null;

  return (
    <section
      role="region"
      aria-labelledby={titleId}
      className={FRAME_CLASS}
      style={{ animationDelay: `${index * ENTER_STAGGER_MS}ms` }}
    >
      <div
        // El lienzo arrastra el widget solo desde aquí; el cuerpo es del contenido. Es un
        // `div` y no `header`: testing-library lo contaría como segundo `banner` de la página.
        data-widget-drag-handle=""
        className={cn(
          "flex shrink-0 items-center justify-between gap-2",
          !locked && "cursor-grab active:cursor-grabbing",
        )}
        style={{ height: "var(--size-row)" }}
      >
        <h2
          id={titleId}
          className="truncate text-[length:var(--text-widget-title)] font-semibold text-content-primary"
        >
          {definition.title}
        </h2>

        <div className="flex min-w-0 shrink-0 items-center gap-1">
          {definition.needsEntity ? (
            locked ? (
              <button
                type="button"
                disabled
                aria-label={PICKER_LABEL}
                title={LOCKED_PICKER_TITLE}
                className={cn(ICON_BUTTON_CLASS, "w-auto gap-1 px-2 text-[length:var(--text-body)]")}
              >
                <Link2 aria-hidden="true" className="size-3 shrink-0" />
                <span className="truncate">{pickerValue?.name ?? FOLLOW_PLACEHOLDER}</span>
              </button>
            ) : (
              <CompanyPicker
                value={pickerValue}
                label={PICKER_LABEL}
                placeholder={FOLLOW_PLACEHOLDER}
                allowFollow
                onPick={(picked) => setWidgetEntity(item.i, picked?.id ?? null)}
                className="h-6 max-w-48"
              />
            )
          ) : null}

          <button
            type="button"
            aria-label={isMaximized ? "Restaurar widget" : "Maximizar widget"}
            className={ICON_BUTTON_CLASS}
            onClick={onMaximize}
          >
            {isMaximized ? (
              <Minimize2 aria-hidden="true" className="size-3.5" />
            ) : (
              <Maximize2 aria-hidden="true" className="size-3.5" />
            )}
          </button>

          {locked ? null : (
            <div
              ref={menuWrapRef}
              className="relative shrink-0"
              onKeyDown={(event) => {
                if (event.key !== "Escape" || !menuOpen) return;
                // El lienzo también escucha Escape para restaurar el maximizado.
                event.preventDefault();
                event.stopPropagation();
                closeMenu();
              }}
            >
              <button
                ref={menuButtonRef}
                type="button"
                aria-label="Menú del widget"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={ICON_BUTTON_CLASS}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <EllipsisVertical aria-hidden="true" className="size-3.5" />
              </button>

              {menuOpen ? (
                <div role="menu" aria-label="Acciones del widget" className={MENU_CLASS}>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canDuplicate}
                    title={canDuplicate ? undefined : FULL_TITLE}
                    className={MENU_ITEM_CLASS}
                    onClick={() => {
                      duplicateWidget(item.i);
                      closeMenu();
                    }}
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={cn(MENU_ITEM_CLASS, "text-content-negative")}
                    onClick={() => removeWidget(item.i)}
                  >
                    Quitar
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {/* Cada widget falla solo: sin esta frontera, un error de render se
            llevaba el arbol entero y dejaba la pagina en negro. */}
        <WidgetBoundary title={definition.title}>
          <Content item={liveItem} />
        </WidgetBoundary>
      </div>
    </section>
  );
}
