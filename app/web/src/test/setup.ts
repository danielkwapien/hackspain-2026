import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/**
 * jsdom no implementa `ResizeObserver` y no hace layout: todo mide 0. El
 * virtualizador de la tabla pregunta el alto del contenedor por ahí, así que sin
 * este doble no renderiza ni una fila. Entrega un tamaño fijo una sola vez, que
 * es lo que un navegador haría al observar un elemento ya pintado.
 */
const OBSERVED_SIZE = { width: 800, height: 600 };

class FakeResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    const entry = {
      target,
      contentRect: { ...OBSERVED_SIZE, top: 0, left: 0, bottom: 600, right: 800, x: 0, y: 0 },
      borderBoxSize: [{ inlineSize: OBSERVED_SIZE.width, blockSize: OBSERVED_SIZE.height }],
      contentBoxSize: [{ inlineSize: OBSERVED_SIZE.width, blockSize: OBSERVED_SIZE.height }],
      devicePixelContentBoxSize: [
        { inlineSize: OBSERVED_SIZE.width, blockSize: OBSERVED_SIZE.height },
      ],
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this);
  }

  unobserve(): void {}

  disconnect(): void {}
}

globalThis.ResizeObserver = FakeResizeObserver;
if (typeof window !== "undefined") window.ResizeObserver = FakeResizeObserver;

afterEach(() => {
  cleanup();
});
