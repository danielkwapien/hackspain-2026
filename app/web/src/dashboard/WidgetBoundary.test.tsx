import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetBoundary } from "./WidgetBoundary";

function Boom({ fail }: { fail: boolean }) {
  if (fail) throw new TypeError("Cannot read properties of undefined (reading 'dotClass')");
  return <p>contenido vivo</p>;
}

describe("WidgetBoundary", () => {
  beforeEach(() => {
    // React reenvia el error a la consola ademas de a la frontera; en el test
    // solo estorba.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("deja pasar el contenido cuando no falla", () => {
    render(
      <WidgetBoundary title="Alertas">
        <Boom fail={false} />
      </WidgetBoundary>,
    );
    expect(screen.getByText("contenido vivo")).toBeInTheDocument();
  });

  it("contiene el fallo, nombra el widget y no propaga", () => {
    render(
      <div>
        <WidgetBoundary title="Alertas">
          <Boom fail />
        </WidgetBoundary>
        <p>otro widget</p>
      </div>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Este widget no ha podido pintarse");
    expect(screen.getByText(/dotClass/)).toBeInTheDocument();
    // La prueba de que la frontera hace su trabajo: el vecino sigue montado.
    expect(screen.getByText("otro widget")).toBeInTheDocument();
  });

  it("remonta el contenido al reintentar", async () => {
    // El fallo se controla desde fuera para no depender de cuantas veces
    // renderice React en desarrollo, que replica el render que lanza.
    const { rerender } = render(
      <WidgetBoundary title="Alertas">
        <Boom fail />
      </WidgetBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <WidgetBoundary title="Alertas">
        <Boom fail={false} />
      </WidgetBoundary>,
    );
    // Mientras la frontera guarde el error sigue enseñando el aviso: reintentar
    // es lo que la descarta.
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(screen.getByText("contenido vivo")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
