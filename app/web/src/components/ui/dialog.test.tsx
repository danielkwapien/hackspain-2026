import { useState } from "react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

type Size = "overlay" | "full";

/**
 * Como lo usa un widget: el padre monta el diálogo mientras `open` y lo desmonta
 * en `onClose` (patrón `WidgetCatalog onClose`). El disparador es un botón real
 * para comprobar que el foco vuelve a él.
 */
function Harness({
  size = "overlay",
  onClose,
}: {
  size?: Size;
  onClose?: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <p>Hermano del portal</p>
      {open ? (
        <Dialog
          label="Buscar empresa o grupo"
          size={size}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        >
          <button type="button">Uno</button>
          <p>Contenido del diálogo</p>
          <button type="button">Dos</button>
        </Dialog>
      ) : null}
    </div>
  );
}

function dialog(): HTMLElement {
  return screen.getByRole("dialog");
}

function scrim(): HTMLElement {
  const element = document.querySelector<HTMLElement>("[data-dialog-scrim]");
  if (!element) throw new Error("El diálogo no expone [data-dialog-scrim]");
  return element;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const trigger = screen.getByRole("button", { name: "Abrir" });
  await user.click(trigger);
  return trigger;
}

describe("Dialog", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("DADO el diálogo abierto ENTONCES role=dialog aria-modal en un portal a body con aria-labelledby, foco dentro, body overflow hidden y los hermanos inert", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");

    await openDialog(user);

    const panel = dialog();
    expect(panel).toHaveAttribute("aria-modal", "true");
    // Portal: el diálogo cuelga de body, no del árbol de React que lo abre.
    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);

    const labelId = panel.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId ?? "")).toHaveTextContent("Buscar empresa o grupo");
    expect(panel).toHaveAccessibleName("Buscar empresa o grupo");

    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(container).toHaveAttribute("inert");

    // Al cerrar todo vuelve: overflow, inert y ningún diálogo.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(container).not.toHaveAttribute("inert");
  });

  it("DADO el foco en el último enfocable CUANDO Tab ENTONCES vuelve al primero; Shift+Tab desde el primero va al último", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openDialog(user);

    const first = screen.getByRole("button", { name: "Uno" });
    const last = screen.getByRole("button", { name: "Dos" });

    last.focus();
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    // Nunca sale del diálogo hacia el disparador.
    await user.tab();
    await user.tab();
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("DADO Escape CUANDO se pulsa dentro ENTONCES onClose, el evento queda defaultPrevented y el foco vuelve al disparador", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = await openDialog(user);

    const notCancelled = fireEvent.keyDown(dialog(), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    // `fireEvent` devuelve false cuando algún listener llamó a preventDefault:
    // así el lienzo (`Grid`) no restaura el widget maximizado con el mismo Escape.
    expect(notCancelled).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("DADO un clic en el scrim ENTONCES cierra; un clic dentro del panel no", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await openDialog(user);

    await user.click(screen.getByText("Contenido del diálogo"));
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();

    await user.click(scrim());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("DADO size=overlay ENTONCES animate-dialog-enter con motion-reduce, scrim con animate-backdrop-enter y medidas --size-overlay-w/h; size=full no usa esas medidas", async () => {
    const user = userEvent.setup();
    const overlay = render(<Harness size="overlay" />);
    await openDialog(user);

    const panel = dialog();
    expect(panel).toHaveClass("animate-dialog-enter", "motion-reduce:animate-none");
    expect(scrim()).toHaveClass("animate-backdrop-enter", "motion-reduce:animate-none");
    const overlayStyle = `${panel.getAttribute("style") ?? ""} ${panel.className}`;
    expect(overlayStyle).toContain("--size-overlay-w");
    expect(overlayStyle).toContain("--size-overlay-h");
    expect(overlayStyle).toContain("--size-topbar");
    await user.keyboard("{Escape}");
    overlay.unmount();

    render(<Harness size="full" />);
    await openDialog(user);
    const full = dialog();
    expect(full).toHaveClass("animate-dialog-enter");
    const fullStyle = `${full.getAttribute("style") ?? ""} ${full.className}`;
    expect(fullStyle).not.toContain("--size-overlay-w");
    expect(fullStyle).not.toContain("--size-overlay-h");
  });
});
