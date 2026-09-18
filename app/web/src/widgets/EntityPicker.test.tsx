import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Entity } from "@/dashboard/types";
import { universeFixture } from "@/test/fixtures/v2";
import { EntityPicker } from "./EntityPicker";

function renderPicker(
  props: { mode?: "single" | "multi"; max?: number; selected?: Entity[] } = {},
) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <div className="relative">
      <EntityPicker
        open
        items={universeFixture.items}
        onSelect={onSelect}
        onClose={onClose}
        {...props}
      />
    </div>,
  );
  return { onSelect, onClose };
}

function search(): HTMLElement {
  return screen.getByRole("combobox", { name: "Buscar empresa o grupo" });
}

function optionNames(): string[] {
  return screen.getAllByRole("option").map((option) => option.textContent ?? "");
}

describe("Selector de entidad", () => {
  it("filters by id, name and group", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(search(), "COMP_0005");
    expect(optionNames()).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Textiles Belmar/ })).toBeInTheDocument();

    await user.clear(search());
    await user.type(search(), "mendive");
    expect(optionNames()).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Talleres Mendive/ })).toBeInTheDocument();

    // Sin acentos: "iruna" encuentra "Montajes Iruña".
    await user.clear(search());
    await user.type(search(), "iruna");
    expect(screen.getByRole("option", { name: /Montajes Iruña/ })).toBeInTheDocument();

    await user.clear(search());
    await user.type(search(), "GROUP_0288");
    const byGroup = optionNames();
    expect(byGroup).toHaveLength(4);
    for (const name of ["Bodegas Ribalta", "Cerámicas Noval", "Papelera Sotillo", "Frutas Aldabe"]) {
      expect(byGroup.some((text) => text.includes(name))).toBe(true);
    }
  });

  it("keyboard navigation and Escape", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderPicker();

    // Con filtro el orden no depende de los recientes de otros tests.
    await user.type(search(), "GROUP_0147");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(4);
    expect(search()).toHaveAttribute("aria-activedescendant", options[0].id);

    await user.keyboard("{ArrowDown}");
    expect(search()).toHaveAttribute("aria-activedescendant", options[1].id);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowUp}");
    expect(search()).toHaveAttribute("aria-activedescendant", options[1].id);

    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toEqual([
      { kind: "company", id: "COMP_0002", name: "Talleres Mendive S.A." },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows score, regime label and sparkline per row", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(search(), "mendive");
    const row = screen.getByRole("option", { name: /Talleres Mendive/ });

    expect(within(row).getByText("COMP_0002")).toBeInTheDocument();
    expect(within(row).getByText("GROUP_0147")).toBeInTheDocument();
    expect(within(row).getByText("88")).toBeInTheDocument();
    expect(within(row).getByText("Estable")).toBeInTheDocument();
    expect(row.querySelector("svg polyline")).not.toBeNull();
  });

  it("multi mode returns entities in selection order and respects max", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderPicker({ mode: "multi", max: 2 });

    await user.type(search(), "GROUP_0288");
    await user.click(screen.getByRole("option", { name: /Frutas Aldabe/ }));
    await user.click(screen.getByRole("option", { name: /Bodegas Ribalta/ }));

    expect(onClose).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(2);
    const last = onSelect.mock.calls[1][0] as Entity[];
    expect(last.map((entity) => entity.id)).toEqual(["COMP_0010", "COMP_0003"]);

    // Alcanzado el máximo, el resto de filas queda inhabilitado.
    const blocked = screen.getByRole("option", { name: /Papelera Sotillo/ });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    await user.click(blocked);
    expect(onSelect).toHaveBeenCalledTimes(2);

    // Volver a pulsar una seleccionada la quita y conserva el orden del resto.
    await user.click(screen.getByRole("option", { name: /Frutas Aldabe/ }));
    expect(onSelect.mock.calls[2][0]).toEqual([
      { kind: "company", id: "COMP_0003", name: "Bodegas Ribalta S.L." },
    ]);
  });
});
