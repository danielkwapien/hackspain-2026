/**
 * Widget «Operar» (W4.3): ofrecer o reclamar deuda sobre una sociedad.
 *
 * La estructura es la del widget de operativa de Trade Republic (W4.2): una
 * lista de filas etiqueta-izquierda / valor-derecha donde unas filas son
 * entradas y otras son resultados calculados, con el botón al fondo separado del
 * resto. Los colores son los de la casa, no los suyos.
 *
 * Arranca con la sociedad del store global (`useSelection`), la misma que la
 * ficha, y el `CompanyPicker` la cambia solo aquí: el widget no reescribe la
 * selección de los demás. La aritmética vive en `trade-math.ts` y es cuota
 * francesa; el descargo dice que es una simulación.
 */

import { useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { fmtPoints, fmtSize } from "@/charts";
import { CompanyPicker } from "@/components/CompanyPicker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import type { SegmentedOption } from "@/components/ui/segmented";
import { useSelection } from "@/dashboard/selection";
import type { PickerValue } from "@/components/CompanyPicker";
import { getCompanyV2, getEntityProfile } from "@/lib/api-v2";
import { companyKey, entityProfileKey } from "@/lib/query-keys";
import type { WidgetContentProps } from "@/widgets/registry";
import { ConfirmDialog } from "@/widgets/trade/ConfirmDialog";
import { SendFeedback } from "@/widgets/trade/SendFeedback";
import type { Term, TradeSide } from "@/widgets/trade/trade-math";
import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  RATE_MAX,
  RATE_MIN,
  TERMS,
  clamp,
  fmtAmountInput,
  fmtRateInput,
  frenchLoan,
  parseEsNumber,
} from "@/widgets/trade/trade-math";

const CURRENCY = "EUR";

/** Los valores con los que abre el widget: una operación plausible, no ceros. */
const DEFAULT_AMOUNT = 150_000;
const DEFAULT_RATE = 6.5;
const DEFAULT_TERM: Term = 24;

const SIDE_OPTIONS: readonly SegmentedOption<TradeSide>[] = [
  { value: "offer", label: "Ofrecer" },
  { value: "claim", label: "Reclamar" },
];

/** Con `Reclamar` cambia el vocabulario de las tres cifras, no la aritmética. */
const FIGURE_LABELS: Record<TradeSide, { interest: string; total: string; monthly: string }> = {
  offer: { interest: "Intereses", total: "Total a devolver", monthly: "Cuota mensual" },
  claim: {
    interest: "Intereses a percibir",
    total: "Total a recibir",
    monthly: "Cobro mensual",
  },
};

const NOTICE: Record<TradeSide, string> = {
  offer: "Oferta de deuda enviada a",
  claim: "Reclamación de deuda enviada a",
};

const DISCLAIMER =
  "Simulación interna a cuota francesa constante. No constituye una oferta vinculante ni asesoramiento financiero.";

const ROW_CLASS = "flex items-center justify-between gap-2 h-[var(--size-row)]";

/** `servicios profesionales` → `Servicios profesionales`. El mismo gesto que la
 *  ficha; el suyo es privado de `EntityIdentity` y este widget no la importa. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const LABEL_CLASS = "shrink-0 text-[length:var(--text-body)] text-content-secondary";

const FIELD_CLASS =
  "h-[var(--size-segment-sm)] w-24 rounded-[var(--radius-control)] bg-surface-glass px-2 text-right num text-[length:var(--text-body)] text-content-primary shadow-[inset_0_0_0_1px_var(--border-glass)] outline-none focus-visible:ring-2 focus-visible:ring-ring";

const UNIT_CLASS = "w-8 shrink-0 text-[length:var(--text-micro)] text-content-secondary";

const TRIGGER_CLASS =
  "h-[var(--size-segment-sm)] border-0 bg-surface-glass text-[length:var(--text-body)] text-content-primary shadow-[inset_0_0_0_1px_var(--border-glass)]";

function Row({ label, children }: { label: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className={ROW_CLASS}>
      {label}
      {children}
    </div>
  );
}

/** Fila calculada: la cifra no se teclea, sale de `frenchLoan`. */
function Figure({
  slot,
  label,
  value,
  strong = false,
}: {
  slot: string;
  label: string;
  value: number;
  strong?: boolean;
}): ReactElement {
  return (
    <div className={ROW_CLASS}>
      <dt className={LABEL_CLASS}>{label}</dt>
      <dd
        data-slot={slot}
        className={cn(
          "num text-right font-semibold text-content-primary",
          strong
            ? "text-[length:var(--text-figure)]"
            : "text-[length:var(--text-body)]",
        )}
      >
        {fmtSize(value, CURRENCY)}
      </dd>
    </div>
  );
}

