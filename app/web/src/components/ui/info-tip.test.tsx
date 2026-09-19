import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { InfoTip } from "@/components/ui/info-tip";

/** Más que cualquier retardo razonable de apertura al pasar por encima. */
const GENEROUS_DELAY = 1_000;

/** El tooltip está siempre montado: se busca con `hidden` para leerlo también oculto. */
function tooltipOf(button: HTMLElement): HTMLElement {
  const id = button.getAttribute("aria-describedby");
  if (!id) throw new Error("El botón no lleva aria-describedby");
  const tip = document.getElementById(id);
  if (!tip) throw new Error(`No existe el elemento ${id}`);
  return tip;
}

describe("InfoTip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("DADO un InfoTip CUANDO se monta ENTONCES botón «Definición de Score» con aria-describedby al role=tooltip, oculto y con la definición", () => {
    render(<InfoTip title="Score" definition="Salud de tesorería de 0 a 100 en el mes de corte." />);

    const button = screen.getByRole("button", { name: "Definición de Score" });
    expect(button).toHaveAttribute("type", "button");

    const tip = tooltipOf(button);
    expect(tip).toHaveAttribute("role", "tooltip");
    expect(tip).toHaveTextContent("Salud de tesorería de 0 a 100 en el mes de corte.");
    expect(tip).not.toBeVisible();
    // Portal a body: el tooltip no queda recortado por el overflow del widget.
    expect(tip.closest("[role='region']")).toBeNull();
    expect(document.body.contains(tip)).toBe(true);
  });

  it("DADO el botón CUANDO hover o foco ENTONCES el tooltip se muestra; leave, blur y Escape lo ocultan", () => {
    render(<InfoTip title="Confianza" definition="Cuánto fiarse del score este mes." />);
    const button = screen.getByRole("button", { name: "Definición de Confianza" });
    const tip = tooltipOf(button);

    fireEvent.mouseEnter(button);
    act(() => vi.advanceTimersByTime(GENEROUS_DELAY));
    expect(tip).toBeVisible();

    fireEvent.mouseLeave(button);
    act(() => vi.advanceTimersByTime(GENEROUS_DELAY));
    expect(tip).not.toBeVisible();

    // El foco lo muestra sin esperar: el teclado no tiene «hover».
    act(() => button.focus());
    expect(tip).toBeVisible();

    fireEvent.keyDown(button, { key: "Escape" });
    expect(tip).not.toBeVisible();

    // Tras Escape el botón sigue enfocado; perder y recuperar el foco vuelve a mostrarlo.
    act(() => button.blur());
    act(() => button.focus());
    expect(tip).toBeVisible();
    act(() => button.blur());
    expect(tip).not.toBeVisible();
  });

  it("DADO un tooltip recién cerrado (< 300 ms) CUANDO se pasa por encima de otro ENTONCES se muestra sin retardo", () => {
    render(
      <div>
        <InfoTip title="Base" definition="Punto de partida del motor." />
        <InfoTip title="Techo" definition="Máximo que impone una señal crítica." />
      </div>,
    );
    const first = screen.getByRole("button", { name: "Definición de Base" });
    const second = screen.getByRole("button", { name: "Definición de Techo" });

    fireEvent.mouseEnter(first);
    act(() => vi.advanceTimersByTime(GENEROUS_DELAY));
    expect(tooltipOf(first)).toBeVisible();

    fireEvent.mouseLeave(first);
    act(() => vi.advanceTimersByTime(100));
    fireEvent.mouseEnter(second);

    // Sin avanzar ningún temporizador: el segundo aparece al instante.
    expect(tooltipOf(second)).toBeVisible();
    expect(tooltipOf(first)).not.toBeVisible();
  });
});
