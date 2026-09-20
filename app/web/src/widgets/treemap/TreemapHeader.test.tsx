import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PORTFOLIO } from "@/dashboard/watchlist";
import type { TreemapCompany } from "@/lib/api-v2";
import {
  NO_ERP,
  TreemapHeader,
  UNIVERSE_ALL,
  activeFilters,
  fmtSizeTotal,
  inUniverse,
  withoutFilter,
} from "@/widgets/treemap/TreemapHeader";
import type { SizeBy, UniverseValue } from "@/widgets/treemap/TreemapHeader";

/** Radix abre desplegables y cajones con la API de puntero, que jsdom no implementa. */
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

/**
 * Las sociedades del corte tal como las manda `/api/v2/treemap`: una de la
 * cartera, una favorita y dos sueltas, repartidas en dos paises, tres
 * industrias y —lo que importa— dos SIN ERP.
 */
const COMPANIES: TreemapCompany[] = [
  {
    id: PORTFOLIO[0].id,
    country: "España",
    country_declared: "ES",
    industry: "industria y manufactura",
    erp: "sage200",
  },
  {
    id: "COMP_0900",
    country: "Portugal",
    country_declared: null,
    industry: "hostelería y ocio",
    erp: null,
  },
  {
    id: "COMP_0901",
    country: "España",
    country_declared: null,
    industry: "hostelería y ocio",
    erp: null,
  },
  {
    id: "COMP_0902",
    country: "España",
    country_declared: null,
    industry: "comercio minorista",
    erp: "netsuite",
  },
];

const NAMES: Record<string, string> = {
  [PORTFOLIO[0].id]: "Comercial Navarro y Cia. S.L.",
  COMP_0900: "Industrias Olmedo y Cia. S.L.",
  COMP_0901: "Alimentaria Zubiri S.A.",
  COMP_0902: "Talleres Iranzo y Cia. S.L.",
};

const FAVORITE = "COMP_0900";

/**
 * Banco de pruebas: la cabecera de verdad, con el estado que le pone el widget,
 * y la lista de empresas que sobrevive a los filtros. El filtro se mira por lo
 * que queda en la lista, no por el argumento de un espia.
 */
function Harness() {
  const [universe, setUniverse] = useState<UniverseValue>(UNIVERSE_ALL);
  const [size, setSize] = useState<SizeBy>("pending_eur");
  const [metric, setMetric] = useState<"score" | "delta_1m" | "delta_3m">("delta_3m");
  const visible = COMPANIES.filter((company) => inUniverse(company, universe, [FAVORITE]));
  return (
    <>
      <TreemapHeader
        universe={universe}
        onUniverseChange={setUniverse}
        companies={COMPANIES}
        size={size}
        onSizeChange={setSize}
        metric={metric}
        onMetricChange={setMetric}
        status={<span>{`${visible.length} empresas`}</span>}
      />
      <ul>
        {visible.map((company) => (
          <li key={company.id}>{NAMES[company.id]}</li>
        ))}
      </ul>
    </>
  );
}

function renderHeader() {
  return render(<Harness />);
}

type PillName = "Cartera" | "País" | "Industria" | "ERP" | "Tamaño" | "Color";

function pill(name: PillName) {
  return screen.getByRole("combobox", { name });
}

/** El boton que abre el cajon con los tres filtros de dimension. */
function filtersButton() {
  return screen.getByRole("button", { name: /^Filtros/ });
}

/**
 * Abre un desplegable con el teclado. Es lo que hace un usuario que no usa
 * raton —y por tanto lo que hay que probar— y ademas el puntero simulado de
 * `user-event` solo abre el primero de cada fichero: su estado vive en el
 * `document`, que los tests comparten.
 */
async function openPill(
  user: ReturnType<typeof userEvent.setup>,
  name: PillName,
): Promise<HTMLElement> {
  const trigger = pill(name);
  trigger.focus();
  await user.keyboard("{Enter}");
  return trigger;
}

