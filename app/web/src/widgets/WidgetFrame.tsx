/**
 * Marco de widget: cabecera de 32 px, punto de vínculo, selector de entidad,
 * maximizar y menú de acciones. El contenido lo resuelve el propio marco desde el
 * registro (`definition.component`); `children`, si se pasa, manda sobre él.
 *
 * Dos decisiones que se notan aguas abajo:
 * - La cabecera es una instancia estable: cambiar de entidad solo reescribe su
 *   texto, nunca la remonta (XR-014 y XR-016 dependen de ello). El contenido
 *   vive en su propio contenedor.
 * - Los menús son `div role="menu"` a mano, sin Radix: en jsdom su popover es
 *   frágil y aquí hace falta control exacto del foco.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, EllipsisVertical, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "cn";
import { duplicateWidget, removeWidget, setEntities, setLinkGroup } from "@/dashboard/store";
import type { Entity, LayoutItem } from "@/dashboard/types";
import { getUniverse } from "@/lib/api-v2";
import { EntityPicker } from "./EntityPicker";
import {
  ICON_BUTTON_SIZE,
  LINK_DOT_SIZE,
  LINK_GROUP_CLASS,
  LINK_GROUP_LABEL,
  LINK_GROUPS,
  WIDGET_HEADER_HEIGHT,
  getWidget,
} from "./registry";

const ICON_BUTTON_CLASS =
  "flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40";

const MENU_CLASS =
  "absolute top-full z-30 mt-1 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg";

/** Texto del botón de entidad: la primera y, si hay más, cuántas quedan. */
function entityLabel(entities: Entity[]): string {
  const first = entities[0];
  const label = first ? (first.name ?? first.id) : "Sin empresa";
  return entities.length > 1 ? `${label} +${entities.length - 1}` : label;
}

