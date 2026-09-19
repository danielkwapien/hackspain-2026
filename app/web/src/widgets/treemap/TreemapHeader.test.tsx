import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PORTFOLIO } from "@/dashboard/watchlist";
import { treemapExample } from "@/test/examples";
import { mockApi } from "@/test/helpers";
import {
  TreemapHeader,
  UNIVERSE_ALL,
  fmtSizeTotal,
  inUniverse,
  universeGroupBy,
} from "@/widgets/treemap/TreemapHeader";
import type { SizeBy, UniverseValue } from "@/widgets/treemap/TreemapHeader";

/** Radix abre el desplegable con la API de puntero, que jsdom no implementa. */
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

/**
 * Radix bloquea el puntero del `body` mientras el desplegable esta abierto y lo
 * suelta al cerrarlo; un test que termina con uno abierto deja el bloqueo
 * puesto y el siguiente no puede abrir nada.
 */
afterEach(() => {
  document.body.style.pointerEvents = "";
});

/** Buckets por país: los que la API sirve con `group_by=country`. */
const COUNTRIES = {
  ...treemapExample,
  group_by: "country",
  groups: [
    { ...treemapExample.groups[0], key: "ES", label: "España" },
    { ...treemapExample.groups[1], key: "PT", label: "Portugal" },
    { ...treemapExample.groups[2], key: "unknown", label: "unknown" },
  ],
};

const ERPS = {
  ...treemapExample,
  group_by: "erp",
  groups: [
    { ...treemapExample.groups[0], key: "SAP", label: "SAP" },
    { ...treemapExample.groups[1], key: "Odoo", label: "Odoo" },
  ],
};

/**
 * Empresas del corte tal como las ve el filtro: una de la cartera, una
 * favorita y una que no es ni lo uno ni lo otro, repartidas en dos países.
 */
const ENTITIES = [
  { id: PORTFOLIO[0].id, name: "Comercial Navarro y Cia. S.L.", bucketKey: "ES" },
  { id: "COMP_0900", name: "Industrias Olmedo y Cia. S.L.", bucketKey: "PT" },
  { id: "COMP_0901", name: "Alimentaria Zubiri S.A.", bucketKey: "ES" },
];

const FAVORITE = "COMP_0900";

/**
 * Banco de pruebas: la cabecera de verdad, con el estado que el widget le
 * pone, y la lista de empresas que sobrevive al universo elegido. El filtro se
 * mira por lo que queda en la lista, no por el argumento de un espía.
 */
function Harness({ onUniverse }: { onUniverse?: (value: UniverseValue) => void }) {
  const [universe, setUniverse] = useState<UniverseValue>(UNIVERSE_ALL);
  const [size, setSize] = useState<SizeBy>("pending_eur");
  const [metric, setMetric] = useState<"score" | "delta_1m" | "delta_3m">("delta_3m");
  const visible = ENTITIES.filter((entity) => inUniverse(entity, universe, [FAVORITE]));
  return (
    <>
      <TreemapHeader
        universe={universe}
        onUniverseChange={(value) => {
          setUniverse(value);
          onUniverse?.(value);
        }}
        size={size}
        onSizeChange={setSize}
        metric={metric}
        onMetricChange={setMetric}
        status={<span>{`${visible.length} empresas`}</span>}
      />
      <ul>
        {visible.map((entity) => (
          <li key={entity.id}>{entity.name}</li>
        ))}
      </ul>
    </>
  );
}

