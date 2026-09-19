import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { Background } from "@/components/Background";

/** `matchMedia` de mentira: solo `reduced` decide `prefers-reduced-motion`. */
function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })),
  );
}

/** rAF a mano: los frames se acumulan y se ejecutan cuando el test quiere. */
function stubFrames() {
  const frames: FrameRequestCallback[] = [];
  let next = 0;
  const request = vi.fn((callback: FrameRequestCallback) => {
    frames.push(callback);
    next += 1;
    return next;
  });
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  function run(count = 1): void {
    for (let index = 0; index < count; index += 1) {
      const frame = frames.shift();
      if (!frame) return;
      frame(performance.now());
    }
  }
  return { request, cancel, run, pending: () => frames.length };
}

function spotlight(): HTMLElement {
  const node = document.querySelector<HTMLElement>("[data-orb] [data-spotlight]");
  if (!node) throw new Error("No hay [data-spotlight] dentro de [data-orb]");
  return node;
}

/** `translate3d(Xpx, Ypx, 0)` → `{ x, y }`. */
function translation(node: HTMLElement): { x: number; y: number } {
  const match = /translate3d\(\s*([-\d.]+)px,\s*([-\d.]+)px/.exec(node.style.transform);
  if (!match) throw new Error(`Sin translate3d en "${node.style.transform}"`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

describe("fondo", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("existe [data-spotlight] dentro de [data-orb] aria-hidden y no lanza sin matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(() => render(<Background />)).not.toThrow();

    const orb = document.querySelector("[data-orb]");
    expect(orb).not.toBeNull();
    expect(orb).toHaveAttribute("aria-hidden", "true");
    expect(spotlight()).toHaveClass("spotlight");
  });

  it("sin reduced motion, pointermove a (300,200) y frames simulados mueven style.transform hacia (300,200) sin llegar de golpe", () => {
    stubMatchMedia(false);
    const frames = stubFrames();
    render(<Background />);

    // Reposo: sin rAF hasta que el puntero se mueve.
    const idle = frames.request.mock.calls.length;
    fireEvent.pointerMove(window, { clientX: 300, clientY: 200 });
    expect(frames.request.mock.calls.length).toBeGreaterThan(idle);

    frames.run(1);
    const first = translation(spotlight());
    // Un frame se acerca un 8 %: ni se queda donde estaba ni salta al destino.
    const startX = window.innerWidth / 2;
    const startY = window.innerHeight * 0.4;
    expect(first.x).toBeLessThan(startX);
    expect(first.x).toBeGreaterThan(300);
    expect(first.y).toBeLessThan(startY);
    expect(first.y).toBeGreaterThan(200);

    frames.run(1);
    const second = translation(spotlight());
    expect(second.x).toBeLessThan(first.x);
    expect(second.y).toBeLessThan(first.y);

    // Con frames de sobra converge y el bucle se para solo (sin rAF pendiente).
    frames.run(200);
    const settled = translation(spotlight());
    expect(Math.abs(settled.x - 300)).toBeLessThan(1);
    expect(Math.abs(settled.y - 200)).toBeLessThan(1);
    expect(frames.pending()).toBe(0);
  });

  it("con reduced motion pointermove no cambia transform ni registra listener", () => {
    stubMatchMedia(true);
    const frames = stubFrames();
    const addListener = vi.spyOn(window, "addEventListener");
    render(<Background />);

    const pointerListeners = addListener.mock.calls.filter(([type]) => type === "pointermove");
    expect(pointerListeners).toHaveLength(0);

    const before = spotlight().style.transform;
    fireEvent.pointerMove(window, { clientX: 300, clientY: 200 });
    frames.run(5);

    expect(spotlight().style.transform).toBe(before);
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("unmount quita listener y cancela el rAF", () => {
    stubMatchMedia(false);
    const frames = stubFrames();
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Background />);

    const added = addListener.mock.calls.find(([type]) => type === "pointermove");
    expect(added).toBeDefined();

    // Un frame pendiente en el momento de desmontar.
    fireEvent.pointerMove(window, { clientX: 300, clientY: 200 });
    expect(frames.pending()).toBeGreaterThan(0);

    unmount();

    const removed = removeListener.mock.calls.find(([type]) => type === "pointermove");
    expect(removed).toBeDefined();
    expect(removed?.[1]).toBe(added?.[1]);
    expect(frames.cancel).toHaveBeenCalled();
  });
});
