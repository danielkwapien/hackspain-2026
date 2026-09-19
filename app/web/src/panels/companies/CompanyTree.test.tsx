import { useState } from "react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UniverseItem, UniverseQuery } from "@/lib/api-v2";
import { CompanyTree } from "@/panels/companies/CompanyTree";
import { flatRows, flattenTree } from "@/panels/companies/tree";
import { groupFixture, groupUniverseFixture } from "@/test/fixtures/v2";

const [ARGA, RIBALTA, BELMAR] = groupUniverseFixture.items;

/** Filiales de Ribalta tal como las publica `/groups/GROUP_0288`, por score. */
const RIBALTA_COMPANIES = groupFixture.companies;

type Spies = {
  onExpand?: (id: string) => void;
  onCollapse?: (id: string) => void;
  onPickCompany?: (id: string) => void;
  onPickGroup?: (id: string) => void;
  onRetryGroup?: (id: string) => void;
};

type HarnessProps = Spies & {
  initialExpanded?: string[];
  /** Grupos cuya consulta de filiales ha fallado: pintan la fila de error. */
  failed?: string[];
  selectedGroup?: string | null;
  sort?: { query: UniverseQuery; onSort: (column: string) => void };
};

/**
 * El árbol es tonto: las filas vienen de `flattenTree` y el estado de despliegue
 * vive en el padre (aquí, el harness), como en `CompaniesPanel` y en el overlay.
 */
function Harness({
  initialExpanded = [],
  failed = [],
  selectedGroup = null,
  sort,
  ...spies
}: HarnessProps): ReactElement {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initialExpanded));
  const failedIds = new Set(failed);
  const children = new Map<string, readonly UniverseItem[]>();
  if (!failedIds.has(RIBALTA.id)) children.set(RIBALTA.id, RIBALTA_COMPANIES);
  const rows = flattenTree(groupUniverseFixture.items, expanded, children, failedIds);

  return (
    <CompanyTree
      rows={rows}
      treeView
      expanded={expanded}
      onExpand={(id) => {
        spies.onExpand?.(id);
        setExpanded((previous) => new Set(previous).add(id));
      }}
      onCollapse={(id) => {
        spies.onCollapse?.(id);
        setExpanded((previous) => {
          const next = new Set(previous);
          next.delete(id);
          return next;
        });
      }}
      selected={null}
      selectedGroup={selectedGroup}
      onPickCompany={(id) => spies.onPickCompany?.(id)}
      onPickGroup={(id) => spies.onPickGroup?.(id)}
      onRetryGroup={(id) => spies.onRetryGroup?.(id)}
      sort={sort}
      label="Empresas"
    />
  );
}

/** Fila cuyo nombre es `name`: el nombre es lo único que identifica la fila. */
function rowNamed(name: string): HTMLElement {
  const rows = screen.getAllByRole("row");
  const found = rows.find((row) => within(row).queryByText(name));
  if (!found) throw new Error(`No hay fila para ${name}`);
  return found;
}

function focusableRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.getAttribute("tabindex") === "0");
}

