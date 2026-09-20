/**
 * Widget Cartera: las posiciones simuladas de `PORTFOLIO` (constante, no se edita)
 * con una ficha por empresa (`companyKey`, la misma caché que Investigación).
 * Cabecera `dl` de `--size-stat-row` con lo invertido, el score medio ponderado
 * por importe y el recuento en riesgo, calculados sobre lo ya cargado
 * (`portfolio-math`); debajo, una fila de 28 px por posición con importe, score,
 * Δ1m y sparkline. Clic o Enter seleccionan la empresa.
 */

import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { cn } from "cn";
import { Sparkline, fmtDelta, fmtPoints, fmtSizeShort } from "@/charts";
import { select, useSelection } from "@/dashboard/selection";
import { PORTFOLIO } from "@/dashboard/watchlist";
import type { PortfolioPosition } from "@/dashboard/watchlist";
import type { CompanyV2 } from "@/lib/api-v2";
import { getCompanyV2 } from "@/lib/api-v2";
import { companyKey } from "@/lib/query-keys";
import type { WidgetContentProps } from "@/widgets/registry";
import { bandCounts, totalInvested, weightedScore } from "./portfolio-math";

const CURRENCY = "EUR";

/** Alto de fila en px: es `--size-table-row`. */
const ROW_HEIGHT = 28;

/** Los mismos doce meses que `sparkline_12` en `/universe`. */
const SPARKLINE_POINTS = 12;

const ROW_CLASS =
  "flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 transition-colors duration-[var(--duration-fast)] focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none";

const NUM_CLASS = "shrink-0 num text-[length:var(--text-control)]";

const SKELETON_BAR_CLASS =
  "h-3 animate-pulse rounded-[var(--radius-control)] bg-surface-glass motion-reduce:animate-none";

/**
 * Las tres cifras de la cabecera, en la misma escala (XR-038, W5.1): `Score
 * medio` y `En riesgo` salían a 11/12 px, o sea más pequeñas que las filas de la
 * lista que resumen.
 */
function Stat({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-0.5">
      <dt className="text-[length:var(--text-control)] text-content-primary">{label}</dt>
      <dd className="num truncate text-[length:var(--text-figure)] font-semibold text-content-primary">
        {children}
      </dd>
    </div>
  );
}

function RiskDot({ className }: { className: string }): ReactElement {
  return <span aria-hidden="true" className={cn("mr-1 inline-block size-1.5 rounded-full align-middle", className)} />;
}

/**
 * Los dos recuentos en riesgo, en corto. Medido en el tablero (XR-038, W4.1:
 * Cartera baja a w6), el `dl` da 314 px y «1 tensión · 4 vigilancia» a
 * `--text-figure` pide 240: la cifra salía como «1 tens…». A la vista van los
 * dos números con su punto de color —el mismo código de banda que la lista—, y
 * la frase entera se queda en el `title` y para el lector de pantalla, que es
 * como Alertas resuelve lo mismo (W5.2). Abreviar el contenido, no bajar la
 * escala: los tres valores siguen a 20 px, como pide W5.1.
 */
function RiskCount({ stress, watch }: { stress: number; watch: number }): ReactElement {
  const full = `${stress} tensión · ${watch} vigilancia`;
  return (
    <span title={full}>
      <span aria-hidden="true">
        <RiskDot className="bg-content-negative" />
        {stress} · <RiskDot className="bg-content-alert" />
        {watch}
      </span>
      <span className="sr-only">{full}</span>
    </span>
  );
}

function LoadingRow(): ReactElement {
  return (
    <li
      role="option"
      aria-selected={false}
      aria-busy="true"
      className={cn(ROW_CLASS, "cursor-default")}
      style={{ height: ROW_HEIGHT }}
    >
      <span className="sr-only">Cargando posición</span>
      <div className={cn(SKELETON_BAR_CLASS, "min-w-0 flex-1")} />
      <div className={cn(SKELETON_BAR_CLASS, "w-16 shrink-0")} />
      <div className={cn(SKELETON_BAR_CLASS, "w-12 shrink-0")} />
      <div className={cn(SKELETON_BAR_CLASS, "w-16 shrink-0")} />
    </li>
  );
}

