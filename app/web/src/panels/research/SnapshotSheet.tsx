import type { CompanyV2, SnapshotFactor } from "@/lib/api-v2";
import { fmtPoints, fmtConfidence } from "@/charts";
import { formatDate } from "@/lib/format";
import { BAND_LABEL } from "@/lib/regime";

import { FACTOR_LABEL } from "./snapshot-labels";

const STATUS_LABEL: Record<string, string> = { partial: "Evaluación parcial", insufficient_data: "Cobertura insuficiente", available: "Evaluación disponible" };
const REASON_LABEL: Record<string, string> = { no_revolving_facilities: "Sin líneas de financiación revolving", no_invoice_data: "Sin datos de facturas", no_valid_paid_supplier_invoices: "Sin facturas pagadas a proveedores con datos válidos", no_position_data: "Sin datos de posición de caja o deuda" };
function reasonLabel(reason: string): string {
  const [factor, code] = reason.split(": ");
  return code ? (FACTOR_LABEL[factor] ?? factor) + ": " + (REASON_LABEL[code] ?? code) : REASON_LABEL[reason] ?? reason;
}
const METRIC_LABEL: Record<string, string> = {
  cash_balance: "Saldo de caja", debt_outstanding: "Deuda pendiente",
  liquidity_ratio: "Ratio de liquidez", revolving_granted: "Crédito concedido",
  revolving_outstanding: "Crédito dispuesto", utilisation_ratio: "Ratio de utilización",
  supplier_open_amount: "Pendiente a proveedores", supplier_overdue_amount: "Vencido a proveedores",
  supplier_arrears_ratio: "Mora a proveedores", customer_open_amount: "Pendiente de clientes",
  customer_overdue_amount: "Vencido de clientes", customer_arrears_ratio: "Mora de clientes",
  combined_arrears_ratio: "Mora combinada", supplier_paid_amount: "Pagado a proveedores",
  supplier_paid_late_amount: "Pagado fuera de plazo", late_payment_rate: "Pagos tardíos",
  median_payment_days: "Mediana de días de pago", median_days_late: "Mediana de días de retraso",
};
const number = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
function metricValue(key: string, value: number | null, currency: string): string {
  if (value === null) return "No disponible";
  if (key.endsWith("ratio") || key.endsWith("rate")) return fmtConfidence(value);
  if (key.includes("days")) return number.format(value) + " días";
  return number.format(value) + " " + currency;
}
function Factor({ name, factor, currency }: { name: string; factor: SnapshotFactor; currency: string }) {
  return <details className="border-t border-border-glass py-2">
    <summary className="cursor-pointer text-[length:var(--text-control)] text-content-primary">
      {FACTOR_LABEL[name] ?? name} · {factor.score === null ? "Sin cobertura" : fmtPoints(factor.score) + " / 100"}
    </summary>
    <p className="mt-2 text-[length:var(--text-micro)] text-content-secondary">Peso original {fmtConfidence(factor.weight)} · peso efectivo {factor.effective_weight === null ? "No aplica" : fmtConfidence(factor.effective_weight)}</p>
    <dl className="mt-2 space-y-1 text-[length:var(--text-control)]">
      {Object.entries(factor.metrics).map(([key, value]) => <div key={key} className="flex justify-between gap-3"><dt className="text-content-secondary">{METRIC_LABEL[key] ?? key}</dt><dd className="num text-right">{metricValue(key, value, currency)}</dd></div>)}
    </dl>
    {factor.reason ? <p className="mt-2 text-[length:var(--text-micro)] text-content-secondary">Motivo del modelo: {reasonLabel(factor.reason)}</p> : null}
  </details>;
}
export function SnapshotSheet({ company }: { company: CompanyV2 }) {
  const snapshot = company.snapshot;
  return <div data-company={company.company.company_id} className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto text-content-primary">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-[length:var(--text-panel-title)] font-semibold">{company.company.name}</h3><p className="mt-1 text-[length:var(--text-micro)] text-content-secondary">Evaluación al {formatDate(snapshot?.cutoff_date ?? company.as_of)}</p></div>
      <div className="text-right"><p className="num text-[length:var(--text-figure)] font-semibold">{company.score === null ? "Sin score" : fmtPoints(company.score) + " / 100"}</p><p className="text-[length:var(--text-control)]">{company.band === null ? "Cobertura insuficiente" : BAND_LABEL[company.band]}</p></div>
    </header>
    {snapshot ? <>
      <div className="text-[length:var(--text-control)]">Cobertura de factores {fmtConfidence(snapshot.quality.coverage_ratio)} · {STATUS_LABEL[snapshot.status] ?? snapshot.status}</div>
      <p className="text-[length:var(--text-micro)] text-content-secondary">La cobertura mide los factores disponibles, no una probabilidad de acierto. Este modelo ofrece una evaluación puntual, sin tendencia ni previsión.</p>
      <section aria-label="Factores del score">{Object.entries(snapshot.factors).map(([name, factor]) => <Factor key={name} name={name} factor={factor} currency={company.company.currency} />)}</section>
      {snapshot.drivers.length > 0 ? <section className="border-t border-border-glass pt-2" aria-label="Lectura de factores"><h4 className="text-[length:var(--text-control)] font-semibold">Lectura de factores</h4><ul className="mt-2 space-y-2 text-[length:var(--text-control)]">{snapshot.drivers.map(driver => <li key={driver.factor}>{driver.message}</li>)}</ul></section> : null}
      {snapshot.quality.warnings.length + snapshot.quality.reasons.length > 0 ? <section className="border-t border-border-glass pt-2" aria-label="Calidad y exclusiones"><h4 className="text-[length:var(--text-control)] font-semibold">Calidad y exclusiones</h4><ul className="mt-2 space-y-1 text-[length:var(--text-micro)] text-content-secondary">{[...snapshot.quality.warnings, ...snapshot.quality.reasons].map((note, index) => <li key={index}>{reasonLabel(note)}</li>)}</ul><p className="mt-2 text-[length:var(--text-micro)] text-content-secondary">Filas con fechas no válidas: {snapshot.quality.invalid_date_rows} · filas excluidas por moneda: {snapshot.quality.excluded_currency_rows}</p></section> : null}
      <footer className="border-t border-border-glass pt-2 text-[length:var(--text-micro)] text-content-secondary">{snapshot.model_version} · {snapshot.data_version} · MotherDuck</footer>
    </> : <p className="text-[length:var(--text-control)] text-content-secondary">Esta empresa forma parte del dataset. No hay una evaluación publicada para este corte.</p>}
  </div>;
}
