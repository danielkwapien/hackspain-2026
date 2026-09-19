import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { fmtDelta, fmtPoints } from "@/charts";
import { getSelection, resetSelection, select } from "@/dashboard/selection";
import type { LayoutItem } from "@/dashboard/types";
import { BAND_LABEL } from "@/lib/regime";
import { companyFixture, groupFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { GroupWidget } from "@/widgets/group/GroupWidget";

const GROUP_ID = groupFixture.group.group_id; // GROUP_0095
const STRONGEST = groupFixture.strongest_company; // COMP_0248
const SUBSIDIARIES = groupFixture.companies;

/** Ficha de la empresa más fuerte del grupo: el widget solo le pide `group_id`. */
const strongestCompany = {
  ...companyFixture,
  company: { ...companyFixture.company, company_id: STRONGEST, group_id: GROUP_ID },
};

function item(entity: string | null = null): LayoutItem {
  return { i: "w1", type: "group", x: 0, y: 0, w: 12, h: 12, entity };
}

function renderWidget(entity: string | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <GroupWidget item={item(entity)} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockGroup() {
  return mockApi([
    { match: `/api/v2/companies/${STRONGEST}`, body: strongestCompany },
    { match: `/api/v2/groups/${GROUP_ID}`, body: groupFixture },
  ]);
}

function requestedUrls(fetchMock: ReturnType<typeof mockApi>): string[] {
  return fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : ""));
}

/** Fila de una filial: el elemento con `aria-selected` que contiene su nombre. */
function rowOf(name: string): HTMLElement {
  const label = screen.getByText(name);
  const row = label.closest<HTMLElement>("[aria-selected]");
  if (!row) throw new Error(`La filial ${name} no está en una fila seleccionable`);
  return row;
}

describe("widget Grupo", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("DADO sin selección CUANDO se monta ENTONCES pide elegir una empresa o un grupo", () => {
    const fetchMock = mockGroup();
    renderWidget();

    expect(screen.getByText("Selecciona una empresa o un grupo")).toBeInTheDocument();
    expect(screen.queryByText(groupFixture.group.name)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DADO COMP_0248 seleccionada CUANDO se monta ENTONCES cabecera con score/Δ/banda, meter entre weakest y strongest y 12 filiales", async () => {
    const fetchMock = mockGroup();
    select(STRONGEST);
    renderWidget();

    expect(await screen.findByText(groupFixture.group.name)).toBeInTheDocument();
    expect(requestedUrls(fetchMock).some((url) => url.includes(`/api/v2/groups/${GROUP_ID}`))).toBe(
      true,
    );
    expect(screen.getByText(GROUP_ID)).toBeInTheDocument();
    expect(screen.getByText(fmtPoints(groupFixture.score))).toBeInTheDocument();
    expect(screen.getByText(fmtDelta(groupFixture.delta_1m).text)).toBeInTheDocument();
    expect(screen.getByText(BAND_LABEL[groupFixture.band])).toBeInTheDocument();

    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuemin", String(groupFixture.weakest_score));
    expect(meter).toHaveAttribute("aria-valuemax", String(groupFixture.strongest_score));
    expect(meter).toHaveAttribute("aria-valuenow", String(groupFixture.score));
    expect(meter).toHaveAccessibleName(
      `Valor entre ${groupFixture.weakest_company} y ${groupFixture.strongest_company}`,
    );
    expect(screen.getByText(`Dispersión ${fmtPoints(groupFixture.dispersion)}`)).toBeInTheDocument();

    // Todas las filiales, por score descendente como llegan, con su sparkline.
    for (const company of SUBSIDIARIES) {
      expect(screen.getByText(company.name)).toBeInTheDocument();
    }
    expect(document.querySelectorAll("[aria-selected]")).toHaveLength(SUBSIDIARIES.length);
    expect(screen.getAllByRole("img", { name: /Sparkline/ })).toHaveLength(SUBSIDIARIES.length);
    expect(rowOf(SUBSIDIARIES[0].name)).toHaveAttribute("aria-selected", "true");
    expect(rowOf(SUBSIDIARIES[1].name)).toHaveAttribute("aria-selected", "false");
  });

  it("DADO entity fijada CUANDO hay otra empresa seleccionada ENTONCES el widget ignora la selección", async () => {
    const fetchMock = mockGroup();
    select("COMP_0001");
    renderWidget(GROUP_ID);

    expect(await screen.findByText(groupFixture.group.name)).toBeInTheDocument();
    const urls = requestedUrls(fetchMock);
    expect(urls.some((url) => url.includes(`/api/v2/groups/${GROUP_ID}`))).toBe(true);
    expect(urls.some((url) => url.includes("/api/v2/companies/"))).toBe(false);
  });

  it("DADO una filial CUANDO clic ENTONCES select(id)", async () => {
    mockGroup();
    const user = userEvent.setup();
    select(STRONGEST);
    renderWidget();
    await screen.findByText(groupFixture.group.name);

    const second = SUBSIDIARIES[1];
    await user.click(within(rowOf(second.name)).getByText(second.name));

    expect(getSelection().selected).toBe(second.id);
    expect(rowOf(second.name)).toHaveAttribute("aria-selected", "true");
    expect(rowOf(SUBSIDIARIES[0].name)).toHaveAttribute("aria-selected", "false");
  });
});
