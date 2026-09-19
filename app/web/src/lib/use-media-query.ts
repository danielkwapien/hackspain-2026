/**
 * `matchMedia` como store externo para React: el lienzo pregunta si la ventana es
 * estrecha (< 1280 px) para apilar los widgets en una columna. Sin `matchMedia`
 * (jsdom, servidor) la respuesta es siempre `false`: la rejilla completa.
 */

import { useCallback, useSyncExternalStore } from "react";

function mediaQueryList(query: string): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query)
    : null;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaQueryList(query);
      if (!list) return () => {};
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => mediaQueryList(query)?.matches ?? false,
    () => false,
  );
}
