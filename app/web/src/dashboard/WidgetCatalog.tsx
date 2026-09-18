/**
 * Catalogo de widgets: rejilla de tarjetas con lo que hay registrado.
 *
 * Dialogo a mano, sin Radix, por la misma razon que el marco: en jsdom su
 * popover es fragil y aqui hace falta control exacto del foco.
 */

import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import { addWidget } from "./store";
import { listWidgets } from "@/widgets/registry";

export function WidgetCatalog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement | null {
  const firstCardRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstCardRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const definitions = listWidgets();

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 p-4"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Catálogo de widgets"
        className="max-h-full w-full max-w-2xl overflow-auto rounded-lg border border-border bg-popover p-4 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Añadir widget</h2>
          <button
            type="button"
            aria-label="Cerrar catálogo"
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        {definitions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay widgets registrados.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {definitions.map((definition, index) => (
              <button
                key={definition.type}
                ref={index === 0 ? firstCardRef : undefined}
                type="button"
                className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => {
                  addWidget({
                    type: definition.type,
                    w: definition.defaultSize.w,
                    h: definition.defaultSize.h,
                  });
                  onClose();
                }}
              >
                <span className="text-xs font-semibold text-foreground">{definition.title}</span>
                <span className="text-xs text-muted-foreground">{definition.description}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {definition.defaultSize.w} × {definition.defaultSize.h}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
