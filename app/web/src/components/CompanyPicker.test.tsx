import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompanyPicker } from "@/components/CompanyPicker";
import { universeFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";

/** Los 8 primeros del universo por score: lo que devuelve `limit=8&sort=score`. */
const TOP_8 = [...universeFixture.items].sort((a, b) => b.score - a.score).slice(0, 8);
const topUniverse = { ...universeFixture, items: TOP_8, total: universeFixture.total, limit: 8 };

const ARGA = universeFixture.items.find((item) => item.id === "COMP_0001")!;

type PickerProps = Partial<Parameters<typeof CompanyPicker>[0]>;

function renderPicker(props: PickerProps = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const onPick = props.onPick ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <button type="button">Fuera</button>
      <CompanyPicker
        value={null}
        label="Empresa B"
        placeholder="Elegir empresa"
        {...props}
        onPick={onPick}
      />
    </QueryClientProvider>,
  );
  return { onPick };
}

/** Última URL que recibió el `fetch` simulado: la consulta que sale de verdad. */
function lastUrl(fetchMock: ReturnType<typeof mockApi>): string {
  const calls = fetchMock.mock.calls;
  const last = calls[calls.length - 1]?.[0];
  return typeof last === "string" ? last : "";
}

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: /Empresa B/ });
}

describe("CompanyPicker", () => {
  it("opens a listbox with 8 rows from /universe?q= and marks aria-activedescendant", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/universe", body: topUniverse }]);
    const user = userEvent.setup();
    renderPicker();

    expect(trigger()).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(trigger()).toHaveTextContent("Elegir empresa");

    await user.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(8);
    expect(options.map((option) => option.textContent)).toEqual(
      expect.arrayContaining(TOP_8.map((item) => expect.stringContaining(item.name))),
    );

    const url = lastUrl(fetchMock);
    expect(url).toContain("/api/v2/universe?");
    expect(url).toContain("unit=company");
    expect(url).toContain("limit=8");
    expect(url).toContain("sort=score");
    expect(url).not.toContain("q=");

    const combobox = screen.getByRole("combobox", { name: "Buscar empresa" });
    expect(combobox).toHaveFocus();
    expect(combobox).toHaveAttribute("aria-autocomplete", "list");
    expect(combobox).toHaveAttribute("aria-controls", listbox.id);
    expect(options[0].id).not.toBe("");
    expect(combobox).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("typing rewrites q; ArrowDown/Enter pick and call onPick", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/universe", body: topUniverse }]);
    const user = userEvent.setup();
    const { onPick } = renderPicker();

    await user.click(trigger());
    await screen.findByRole("listbox");

    await user.keyboard("arga");
    await waitFor(() => expect(lastUrl(fetchMock)).toContain("q=arga"));

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("combobox", { name: "Buscar empresa" })).toHaveAttribute(
      "aria-activedescendant",
      options[1].id,
    );

    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: TOP_8[1].id, name: TOP_8[1].name }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape closes and returns focus to the trigger", async () => {
    mockApi([{ match: "/api/v2/universe", body: topUniverse }]);
    const user = userEvent.setup();
    const { onPick } = renderPicker();

    await user.click(trigger());
    await screen.findByRole("listbox");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("outside click closes", async () => {
    mockApi([{ match: "/api/v2/universe", body: topUniverse }]);
    const user = userEvent.setup();
    renderPicker();

    await user.click(trigger());
    await screen.findByRole("listbox");

    await user.click(screen.getByRole("button", { name: "Fuera" }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("empty result shows Sin resultados", async () => {
    mockApi([{ match: "/api/v2/universe", body: { ...universeFixture, items: [], total: 0 } }]);
    const user = userEvent.setup();
    renderPicker();

    await user.click(trigger());

    expect(await screen.findByText("Sin resultados")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("allowFollow prepends Seguir la selección global and picks null", async () => {
    mockApi([{ match: "/api/v2/universe", body: topUniverse }]);
    const user = userEvent.setup();
    const { onPick } = renderPicker({ value: { id: ARGA.id, name: ARGA.name }, allowFollow: true });

    expect(trigger()).toHaveTextContent(ARGA.name);

    await user.click(trigger());
    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Seguir la selección global");

    await user.click(options[0]);
    expect(onPick).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("without allowFollow there is no follow option", async () => {
    mockApi([{ match: "/api/v2/universe", body: topUniverse }]);
    const user = userEvent.setup();
    renderPicker({ value: { id: ARGA.id, name: ARGA.name } });

    await user.click(trigger());
    await screen.findByRole("listbox");

    expect(screen.queryByRole("option", { name: /Seguir la selección global/ })).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(8);
  });
});