export function TradeWidget(_props: WidgetContentProps): ReactElement {
  const fieldId = useId();
  const selected = useSelection((state) => state.selected);
  const [picked, setPicked] = useState<PickerValue | null>(null);
  const [side, setSide] = useState<TradeSide>("offer");
  const [amountText, setAmountText] = useState(fmtAmountInput(DEFAULT_AMOUNT));
  const [rateText, setRateText] = useState(fmtRateInput(DEFAULT_RATE));
  const [term, setTerm] = useState<Term>(DEFAULT_TERM);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const id = picked?.id ?? selected;
  const company = useQuery({
    queryKey: companyKey(id ?? ""),
    queryFn: () => getCompanyV2(id as string),
    enabled: id !== null,
  });
  const profile = useQuery({
    queryKey: entityProfileKey(id ?? ""),
    queryFn: () => getEntityProfile(id as string),
    enabled: id !== null,
  });

  const name = picked?.name ?? company.data?.company.name ?? profile.data?.name ?? null;
  const value: PickerValue | null = id === null || name === null ? null : { id, name };

  const amount = parseEsNumber(amountText) ?? 0;
  const rate = parseEsNumber(rateText) ?? 0;
  const loan = frenchLoan(amount, rate, term);
  const labels = FIGURE_LABELS[side];

  /* El formato es-ES y el recorte al rango llegan al perder el foco: recortar
     mientras se teclea impide escribir «1.500» (el «1» ya sale del rango). */
  function commitAmount(): void {
    setAmountText(fmtAmountInput(clamp(parseEsNumber(amountText) ?? AMOUNT_MIN, AMOUNT_MIN, AMOUNT_MAX)));
  }

  function commitRate(): void {
    setRateText(fmtRateInput(clamp(parseEsNumber(rateText) ?? RATE_MIN, RATE_MIN, RATE_MAX)));
  }

  function send(): void {
    setConfirming(false);
    setNotice(`${NOTICE[side]} ${name ?? ""}`.trim());
  }

  const subtitle = [
    profile.data?.industry === undefined || profile.data.industry === null
      ? null
      : capitalise(profile.data.industry),
    profile.data?.country ?? null,
    company.data === undefined ? null : fmtPoints(company.data.score),
  ].filter((part): part is string => part !== null && part !== "");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-col gap-0.5 rounded-[var(--radius-card)] bg-surface-glass px-2 py-1.5">
        <CompanyPicker
          value={value}
          label="Sociedad"
          placeholder="Elegir sociedad"
          onPick={(item) => setPicked(item === null ? null : { id: item.id, name: item.name })}
          className="w-full"
        />
        <p className="truncate pl-2 text-[length:var(--text-micro)] text-content-secondary">
          {subtitle.length === 0 ? " " : subtitle.join(" · ")}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Row label={<span className={LABEL_CLASS}>Operación</span>}>
          <Segmented value={side} options={SIDE_OPTIONS} onChange={setSide} label="Operación" />
        </Row>

        <Row
          label={
            <label htmlFor={`${fieldId}-amount`} className={LABEL_CLASS}>
              Importe
            </label>
          }
        >
          <span className="flex items-center gap-1">
            <input
              id={`${fieldId}-amount`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className={FIELD_CLASS}
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              onBlur={commitAmount}
            />
            <span className={UNIT_CLASS}>{CURRENCY}</span>
          </span>
        </Row>

        <Row
          label={
            <label htmlFor={`${fieldId}-rate`} className={LABEL_CLASS}>
              Interés anual
            </label>
          }
        >
          <span className="flex items-center gap-1">
            <input
              id={`${fieldId}-rate`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className={FIELD_CLASS}
              value={rateText}
              onChange={(event) => setRateText(event.target.value)}
              onBlur={commitRate}
            />
            <span className={UNIT_CLASS}>%</span>
          </span>
        </Row>

        <Row label={<span className={LABEL_CLASS}>Plazo</span>}>
          <span className="flex items-center gap-1">
            <Select value={String(term)} onValueChange={(next) => setTerm(Number(next) as Term)}>
              <SelectTrigger size="sm" aria-label="Plazo" className={TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERMS.map((months) => (
                  <SelectItem key={months} value={String(months)}>
                    {months} meses
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span aria-hidden="true" className={UNIT_CLASS} />
          </span>
        </Row>

        <dl className="mt-1 flex flex-col border-t border-border-glass pt-1">
          <Figure slot="trade-interest" label={labels.interest} value={loan.interest} />
          <Figure slot="trade-total" label={labels.total} value={loan.total} />
          <Figure slot="trade-monthly" label={labels.monthly} value={loan.monthly} strong />
        </dl>

        <p className="mt-1 text-[length:var(--text-control)] font-semibold text-content-primary">
          Sobre la operación
        </p>
        <p className="text-pretty text-[length:var(--text-micro)] text-content-secondary">
          {DISCLAIMER}
        </p>
      </div>

      <Button
        type="button"
        className="w-full shrink-0 text-[length:var(--text-body)]"
        disabled={value === null}
        onClick={() => setConfirming(true)}
      >
        Operar
      </Button>

      {confirming && value !== null ? (
        <ConfirmDialog
          company={value.name}
          side={side}
          amount={amount}
          rate={rate}
          term={term}
          interest={loan.interest}
          onCancel={() => setConfirming(false)}
          onConfirm={send}
        />
      ) : null}

      {notice === null ? null : (
        <SendFeedback message={notice} onDone={() => setNotice(null)} />
      )}
    </div>
  );
}