function ErrorRow({ id, onRetry }: { id: string; onRetry: () => void }): ReactElement {
  return (
    <li
      role="option"
      aria-selected={false}
      className={cn(ROW_CLASS, "cursor-default")}
      style={{ height: ROW_HEIGHT }}
    >
      <span
        className="min-w-0 flex-1 truncate text-[length:var(--text-control)] text-content-secondary"
        title={id}
      >
        No se pudo cargar
      </span>
      <button
        type="button"
        className="shrink-0 rounded-[var(--radius-control)] px-1 text-[length:var(--text-control)] text-content-accent transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onRetry}
      >
        Reintentar
      </button>
    </li>
  );
}

function Row({
  position,
  company,
  isSelected,
  onSelect,
}: {
  position: PortfolioPosition;
  company: CompanyV2;
  isSelected: boolean;
  onSelect: () => void;
}): ReactElement {
  const delta = fmtDelta(company.delta_1m);
  const sparkline = company.timeline.slice(-SPARKLINE_POINTS).map((point) => point.score);

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  }

  return (
    <li
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      className={cn(
        ROW_CLASS,
        "cursor-pointer [@media(hover:hover)]:hover:bg-surface-glass",
        isSelected && "bg-fills-accent-thin",
      )}
      style={{ height: ROW_HEIGHT }}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <span
        className="min-w-0 flex-1 truncate text-[length:var(--text-body)] text-content-primary"
        title={`${company.company.name} · ${position.id}`}
      >
        {company.company.name}
      </span>
      <span className={cn(NUM_CLASS, "text-content-secondary")}>
        {fmtSizeShort(position.amount, CURRENCY)}
      </span>
      <span className={cn(NUM_CLASS, "text-content-primary")}>{fmtPoints(company.score)}</span>
      <span className={NUM_CLASS} style={{ color: delta.tone }}>
        {delta.text}
      </span>
      {sparkline.length >= 2 ? (
        <Sparkline points={sparkline} regime={company.regime} />
      ) : (
        <span className={cn(NUM_CLASS, "text-content-secondary")}>—</span>
      )}
    </li>
  );
}

export function PortfolioWidget(_props: WidgetContentProps): ReactElement {
  const selected = useSelection((state) => state.selected);
  const queries = useQueries({
    queries: PORTFOLIO.map((position) => ({
      queryKey: companyKey(position.id),
      queryFn: () => getCompanyV2(position.id),
    })),
  });

  const loading = queries.some((query) => query.isPending);
  const loaded = queries.flatMap((query) => (query.data ? [query.data] : []));
  const weighted = weightedScore(
    PORTFOLIO.map((position, index) => ({
      amount: position.amount,
      score: queries[index].data?.score ?? null,
    })),
  );
  const counts = bandCounts(loaded);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Repartidas por su contenido, no en tres tercios: a w6 el tercio da 91 px
          y «EUR 3,6 M» a `--text-figure` pide 99. Con `min-w-0` en cada columna
          siguen truncando si el widget se estrecha aún más. */}
      <dl
        aria-busy={loading}
        className="flex shrink-0 items-center justify-between gap-3 px-2"
        style={{ minHeight: "var(--size-stat-row)" }}
      >
        <Stat label="Invertido">{fmtSizeShort(totalInvested(PORTFOLIO), CURRENCY)}</Stat>
        <Stat label="Score medio">{weighted === null ? "—" : fmtPoints(weighted)}</Stat>
        <Stat label="En riesgo">
          <RiskCount stress={counts.stress} watch={counts.watch} />
        </Stat>
      </dl>

      <ul role="listbox" aria-label="Cartera" className="flex min-h-0 flex-col overflow-y-auto">
        {PORTFOLIO.map((position, index) => {
          const query = queries[index];
          if (query.isPending) return <LoadingRow key={position.id} />;
          if (query.isError) {
            return (
              <ErrorRow key={position.id} id={position.id} onRetry={() => void query.refetch()} />
            );
          }
          return (
            <Row
              key={position.id}
              position={position}
              company={query.data}
              isSelected={selected === position.id}
              onSelect={() => select(position.id)}
            />
          );
        })}
      </ul>
    </div>
  );
}
