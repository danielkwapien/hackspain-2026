import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { companyFixture, groupFixture } from "@/test/fixtures/v2";
import { groupKey } from "@/lib/query-keys";
import { KeyStats } from "./KeyStats";

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
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(groupKey(company.company.group_id), groupFixture);

    render(
      <QueryClientProvider client={client}>
        <KeyStats company={company} />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("Rama de cobertura").parentElement?.parentElement).toHaveTextContent("—");
    expect(screen.getByText("Penalización").parentElement?.parentElement).toHaveTextContent("—");
    expect(screen.queryByText("0,0")).toBeNull();
  });
});
