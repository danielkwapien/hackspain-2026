import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetSelection, select } from "@/dashboard/selection";
import type { LayoutItem } from "@/dashboard/types";
import type { EntityProfile } from "@/lib/api-v2";
import { companyFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { TradeWidget } from "@/widgets/trade/TradeWidget";

const COMPANY_ID = companyFixture.company.company_id; // COMP_0001
const COMPANY_NAME = companyFixture.company.name;

const PROFILE: EntityProfile = {
  entity_id: COMPANY_ID,
  entity_kind: "company",
  name: COMPANY_NAME,
  country: "España",
  country_method: "real",
  industry: "servicios profesionales",
  industry_method: "real",
  generated_at: "2026-09-19 20:58:12+02",
};

/** Los tres valores por defecto del widget: 150.000 € al 6,5 % a 24 meses. */
const DEFAULT_MONTHLY = "EUR 6.681,94";
const DEFAULT_TOTAL = "EUR 160.366,51";
const DEFAULT_INTEREST = "EUR 10.366,51";

const ITEM: LayoutItem = { i: "inv-trade", type: "trade", x: 18, y: 0, w: 6, h: 13, entity: null };

/**
 * El desplegable del plazo es el `Select` de Radix y jsdom no implementa la API
 * de captura de puntero ni `scrollIntoView`, así que sin estos dobles el menú no
 * llega a abrirse. Es fontanería del entorno, no del widget, y vive aquí para no
 * tocar `test/setup.ts`, que comparten todas las suites.
 */
function polyfillPointerCapture(): void {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
}

function renderWidget() {
  mockApi([
    { match: `/api/v2/entities/${COMPANY_ID}/profile`, body: PROFILE },
    { match: `/api/v2/companies/${COMPANY_ID}`, body: companyFixture },
    { match: "/api/v2/universe", body: universeFixture },
  ]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TradeWidget item={ITEM} />
    </QueryClientProvider>,
  );
}

/** Texto de una de las tres cifras calculadas. */
function figure(slot: "interest" | "total" | "monthly"): string {
  const node = document.querySelector(`[data-slot="trade-${slot}"]`);
  if (!node) throw new Error(`No existe la cifra ${slot}`);
  return node.textContent ?? "";
}

function amountField(): HTMLInputElement {
  return screen.getByLabelText("Importe") as HTMLInputElement;
}

function rateField(): HTMLInputElement {
  return screen.getByLabelText("Interés anual") as HTMLInputElement;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: "Operar" }));
  return screen.getByRole("dialog");
}