describe("CompanyTree", () => {
  it("renders unavailable score fields as placeholders", () => {
    const sparse = {
      ...RIBALTA_COMPANIES[0],
      score: null,
      band: null,
      delta_1m: null,
      delta_3m: null,
      regime: null,
      confidence: null,
      op_in_12m_eur: null,
    };
    render(
      <CompanyTree
        rows={flatRows([sparse])}
        treeView
        expanded={new Set()}
        onExpand={() => undefined}
        onCollapse={() => undefined}
        selected={null}
        selectedGroup={null}
        onPickCompany={() => undefined}
        onPickGroup={() => undefined}
        onRetryGroup={() => undefined}
      />,
    );

    const row = rowNamed(sparse.name);
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(within(row).queryByText("0,0")).toBeNull();
  });

  it("DADO grupos plegados CUANDO se monta ENTONCES treegrid «Empresas» con aria-level/aria-expanded por fila y una sola fila con tabIndex 0 (la seleccionada)", () => {
    render(<Harness selectedGroup={RIBALTA.id} />);

    expect(screen.getByRole("treegrid", { name: "Empresas" })).toBeInTheDocument();
    for (const group of groupUniverseFixture.items) {
      const row = rowNamed(group.name);
      expect(row).toHaveAttribute("aria-level", "1");
      expect(row).toHaveAttribute("aria-expanded", "false");
      expect(within(row).getByRole("button", { name: `Desplegar ${group.name}` })).toBeInTheDocument();
    }
    expect(rowNamed(RIBALTA.name)).toHaveAttribute("aria-selected", "true");
    expect(rowNamed(ARGA.name)).toHaveAttribute("aria-selected", "false");

    const focusable = focusableRows();
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toBe(rowNamed(RIBALTA.name));
  });

  it("DADO el foco en una fila CUANDO ↓/↑/Home/End, → y ← ENTONCES mueve el foco, despliega, pliega o sube al padre", async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    const onCollapse = vi.fn();
    render(<Harness onExpand={onExpand} onCollapse={onCollapse} />);

    rowNamed(ARGA.name).focus();
    expect(rowNamed(ARGA.name)).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(rowNamed(RIBALTA.name)).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(rowNamed(ARGA.name)).toHaveFocus();
    await user.keyboard("{End}");
    expect(rowNamed(BELMAR.name)).toHaveFocus();
    await user.keyboard("{Home}");
    expect(rowNamed(ARGA.name)).toHaveFocus();
    expect(focusableRows()).toHaveLength(1);

    // → sobre un grupo plegado lo despliega; sobre uno desplegado baja a la primera filial.
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowRight}");
    expect(onExpand).toHaveBeenCalledWith(RIBALTA.id);
    expect(rowNamed(RIBALTA.name)).toHaveAttribute("aria-expanded", "true");
    expect(rowNamed(RIBALTA_COMPANIES[0].name)).toHaveAttribute("aria-level", "2");
    expect(rowNamed(RIBALTA.name)).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(rowNamed(RIBALTA_COMPANIES[0].name)).toHaveFocus();

    // ← sobre una filial sube al grupo; sobre el grupo desplegado lo pliega.
    await user.keyboard("{ArrowLeft}");
    expect(rowNamed(RIBALTA.name)).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(onCollapse).toHaveBeenCalledWith(RIBALTA.id);
    expect(rowNamed(RIBALTA.name)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(RIBALTA_COMPANIES[0].name)).toBeNull();
  });

  it("DADO Enter o clic CUANDO la fila es una filial ENTONCES onPickCompany; cuando es un grupo, onPickGroup (sin desplegar por su cuenta)", async () => {
    const user = userEvent.setup();
    const onPickCompany = vi.fn();
    const onPickGroup = vi.fn();
    const onExpand = vi.fn();
    render(
      <Harness
        initialExpanded={[RIBALTA.id]}
        onPickCompany={onPickCompany}
        onPickGroup={onPickGroup}
        onExpand={onExpand}
      />,
    );

    const child = RIBALTA_COMPANIES[1];
    rowNamed(child.name).focus();
    await user.keyboard("{Enter}");
    expect(onPickCompany).toHaveBeenCalledTimes(1);
    expect(onPickCompany).toHaveBeenCalledWith(child.id);
    expect(onPickGroup).not.toHaveBeenCalled();

    rowNamed(ARGA.name).focus();
    await user.keyboard("{Enter}");
    expect(onPickGroup).toHaveBeenCalledTimes(1);
    expect(onPickGroup).toHaveBeenCalledWith(ARGA.id);
    expect(onExpand).not.toHaveBeenCalled();
    expect(rowNamed(ARGA.name)).toHaveAttribute("aria-expanded", "false");

    await user.click(within(rowNamed(child.name)).getByText(child.name));
    expect(onPickCompany).toHaveBeenCalledTimes(2);
    await user.click(within(rowNamed(BELMAR.name)).getByText(BELMAR.name));
    expect(onPickGroup).toHaveBeenLastCalledWith(BELMAR.id);

    // El ▸ solo despliega: no elige.
    await user.click(within(rowNamed(ARGA.name)).getByRole("button", { name: `Desplegar ${ARGA.name}` }));
    expect(onExpand).toHaveBeenCalledWith(ARGA.id);
    expect(onPickGroup).toHaveBeenCalledTimes(2);
  });

  it("DADO sin sort ENTONCES las cabeceras no son botones ni llevan aria-sort; con sort, Score es un botón con aria-sort y clic llama onSort", async () => {
    const user = userEvent.setup();
    const plain = render(<Harness />);

    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThan(2);
    for (const header of headers) {
      expect(within(header).queryByRole("button")).toBeNull();
      expect(header.getAttribute("aria-sort") ?? "none").toBe("none");
    }
    expect(screen.getByRole("columnheader", { name: "Score" })).toBeInTheDocument();
    // XR-037 (I1): la columna del recuento de filiales se llamaba «n».
    expect(screen.getByRole("columnheader", { name: "Filiales" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "n" })).toBeNull();
    plain.unmount();

    const onSort = vi.fn();
    render(<Harness sort={{ query: { sort: "score", order: "desc" }, onSort }} />);
    const score = screen.getByRole("columnheader", { name: "Score" });
    expect(score).toHaveAttribute("aria-sort", "descending");
    await user.click(within(score).getByRole("button", { name: "Score" }));
    expect(onSort).toHaveBeenCalledWith("score");
  });

  it("DADO un grupo cuya consulta falló CUANDO se despliega ENTONCES fila de error con Reintentar que llama onRetryGroup(id)", async () => {
    const user = userEvent.setup();
    const onRetryGroup = vi.fn();
    const onPickGroup = vi.fn();
    render(
      <Harness
        initialExpanded={[RIBALTA.id]}
        failed={[RIBALTA.id]}
        onRetryGroup={onRetryGroup}
        onPickGroup={onPickGroup}
      />,
    );

    expect(screen.getByText(/No se pudieron cargar las filiales/)).toBeInTheDocument();
    expect(screen.queryByText(RIBALTA_COMPANIES[0].name)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(onRetryGroup).toHaveBeenCalledTimes(1);
    expect(onRetryGroup).toHaveBeenCalledWith(RIBALTA.id);
    // El clic en Reintentar no burbujea como clic de fila.
    expect(onPickGroup).not.toHaveBeenCalled();
  });
});
