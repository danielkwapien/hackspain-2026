import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { alertsFixture, companyFixture, groupFixture } from "@/test/fixtures/v2";
import { groupKey } from "@/lib/query-keys";
import { KeyStats } from "./KeyStats";

function renderStats(company: typeof companyFixture) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(groupKey(company.company.group_id), groupFixture);
  return render(
    <QueryClientProvider client={client}>
      <KeyStats company={company} />
    </QueryClientProvider>,
  );
}

/** El `dd` de una estadística a partir del texto de su término. */
function valueOf(label: string): HTMLElement {
  const cell = screen.getByText(label).closest("div");
  const value = cell?.querySelector("dd");
  if (!value) throw new Error(`La estadística «${label}» no tiene valor`);
  return value as HTMLElement;
}

describe("KeyStats", () => {
  it("keeps snapshot gaps visible instead of crashing or inventing zeroes", () => {
    const company = {
      ...companyFixture,
      branch: null,
      score: null,
      band: null,
      regime: null,
      confidence: null,
      outlook: null,
      penalty: null,
      base: null,
      company: { ...companyFixture.company, cash_quality: null, op_in_12m: null },
    };
    renderStats(company);

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("Rama de cobertura").parentElement?.parentElement).toHaveTextContent("—");
    expect(screen.getByText("Penalización").parentElement?.parentElement).toHaveTextContent("—");
    expect(screen.queryByText("0,0")).toBeNull();
  });

  it("DADO la confianza CUANDO se pinta ENTONCES lleva el mismo baremo de color que la cabecera de la ficha", () => {
    // XR-037 (E7.c): las dos pantallas enseñan la misma cifra; un solo helper decide.
    const { unmount } = renderStats({ ...companyFixture, confidence: 1 });
    expect(valueOf("Confianza")).toHaveClass("text-content-positive");
    unmount();

    renderStats({ ...companyFixture, confidence: 0.488 });
    expect(valueOf("Confianza")).toHaveClass("text-content-alert");
  });

  it("DADO una severidad que el diccionario no conoce CUANDO se pinta «Última alerta» ENTONCES no escribe «undefined»", () => {
    // Regresion de XR-035: con `critical` el indice ciego dejaba «undefined · sep 2026».
    const company = {
      ...companyFixture,
      alert: {
        ...alertsFixture.items[0],
        severity: "critical" as unknown as (typeof alertsFixture.items)[0]["severity"],
        month_detected: "2026-08",
      },
    };

    renderStats(company);

    const valor = screen.getByText("Última alerta").parentElement?.parentElement;
    expect(valor).toHaveTextContent("Vigilar · 08/2026");
    expect(document.body.textContent).not.toContain("undefined");
  });
});