describe("widget Operar", () => {
  beforeAll(polyfillPointerCapture);

  beforeEach(() => {
    resetSelection();
    select(COMPANY_ID);
  });

  it("DADO la empresa del store CUANDO se monta ENTONCES arranca con ella, su industria · país · score y las tres cifras de la cuota francesa", async () => {
    renderWidget();

    expect(await screen.findByText(COMPANY_NAME)).toBeInTheDocument();
    const subtitle = await screen.findByText(/Servicios profesionales/);
    expect(subtitle.textContent).toContain("España");
    expect(subtitle.textContent).toContain("74,0");
    expect(subtitle.className).toContain("var(--text-micro)");

    expect(amountField()).toHaveValue("150.000");
    expect(rateField()).toHaveValue("6,5");
    expect(screen.getByRole("combobox", { name: "Plazo" })).toHaveTextContent("24 meses");

    expect(figure("interest")).toBe(DEFAULT_INTEREST);
    expect(figure("total")).toBe(DEFAULT_TOTAL);
    expect(figure("monthly")).toBe(DEFAULT_MONTHLY);
  });

  it("DADO el importe y el interés CUANDO se cambian ENTONCES las tres cifras se recalculan y al perder el foco el importe se escribe en es-ES", async () => {
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(COMPANY_NAME);

    await user.clear(amountField());
    await user.type(amountField(), "300000");
    expect(figure("monthly")).toBe("EUR 13.363,88");
    expect(figure("total")).toBe("EUR 320.733,01");
    expect(figure("interest")).toBe("EUR 20.733,01");

    await user.tab();
    expect(amountField()).toHaveValue("300.000");

    await user.clear(amountField());
    await user.type(amountField(), "150000");
    await user.clear(rateField());
    await user.type(rateField(), "10");
    expect(figure("monthly")).toBe("EUR 6.921,74");
    expect(figure("interest")).toBe("EUR 16.121,73");
  });

  it("DADO un importe fuera de rango CUANDO pierde el foco ENTONCES se recorta a 1.000–10.000.000 €", async () => {
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(COMPANY_NAME);

    await user.clear(amountField());
    await user.type(amountField(), "5");
    await user.tab();
    expect(amountField()).toHaveValue("1.000");

    await user.clear(amountField());
    await user.type(amountField(), "99000000");
    await user.tab();
    expect(amountField()).toHaveValue("10.000.000");
  });

  it("DADO el plazo CUANDO se elige 60 meses ENTONCES las tres cifras lo siguen", async () => {
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(COMPANY_NAME);

    screen.getByRole("combobox", { name: "Plazo" }).focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "60 meses" }));

    expect(screen.getByRole("combobox", { name: "Plazo" })).toHaveTextContent("60 meses");
    expect(figure("monthly")).toBe("EUR 2.934,92");
    expect(figure("total")).toBe("EUR 176.095,33");
    expect(figure("interest")).toBe("EUR 26.095,33");
  });

  it("DADO «Reclamar» ENTONCES cambia el vocabulario de las tres filas y la aritmética es la misma", async () => {
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(COMPANY_NAME);

    expect(screen.getByText("Intereses")).toBeInTheDocument();
    expect(screen.getByText("Total a devolver")).toBeInTheDocument();
    expect(screen.getByText("Cuota mensual")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Reclamar" }));

    expect(screen.getByText("Intereses a percibir")).toBeInTheDocument();
    expect(screen.getByText("Total a recibir")).toBeInTheDocument();
    expect(screen.getByText("Cobro mensual")).toBeInTheDocument();
    expect(figure("monthly")).toBe(DEFAULT_MONTHLY);
  });

  it("DADO «Operar» CUANDO se pulsa ENTONCES el diálogo resume la operación y «Enviar oferta» lleva disabled REAL hasta marcar la casilla", async () => {
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(COMPANY_NAME);

    const dialog = await openDialog(user);
    expect(dialog.textContent).toContain(COMPANY_NAME);
    expect(dialog.textContent).toContain("financiación");
    expect(dialog.textContent).toContain("EUR 150.000,00");
    expect(dialog.textContent).toContain("6,5");
    expect(dialog.textContent).toContain("24 meses");
    expect(dialog.textContent).toContain(DEFAULT_INTEREST);
    expect(dialog.textContent).toContain("no es vinculante");

    const send = within(dialog).getByRole("button", { name: "Enviar oferta" });
    expect(send).toBeDisabled();
    expect(send).toHaveProperty("disabled", true);

    await user.click(within(dialog).getByRole("checkbox"));
    expect(within(dialog).getByRole("button", { name: "Enviar oferta" })).toBeEnabled();
  });

  it("DADO «Reclamar» CUANDO se abre el diálogo ENTONCES habla de reclamación de deuda, no de financiación", async () => {
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(COMPANY_NAME);

    await user.click(screen.getByRole("radio", { name: "Reclamar" }));
    const dialog = await openDialog(user);
    expect(dialog.textContent).toContain("reclamación de deuda");
    expect(dialog.textContent).not.toContain("propuesta de financiación");
  });

  it("DADO la confirmación ENTONCES el diálogo se cierra, vuela el sobre, el aviso es un role=status aria-live=polite y se va solo a los 2,5 s", async () => {
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(COMPANY_NAME);

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Enviar oferta" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    const notice = screen.getByRole("status");
    expect(notice).toHaveAttribute("aria-live", "polite");
    expect(notice.textContent).toBe(`Oferta de deuda enviada a ${COMPANY_NAME}`);
    expect(document.querySelector('[data-slot="trade-envelope"]')).not.toBeNull();

    // Reloj real: el temporizador nace dentro del componente y falsear el reloj
    // antes de montarlo deja colgado a `userEvent`. Son 2,5 s de espera.
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull(), { timeout: 4_000 });
    expect(document.querySelector('[data-slot="trade-envelope"]')).toBeNull();
  }, 10_000);

  it("DADO prefers-reduced-motion ENTONCES el sobre no vuela (ni se pinta) pero el aviso sigue apareciendo", async () => {
    // jsdom no evalúa media queries sobre clases de Tailwind: lo que se puede
    // fijar aquí es el contrato de clases, que es donde vive la regla. El sobre
    // lleva `motion-reduce:hidden` además de `animate-none` porque la animación
    // es `both`: sin ocultarlo se quedaría quieto en medio de la pantalla.
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(COMPANY_NAME);

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Enviar oferta" }));

    // `Mail` pinta un `<svg>`: su `className` es un `SVGAnimatedString`, no una
    // cadena, y hay que leer el atributo.
    const envelope = document.querySelector('[data-slot="trade-envelope"]');
    const envelopeClass = envelope?.getAttribute("class") ?? "";
    expect(envelopeClass).toContain("animate-envelope-fly");
    expect(envelopeClass).toContain("motion-reduce:animate-none");
    expect(envelopeClass).toContain("motion-reduce:hidden");

    const notice = screen.getByRole("status");
    expect(notice.className).toContain("animate-toast-enter");
    expect(notice.className).toContain("motion-reduce:animate-none");
    expect(notice.className).not.toContain("motion-reduce:hidden");
  });
});
