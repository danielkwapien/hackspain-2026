import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { SearchTrigger } from "@/components/SearchTrigger";
import { getSelection, resetSelection } from "@/dashboard/selection";
import { companyFixtureFor, groupFixture, groupUniverseFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";

/** Grupo Ribalta (GROUP_0288): el que `groupFixture` sirve con sus filiales por score. */
const RIBALTA = groupUniverseFixture.items[1];
const RIBALTA_COMPANIES = groupFixture.companies;
const FIRST_CHILD = RIBALTA_COMPANIES[0];

const PLACEHOLDER = "Buscar empresa o grupo…";

/** `unit=group` → grupos; `/groups/:id` → filiales; `/companies/:id` → la ficha del elegido. */
function mockSearch() {
  return mockApi([
    { match: `/api/v2/groups/${RIBALTA.id}`, body: groupFixture },
    { match: `/api/v2/companies/${FIRST_CHILD.id}`, body: companyFixtureFor(FIRST_CHILD.id) },
    { match: "unit=group", body: groupUniverseFixture },
  ]);
}

function renderTrigger() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <header className="relative">
          <SearchTrigger />
        </header>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function urls(fetchMock: ReturnType<typeof mockApi>): string[] {
  return fetchMock.mock.calls.map((call) => (typeof call[0] === "string" ? call[0] : ""));
}

function trigger(): HTMLElement {
  const button = screen
    .getAllByRole("button")
    .find((candidate) => candidate.getAttribute("aria-haspopup") === "dialog");
  if (!button) throw new Error("No hay disparador con aria-haspopup=dialog");
  return button;
}

function filterInput(): HTMLElement {
  return screen.getByRole("textbox", { name: "Filtrar empresas y grupos" });
}

/** Fila cuyo nombre es `name` dentro del diálogo. */
function rowNamed(name: string): HTMLElement {
  const rows = within(screen.getByRole("dialog")).getAllByRole("row");
  const found = rows.find((row) => within(row).queryByText(name));
  if (!found) throw new Error(`No hay fila para ${name}`);
  return found;
}

async function openAndWait(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(trigger());
  await screen.findByRole("dialog", { name: "Buscar empresa o grupo" });
  expect(await within(screen.getByRole("dialog")).findByText(RIBALTA.name)).toBeInTheDocument();
}

describe("SearchTrigger", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("DADO la topbar CUANDO se monta ENTONCES un botón centrado con aria-haspopup=dialog, placeholder y ⌘K; sin input ni diálogo", () => {
    const fetchMock = mockSearch();
    renderTrigger();

    const button = trigger();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveTextContent(PLACEHOLDER);
    expect(button).toHaveTextContent("⌘K");
    expect(button.querySelector("kbd")).not.toBeNull();
    expect(button.className).toContain("left-1/2");
    expect(button.className).toContain("-translate-x-1/2");
    expect(`${button.getAttribute("style") ?? ""} ${button.className}`).toContain("--size-search-w");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DADO clic en el disparador ENTONCES abre el diálogo con el input enfocado y pide /universe?unit=group&limit=500", async () => {
    const fetchMock = mockSearch();
    const user = userEvent.setup();
    renderTrigger();

    await openAndWait(user);

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(filterInput()).toHaveFocus();
    const universeUrl = urls(fetchMock).find((url) => url.includes("/api/v2/universe"));
    expect(universeUrl).toContain("unit=group");
    expect(universeUrl).toContain("limit=500");
    expect(universeUrl).toContain("offset=0");

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("treegrid")).toBeInTheDocument();
    for (const group of groupUniverseFixture.items) {
      expect(within(dialog).getByText(group.name)).toBeInTheDocument();
    }
    expect(within(dialog).getByText(/Enter elegir/)).toBeInTheDocument();
  });

  it("DADO el diálogo abierto CUANDO se teclea ENTONCES la consulta lleva q y la búsqueda global del store no cambia", async () => {
    const fetchMock = mockSearch();
    const user = userEvent.setup();
    renderTrigger();
    await openAndWait(user);

    await user.type(filterInput(), "arga");

    await waitFor(() => expect(urls(fetchMock).at(-1)).toContain("q=arga"));
    expect(urls(fetchMock).at(-1)).toContain("unit=group");
    expect(getSelection().search).toBe("");
  });

  it("DADO un grupo CUANDO ▸ ENTONCES pide /groups/:id y sangra las filiales bajo él", async () => {
    const fetchMock = mockSearch();
    const user = userEvent.setup();
    renderTrigger();
    await openAndWait(user);

    await user.click(screen.getByRole("button", { name: `Desplegar ${RIBALTA.name}` }));

    await waitFor(() =>
      expect(urls(fetchMock).some((url) => url.includes(`/api/v2/groups/${RIBALTA.id}`))).toBe(true),
    );
    expect(await within(screen.getByRole("dialog")).findByText(FIRST_CHILD.name)).toBeInTheDocument();
    expect(rowNamed(RIBALTA.name)).toHaveAttribute("aria-expanded", "true");
    const rows = within(screen.getByRole("dialog")).getAllByRole("row");
    const parentIndex = rows.indexOf(rowNamed(RIBALTA.name));
    RIBALTA_COMPANIES.forEach((company, index) => {
      const row = rowNamed(company.name);
      expect(row).toHaveAttribute("aria-level", "2");
      expect(rows.indexOf(row)).toBe(parentIndex + 1 + index);
    });
    // Desplegar no elige: la selección sigue vacía y el diálogo abierto.
    expect(getSelection().selectedGroup).toBeNull();
    expect(getSelection().selectedEntity).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("DADO una filial CUANDO clic ENTONCES select(id), selectedEntity company, el diálogo se cierra, el foco vuelve al disparador y este muestra el nombre", async () => {
    mockSearch();
    const user = userEvent.setup();
    renderTrigger();
    await openAndWait(user);
    await user.click(screen.getByRole("button", { name: `Desplegar ${RIBALTA.name}` }));
    await within(screen.getByRole("dialog")).findByText(FIRST_CHILD.name);

    await user.click(within(rowNamed(FIRST_CHILD.name)).getByText(FIRST_CHILD.name));

    expect(getSelection().selected).toBe(FIRST_CHILD.id);
    expect(getSelection().selectedEntity).toEqual({ kind: "company", id: FIRST_CHILD.id });
    expect(getSelection().selectedGroup).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(await screen.findByText(FIRST_CHILD.name)).toBeInTheDocument();
    expect(trigger()).not.toHaveTextContent(PLACEHOLDER);
  });

  it("DADO un grupo enfocado CUANDO Enter ENTONCES selectGroup(id), selectedEntity group y el diálogo se cierra", async () => {
    mockSearch();
    const user = userEvent.setup();
    renderTrigger();
    await openAndWait(user);

    rowNamed(RIBALTA.name).focus();
    expect(rowNamed(RIBALTA.name)).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(getSelection().selectedGroup).toBe(RIBALTA.id);
    expect(getSelection().selectedEntity).toEqual({ kind: "group", id: RIBALTA.id });
    expect(getSelection().selected).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it("DADO ⌘K CUANDO se pulsa ENTONCES abre; Escape cierra sin cambiar la selección; Ctrl+K también abre", async () => {
    mockSearch();
    const user = userEvent.setup();
    renderTrigger();

    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog", { name: "Buscar empresa o grupo" })).toBeInTheDocument();
    expect(filterInput()).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(getSelection()).toMatchObject({
      selected: null,
      selectedGroup: null,
      selectedEntity: null,
      search: "",
    });

    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog", { name: "Buscar empresa o grupo" })).toBeInTheDocument();
  });
});
