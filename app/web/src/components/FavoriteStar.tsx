/**
 * Estrella de favorito de una fila (Favoritos, árbol de Empresas): alterna la
 * watchlist sin seleccionar la fila (`stopPropagation`) y queda fuera del orden de
 * tabulación (`tabIndex -1`): la fila ya es el control de teclado. Rellena en
 * primario cuando está marcada; contorno secundario cuando no.
 */

import type { MouseEvent, ReactElement } from "react";
import { Star } from "lucide-react";
import { cn } from "cn";
import { toggleFavorite, useIsFavorite } from "@/dashboard/watchlist";

const ICON_SIZE = 14;

export function FavoriteStar({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}): ReactElement {
  const active = useIsFavorite(id);
  const label = active ? "Quitar de favoritos" : "Añadir a favoritos";

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    toggleFavorite(id);
  }

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-pressed={active}
      aria-label={label}
      title={`${label} · ${name}`}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-control)] transition-[transform,opacity,color] duration-[var(--duration-fast)] motion-reduce:transition-none [@media(hover:hover)]:hover:scale-[1.1] active:scale-90",
        active ? "text-content-primary" : "text-content-secondary",
        className,
      )}
      onClick={handleClick}
    >
      <Star
        aria-hidden="true"
        size={ICON_SIZE}
        strokeWidth={1.5}
        fill={active ? "currentColor" : "none"}
      />
    </button>
  );
}