/** Abre el cajon de filtros, que es donde viven Pais, Industria y ERP. */
async function openFilters(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  filtersButton().focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("combobox", { name: "País" });
}

function optionNames(): string[] {
  return screen.getAllByRole("option").map((option) => option.textContent ?? "");
}

function names(): string[] {
  return screen.queryAllByRole("listitem").map((item) => item.textContent ?? "");
}

/** Elige una opcion de un desplegable. */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  name: PillName,
  option: string,
): Promise<void> {
  await openPill(user, name);
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("widgets/treemap/TreemapHeader", () => {
  it("DADO 432 px CUANDO se mira la cabecera ENTONCES a la vista van Cartera, Filtros, Tamaño y Color, y los tres de dimensión dentro del cajón", async () => {
    const user = userEvent.setup();
    renderHeader();

    expect(pill("Cartera")).toHaveTextContent("Todas las empresas");
    expect(pill("Tamaño")).toHaveTextContent("Pendiente de cobro (EUR)");
    expect(pill("Color")).toHaveTextContent("Δ3m");
    // Seis desplegables en una fila de 432 px se van a TRES renglones y el mapa
    // pierde 64 px de alto (medido): los tres de dimension viven en un cajon.
    expect(filtersButton()).toHaveTextContent("Filtros");
    expect(screen.queryByRole("combobox", { name: "País" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Industria" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "ERP" })).toBeNull();

    await openFilters(user);
    expect(pill("País")).toHaveTextContent("Todos los países");
    expect(pill("Industria")).toHaveTextContent("Todas las industrias");
    expect(pill("ERP")).toHaveTextContent("Todos los ERP");
  });

  it("DADO los cuatro filtros en su defecto CUANDO se mira el universo ENTONCES entran TODAS las empresas", () => {
    for (const company of COMPANIES) {
      expect(inUniverse(company, UNIVERSE_ALL, [FAVORITE])).toBe(true);
    }
    expect(activeFilters(UNIVERSE_ALL)).toEqual([]);
  });

  it("DADO el filtro de ERP CUANDO se abre ENTONCES «Sin ERP» es una opción de verdad y recupera las que no tienen", async () => {
    const user = userEvent.setup();
    renderHeader();
    await openFilters(user);

    await openPill(user, "ERP");
    // Por volumen: las 2 sin ERP mandan, y el hueco de dato se llama «Sin ERP»
    // en la cara del usuario. Sin esta opcion el 42 % del universo se evapora.
    expect(optionNames()).toEqual(["Todos los ERP", "Sin ERP", "netsuite", "sage200"]);

    await user.click(screen.getByRole("option", { name: "Sin ERP" }));
    expect(names()).toEqual(["Industrias Olmedo y Cia. S.L.", "Alimentaria Zubiri S.A."]);
    expect(pill("ERP")).toHaveTextContent("Sin ERP");
  });

  it("DADO país e industria CUANDO se eligen los dos ENTONCES se aplican en AND y el contador lo dice", async () => {
    const user = userEvent.setup();
    renderHeader();
    await openFilters(user);

    // Las opciones salen del propio corte, por volumen: ni una inventada.
    await openPill(user, "País");
    expect(optionNames()).toEqual(["Todos los países", "España", "Portugal"]);
    await user.click(screen.getByRole("option", { name: "España" }));
    expect(names()).toEqual([
      "Comercial Navarro y Cia. S.L.",
      "Alimentaria Zubiri S.A.",
      "Talleres Iranzo y Cia. S.L.",
    ]);

    await openPill(user, "Industria");
    expect(optionNames()).toEqual([
      "Todas las industrias",
      "Hostelería y ocio",
      "Comercio minorista",
      "Industria y manufactura",
    ]);
    await user.click(screen.getByRole("option", { name: "Hostelería y ocio" }));

    // AND: España Y hosteleria, no España O hosteleria.
    expect(names()).toEqual(["Alimentaria Zubiri S.A."]);
    expect(filtersButton()).toHaveTextContent("Filtros · 2");
  });

  it("DADO Mi cartera y Favoritos CUANDO se eligen ENTONCES filtran contra la watchlist y se cruzan con los de dimensión", async () => {
    const user = userEvent.setup();
    renderHeader();

    await choose(user, "Cartera", "Mi cartera");
    expect(names()).toEqual(["Comercial Navarro y Cia. S.L."]);

    await choose(user, "Cartera", "Favoritos");
    expect(names()).toEqual(["Industrias Olmedo y Cia. S.L."]);

    // Favorito Y España: la favorita esta en Portugal, asi que no queda nada.
    await openFilters(user);
    await choose(user, "País", "España");
    expect(names()).toEqual([]);
  });

  it("DADO varios filtros puestos CUANDO se quitan desde el cajón ENTONCES vuelve el universo entero", async () => {
    const user = userEvent.setup();
    renderHeader();
    await openFilters(user);
    await choose(user, "País", "Portugal");
    await choose(user, "ERP", "Sin ERP");

    expect(names()).toEqual(["Industrias Olmedo y Cia. S.L."]);
    expect(filtersButton()).toHaveTextContent("Filtros · 2");

    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Quitar los filtros" }),
    );

    expect(names()).toHaveLength(COMPANIES.length);
    expect(filtersButton()).toHaveTextContent("Filtros");
    expect(filtersButton()).not.toHaveTextContent("·");
  });

  it("DADO un universo cruzado CUANDO se pregunta qué filtros están puestos ENTONCES se nombran uno a uno y se quitan uno a uno", () => {
    const universe: UniverseValue = {
      list: "favorites",
      country: "Perú",
      industry: "hostelería y ocio",
      erp: NO_ERP,
    };

    expect(activeFilters(universe)).toEqual([
      { key: "list", name: "Cartera", value: "Favoritos" },
      { key: "country", name: "País", value: "Perú" },
      { key: "industry", name: "Industria", value: "Hostelería y ocio" },
      { key: "erp", name: "ERP", value: "Sin ERP" },
    ]);

    // Quitar uno deja los otros tres en pie: el estado vacio ofrece justo esto.
    expect(withoutFilter(universe, "country")).toEqual({
      ...universe,
      country: UNIVERSE_ALL.country,
    });
    expect(activeFilters(withoutFilter(universe, "list"))).toHaveLength(3);
  });

  it("DADO el desplegable de tamaño CUANDO se abre ENTONCES son las cuatro magnitudes que el motor emite, con el euro dicho", async () => {
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
    const user = userEvent.setup();
    render(
      <TreemapHeader
        universe={UNIVERSE_ALL}
        onUniverseChange={() => {}}
        companies={COMPANIES}
        size="pending_eur"
        onSizeChange={() => {}}
        metric="score"
        onMetricChange={() => {}}
        snapshotsOnly
      />,
    );

    await openPill(user, "Color");
    expect(optionNames()).toEqual(["Score"]);
  });

  it("DADO el desplegable de color CUANDO hay historia ENTONCES ofrece Score y los dos Δ, y se navega con el teclado", async () => {
    const user = userEvent.setup();
    renderHeader();

    // Con el teclado: tabular hasta el control, abrirlo y elegir con las flechas.
    await user.tab();
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
    expect(fmtSizeTotal("pending_eur", 406_400_000)).toBe("EUR 406,4 M");
    expect(fmtSizeTotal("op_in_12m_eur", 53_975_000_000)).toBe("EUR 53.975 M");
    expect(fmtSizeTotal("n_invoices", 1284)).toBe("1.284 facturas");
    expect(fmtSizeTotal("n_transactions", 42)).toBe("42 movimientos");
    // Un recuento no lleva nunca un simbolo de moneda inventado.
    expect(fmtSizeTotal("n_invoices", 1284)).not.toContain("EUR");
    // El censo ya dice cuantas empresas hay: no hay total que anadir.
    expect(fmtSizeTotal("n_companies", 173)).toBeNull();
  });
});