export function WidgetFrame({
  item,
  onMaximize,
  isMaximized,
  children,
}: {
  item: LayoutItem;
  onMaximize?: () => void;
  isMaximized?: boolean;
  children?: ReactNode;
}): ReactElement {
  const definition = getWidget(item.type);

  const [dotMenuOpen, setDotMenuOpen] = useState(false);
  const [menu, setMenu] = useState<"none" | "actions" | "link">("none");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const dotWrapRef = useRef<HTMLDivElement>(null);
  const dotButtonRef = useRef<HTMLButtonElement>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pickerWrapRef = useRef<HTMLDivElement>(null);

  // El universo del selector: solo se pide cuando alguien lo abre.
  const universe = useQuery({
    queryKey: ["universe", "entity-picker"],
    queryFn: () => getUniverse({ limit: 500 }),
    enabled: pickerOpen,
  });

  // Un clic fuera cierra lo que esté abierto; cada popover mira su propio envoltorio.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (!dotWrapRef.current?.contains(target)) setDotMenuOpen(false);
      if (!menuWrapRef.current?.contains(target)) {
        setMenu("none");
        setConfirmRemove(false);
      }
      if (!pickerWrapRef.current?.contains(target)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  // Escape sale de maximizado, salvo que un popover abierto ya lo esté consumiendo.
  useEffect(() => {
    if (!isMaximized || !onMaximize) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      if (dotMenuOpen || menu !== "none" || pickerOpen) return;
      onMaximize?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMaximized, onMaximize, dotMenuOpen, menu, pickerOpen]);

  if (!definition) {
    return (
      <section className="flex h-full flex-col rounded-lg border border-border bg-card px-4 pb-4">
        <p role="alert" className="pt-4 text-xs text-muted-foreground">
          Tipo de widget desconocido
        </p>
      </section>
    );
  }

  function closeDotMenu(): void {
    setDotMenuOpen(false);
    dotButtonRef.current?.focus();
  }

  function closeMenu(): void {
    setMenu("none");
    setConfirmRemove(false);
    menuButtonRef.current?.focus();
  }

  /** `scope` en vez de un callback: el cierre lee un ref y no debe viajar en el render. */
  function renderLinkOptions(scope: "dot" | "menu"): ReactElement[] {
    return LINK_GROUPS.map((group) => (
      <button
        key={group}
        type="button"
        role="menuitem"
        className={MENU_ITEM_CLASS}
        onClick={() => {
          setLinkGroup(item.i, group);
          if (scope === "dot") closeDotMenu();
          else closeMenu();
        }}
      >
        <span
          aria-hidden="true"
          className={cn("rounded-full bg-current", LINK_GROUP_CLASS[group])}
          style={{ width: LINK_DOT_SIZE, height: LINK_DOT_SIZE }}
        />
        {LINK_GROUP_LABEL[group]}
      </button>
    ));
  }

  const needsEntity = definition.needsEntity !== "none";
  const Content = definition.component;

  return (
    <section
      // El borde solo aparece al pasar por encima o cuando algo dentro tiene el foco.
      className="flex h-full flex-col rounded-lg border border-transparent bg-card px-4 pb-4 transition-colors hover:border-border focus-within:border-border"
    >
      <header
        // El lienzo arrastra el widget solo desde aqui; el cuerpo es del contenido.
        data-widget-drag-handle=""
        className="flex shrink-0 items-center gap-1"
        style={{ height: WIDGET_HEADER_HEIGHT }}
      >
        <div
          ref={dotWrapRef}
          className="relative shrink-0"
          onKeyDown={(event) => {
            if (event.key === "Escape" && dotMenuOpen) {
              event.preventDefault();
              event.stopPropagation();
              closeDotMenu();
            }
          }}
        >
          <button
            ref={dotButtonRef}
            type="button"
            aria-label="Cambiar vínculo"
            aria-haspopup="menu"
            aria-expanded={dotMenuOpen}
            className={ICON_BUTTON_CLASS}
            style={{ width: ICON_BUTTON_SIZE, height: ICON_BUTTON_SIZE }}
            onClick={() => setDotMenuOpen(!dotMenuOpen)}
          >
            <span
              aria-hidden="true"
              className={cn("rounded-full bg-current", LINK_GROUP_CLASS[item.linkGroup])}
              style={{ width: LINK_DOT_SIZE, height: LINK_DOT_SIZE }}
            />
          </button>
          {dotMenuOpen ? (
            <div role="menu" aria-label="Vínculo del widget" className={cn(MENU_CLASS, "left-0")}>
              {renderLinkOptions("dot")}
            </div>
          ) : null}
        </div>

        {needsEntity ? (
          <div ref={pickerWrapRef} className="relative min-w-0 flex-1">
            <button
              type="button"
              aria-label="Cambiar empresa"
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              className="flex min-w-0 max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => setPickerOpen(!pickerOpen)}
            >
              <span className="truncate">{entityLabel(item.entities)}</span>
              <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
            </button>
            <EntityPicker
              open={pickerOpen}
              mode={definition.needsEntity === "many" ? "multi" : "single"}
              kinds={definition.entityKinds}
              max={definition.maxEntities}
              items={universe.data?.items ?? []}
              selected={item.entities}
              anchorLabel={definition.title}
              onSelect={(entities) => setEntities(item.i, entities)}
              onClose={() => setPickerOpen(false)}
            />
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate px-1 text-xs font-semibold text-foreground">
            {definition.title}
          </span>
        )}

        <button
          type="button"
          aria-label={isMaximized ? "Restaurar widget" : "Maximizar widget"}
          aria-expanded={isMaximized ? true : undefined}
          className={ICON_BUTTON_CLASS}
          style={{ width: ICON_BUTTON_SIZE, height: ICON_BUTTON_SIZE }}
          onClick={() => onMaximize?.()}
        >
          {isMaximized ? (
            <Minimize2 aria-hidden="true" className="size-3.5" />
          ) : (
            <Maximize2 aria-hidden="true" className="size-3.5" />
          )}
        </button>

        <div
          ref={menuWrapRef}
          className="relative shrink-0"
          onKeyDown={(event) => {
            if (event.key === "Escape" && menu !== "none") {
              event.preventDefault();
              event.stopPropagation();
              closeMenu();
            }
          }}
        >
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Menú del widget"
            aria-haspopup="menu"
            aria-expanded={menu !== "none"}
            className={ICON_BUTTON_CLASS}
            style={{ width: ICON_BUTTON_SIZE, height: ICON_BUTTON_SIZE }}
            onClick={() => {
              setMenu(menu === "none" ? "actions" : "none");
              setConfirmRemove(false);
            }}
          >
            <EllipsisVertical aria-hidden="true" className="size-3.5" />
          </button>

          {menu === "actions" ? (
            <div
              role="menu"
              aria-label="Acciones del widget"
              className={cn(MENU_CLASS, "right-0")}
            >
              <button
                type="button"
                role="menuitem"
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
                className={MENU_ITEM_CLASS}
                onClick={() => setMenu("link")}
              >
                Cambiar vínculo
              </button>
              <button
                type="button"
                role="menuitem"
                disabled
                title="Llega con el catálogo de widgets"
                className={MENU_ITEM_CLASS}
              >
                Cambiar tipo
              </button>
              {confirmRemove ? (
                <button
                  type="button"
                  role="menuitem"
                  className={cn(MENU_ITEM_CLASS, "text-negative")}
                  onClick={() => removeWidget(item.i)}
                >
                  Confirmar
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={MENU_ITEM_CLASS}
                  onClick={() => setConfirmRemove(true)}
                >
                  Eliminar
                </button>
              )}
            </div>
          ) : null}

          {menu === "link" ? (
            <div role="menu" aria-label="Vínculo del widget" className={cn(MENU_CLASS, "right-0")}>
              {renderLinkOptions("menu")}
            </div>
          ) : null}
        </div>
      </header>

      {/* Solo cuando la cabecera lleva la entidad: si no, repetiría su propio texto. */}
      {definition.showsTypeTitle && needsEntity ? (
        <h2 className="shrink-0 truncate text-lg font-semibold text-foreground">
          {definition.title}
        </h2>
      ) : null}

      <div className="min-h-0 flex-1">{children ?? <Content item={item} />}</div>
    </section>
  );
}
