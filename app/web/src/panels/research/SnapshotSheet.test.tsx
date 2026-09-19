import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { companyFixture } from "@/test/fixtures/v2/company";
import { SnapshotSheet } from "./SnapshotSheet";

describe("SnapshotSheet", () => {
  it("shows missing score without assigning a zero or forecasting", () => {
    const company = { ...companyFixture, score: null, band: null, snapshot: null };
    render(<SnapshotSheet company={company} />);
    expect(screen.getByText("Sin score")).toBeInTheDocument();
    expect(screen.getByText(/No hay una evaluación publicada/)).toBeInTheDocument();
    expect(screen.queryByText("0,0 / 100")).not.toBeInTheDocument();
  });

  it("distinguishes actual zero factor from missing coverage", () => {
    const company = { ...companyFixture, snapshot: {
      status: "partial", score: 0, band: null, cutoff_date: "2026-09-01",
      model_version: "static-baseline-v1", data_version: "embat-v2",
      quality: { coverage_ratio: 0.3, reasons: [], warnings: [], excluded_currency_rows: 0, invalid_date_rows: 0 },
      factors: {
        arrears: { score: 0, weight: 0.3, effective_weight: 1, metrics: { combined_arrears_ratio: 1 }, reason: null },
        liquidity: { score: null, weight: 0.3, effective_weight: null, metrics: { cash_balance: null }, reason: "no_cash" },
      },
      drivers: [],
    } };
    render(<SnapshotSheet company={company} />);
    expect(screen.getByText(/Mora de facturas · 0/)).toBeInTheDocument();
    expect(screen.getByText(/Liquidez frente a deuda · Sin cobertura/)).toBeInTheDocument();
    expect(screen.getByText(/no una probabilidad de acierto/)).toBeInTheDocument();
  });
});