function renderHeader(props: { onUniverse?: (value: UniverseValue) => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

/** Los tres desplegables, por su etiqueta accesible. */
function pill(name: "Universo" | "Tamaño" | "Color") {
  return screen.getByRole("combobox", { name });
}

/**
 * Abre un desplegable con el teclado. Es lo que hace un usuario que no usa
 * ratón —y por tanto lo que hay que probar— y además el puntero simulado de
 * `user-event` solo abre el primero de cada fichero: su estado vive en el
 * `document`, que los tests comparten.
 */
async function openPill(
  user: ReturnType<typeof userEvent.setup>,
  name: "Universo" | "Tamaño" | "Color",
): Promise<HTMLElement> {
  const trigger = pill(name);
  trigger.focus();
  await user.keyboard("{Enter}");
  return trigger;
}

function optionNames(): string[] {
  return screen.getAllByRole("option").map((option) => option.textContent ?? "");
}

function names(): string[] {
  return screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
}

describe("widgets/treemap/TreemapHeader", () => {
  it("DADO la cabecera CUANDO se mira ENTONCES son tres desplegables etiquetados: universo, tamaño y color", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderHeader();

    expect(pill("Universo")).toHaveTextContent("Todas las empresas");
    expect(pill("Tamaño")).toHaveTextContent("Pendiente de cobro (EUR)");
    expect(pill("Color")).toHaveTextContent("Δ3m");
  });

  it("DADO el desplegable de universo CUANDO se abre ENTONCES ofrece cartera, favoritos y los buckets de país y ERP", async () => {
    const fetchMock = mockApi([
      { match: "group_by=country", body: COUNTRIES },
      { match: "group_by=erp", body: ERPS },
      { match: "/api/v2/treemap", body: treemapExample },
    ]);
    const user = userEvent.setup();
    renderHeader();

    // Perezoso: sin abrir, la cabecera no pide ni una lista de buckets.
    expect(fetchMock).not.toHaveBeenCalled();

    await openPill(user, "Universo");

    expect(await screen.findByRole("option", { name: "España" })).toBeInTheDocument();
    expect(optionNames()).toEqual([
      "Todas las empresas",
      "Mi cartera",
      "Favoritos",
      "España",
      "Portugal",
      // El bucket sin país no se llama «unknown» en la cara del usuario.
      "Sin dato",
      "SAP",
      "Odoo",
    ]);
    // Las dos secciones nombradas, para saber qué es un país y qué un ERP.
    expect(screen.getByText("País")).toBeInTheDocument();
    expect(screen.getByText("ERP")).toBeInTheDocument();

    // Se cierra con Escape, como cualquier menú, y el foco vuelve al control.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).toBeNull();
    expect(pill("Universo")).toHaveFocus();
  });

  it("DADO un país CUANDO se elige ENTONCES el corte se agrupa por país y el universo queda filtrado a ese bucket", async () => {
    mockApi([
      { match: "group_by=country", body: COUNTRIES },
      { match: "group_by=erp", body: ERPS },
      { match: "/api/v2/treemap", body: treemapExample },
    ]);
    const user = userEvent.setup();
    const chosen = vi.fn();
    renderHeader({ onUniverse: chosen });

    await openPill(user, "Universo");
    await user.click(await screen.findByRole("option", { name: "España" }));

    expect(chosen).toHaveBeenCalledWith("country:ES");
    // Elegir un país fija `group_by`: es lo que hace que la API mande esos buckets.
    expect(universeGroupBy("country:ES")).toBe("country");
    expect(universeGroupBy("erp:SAP")).toBe("erp");
    expect(universeGroupBy(UNIVERSE_ALL)).toBe("group");
    // Y filtra de verdad: las dos de España, no las tres del corte.
    expect(names()).toEqual(["Comercial Navarro y Cia. S.L.", "Alimentaria Zubiri S.A."]);
    expect(pill("Universo")).toHaveTextContent("España");
  });

  it("DADO Mi cartera y Favoritos CUANDO se eligen ENTONCES filtran contra la watchlist sin pedirle nada a la API", async () => {
    const fetchMock = mockApi([
      { match: "group_by=country", body: COUNTRIES },
      { match: "group_by=erp", body: ERPS },
      { match: "/api/v2/treemap", body: treemapExample },
    ]);
    const user = userEvent.setup();
    renderHeader();

    await openPill(user, "Universo");
    const calls = fetchMock.mock.calls.length;
    await user.click(await screen.findByRole("option", { name: "Mi cartera" }));

    expect(names()).toEqual(["Comercial Navarro y Cia. S.L."]);
    // La cartera vive en el cliente: ni una petición más que las dos listas.
    expect(fetchMock.mock.calls).toHaveLength(calls);

    await openPill(user, "Universo");
    await user.click(await screen.findByRole("option", { name: "Favoritos" }));

    expect(names()).toEqual(["Industrias Olmedo y Cia. S.L."]);
    expect(fetchMock.mock.calls).toHaveLength(calls);
  });

  it("DADO el desplegable de tamaño CUANDO se abre ENTONCES son las cuatro magnitudes que el motor emite, con el euro dicho", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    renderHeader();

    await openPill(user, "Tamaño");

    expect(optionNames()).toEqual([
      // El «(EUR)» no se quita: el pendiente suma solo facturas en euros, y los
      // cobros de 12 meses son los convertidos (`op_in_12m_eur`), no los de la
      // moneda de cada entidad.
      "Pendiente de cobro (EUR)",
      "Cobros 12m (EUR)",
      "Nº de facturas",
      "Nº de movimientos",
    ]);

    await user.click(screen.getByRole("option", { name: "Nº de facturas" }));
    expect(pill("Tamaño")).toHaveTextContent("Nº de facturas");
  });

  it("DADO el desplegable de color CUANDO el corte no tiene historia ENTONCES solo ofrece Score", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TreemapHeader
          universe={UNIVERSE_ALL}
          onUniverseChange={() => {}}
          size="pending_eur"
          onSizeChange={() => {}}
          metric="score"
          onMetricChange={() => {}}
          snapshotsOnly
        />
      </QueryClientProvider>,
    );

    await openPill(user, "Color");
    expect(optionNames()).toEqual(["Score"]);
  });

  it("DADO el desplegable de color CUANDO hay historia ENTONCES ofrece Score y los dos Δ, y se navega con el teclado", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    renderHeader();

    // Con el teclado: tabular hasta el control, abrirlo y elegir con las flechas.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(pill("Color")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(optionNames()).toEqual(["Score", "Δ3m", "Δ1m"]);

    await user.keyboard("{ArrowUp}{Enter}");
    expect(pill("Color")).toHaveTextContent("Score");
    expect(pill("Color")).toHaveFocus();
  });

  it("DADO el total de una magnitud CUANDO se formatea ENTONCES el dinero lleva su moneda y el recuento su palabra", () => {
    // El espacio fino antes de la unidad es el del contrato visual, no un espacio normal.
    expect(fmtSizeTotal("pending_eur", 406_400_000)).toBe("EUR 406,4\u2009M");
    expect(fmtSizeTotal("op_in_12m_eur", 53_975_000_000)).toBe("EUR 53.975\u2009M");
    expect(fmtSizeTotal("n_invoices", 1284)).toBe("1.284 facturas");
    expect(fmtSizeTotal("n_transactions", 42)).toBe("42 movimientos");
    // Un recuento no lleva nunca un símbolo de moneda inventado.
    expect(fmtSizeTotal("n_invoices", 1284)).not.toContain("EUR");
    // El censo ya dice cuántas empresas hay: no hay total que añadir.
    expect(fmtSizeTotal("n_companies", 173)).toBeNull();
  });
});
