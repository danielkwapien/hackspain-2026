/**
 * Marca de Kima: la ola dentro del círculo.
 *
 * Es un PNG con canal alfa (`assets/kima-logo.png`, 256 px para que aguante
 * pantallas retina) recortado del original que entregó diseño. El trazo es
 * blanco, así que vive sobre el fondo oscuro de la aplicación y no necesita
 * ningún token de color. Decorativo: quien nombra el enlace es su `aria-label`,
 * por eso va `alt=""` y `aria-hidden`.
 *
 * El mismo recorte, en blanco y en navy, está en `docs/assets/` para el README.
 */

import type { ReactElement } from "react";

import logoUrl from "@/assets/kima-logo.png";

export function Logo({ className }: { className?: string }): ReactElement {
  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={28}
      height={28}
      className={className}
    />
  );
}
