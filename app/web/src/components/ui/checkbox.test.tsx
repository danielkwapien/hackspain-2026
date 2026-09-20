import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "@/components/ui/checkbox";

describe("Checkbox", () => {
  it("DADO la casilla ENTONCES es un role=checkbox con su etiqueta, aria-checked y anillo de foco", () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Confirmo que tengo autorización" />);

    const box = screen.getByRole("checkbox", { name: "Confirmo que tengo autorización" });
    expect(box).toHaveAttribute("type", "button");
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(box.className).toContain("focus-visible:ring");
  });

  it("DADO un clic o la barra espaciadora ENTONCES avisa del nuevo valor y aria-checked lo sigue", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Checkbox checked={false} onChange={onChange} label="Confirmo" />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Confirmo" }));
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(<Checkbox checked onChange={onChange} label="Confirmo" />);
    expect(screen.getByRole("checkbox", { name: "Confirmo" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // El clic ya dejó el foco en la casilla: la barra espaciadora es la tecla
    // que un `role="checkbox"` sobre un `button` tiene que seguir atendiendo.
    expect(screen.getByRole("checkbox", { name: "Confirmo" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});
