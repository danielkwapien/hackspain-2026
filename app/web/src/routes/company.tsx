import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { cn } from "cn";
import { ActivityChart } from "@/components/activity-chart";
import { EnginePanel } from "@/components/engine-panel";
import { InvoiceChart } from "@/components/invoice-chart";
import { EmptyNote, EmptyState, ErrorState, LoadingPanel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCompany, getManifest } from "@/lib/api";
import type { CurrencyAmount } from "@/lib/api";
import {
  EMPTY_VALUE,
  formatAmount,
  formatCount,
  formatDate,
  formatMonth,
  formatPercent,
  formatSigned,
  relativeChange,
} from "@/lib/format";

const PERIOD_OPTIONS = [
  { months: 6, label: "6 meses" },
  { months: 12, label: "12 meses" },
  { months: 24, label: "24 meses" },
  { months: 0, label: "Todo el histórico" },
] as const;

type PeriodMonths = (typeof PERIOD_OPTIONS)[number]["months"];

function sumByCurrency(
  rows: { currency: string; value: number }[],
): CurrencyAmount[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.value);
  }
  return [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function CompanyPage() {
  const { companyId = "" } = useParams();
  const [period, setPeriod] = useState<PeriodMonths>(12);
  const [chartCurrency, setChartCurrency] = useState<string | null>(null);

  const companyQuery = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => getCompany(companyId),
    enabled: companyId !== "",
  });
  const manifestQuery = useQuery({ queryKey: ["manifest"], queryFn: getManifest });

  const data = companyQuery.data;
  const activity = useMemo(() => data?.detail.monthly_activity ?? [], [data]);
  const invoiceRows = useMemo(() => data?.detail.monthly_invoices.items ?? [], [data]);

  // El eje temporal y las monedas salen de la unión de actividad bancaria y facturas: un mes con
  // facturas y sin movimiento, o una moneda que solo aparece en facturas, siguen dentro del periodo.
  const months = useMemo(
    () =>
      [
        ...new Set([
          ...activity.map((row) => row.month),
          ...invoiceRows.map((row) => row.month),
        ]),
      ].sort(),
    [activity, invoiceRows],
  );
  const currencies = useMemo(
    () =>
      [
        ...new Set([
          ...activity.map((row) => row.currency),
          ...invoiceRows.map((row) => row.currency),
        ]),
      ].sort(),
    [activity, invoiceRows],
  );

  const activeCurrency =
    chartCurrency !== null && currencies.includes(chartCurrency)
      ? chartCurrency
      : (currencies[0] ?? null);

  const periodWindow = useMemo(() => {
    const size = period === 0 ? months.length : Math.min(period, months.length);
    const current = months.slice(months.length - size);
    const previous = period === 0 ? [] : months.slice(Math.max(0, months.length - size * 2), months.length - size);
    return { current, previous };
  }, [months, period]);

  const currentSet = new Set(periodWindow.current);
  const previousSet = new Set(periodWindow.previous);

  const activityInWindow = activity.filter((row) => currentSet.has(row.month));
  const invoiceInWindow = invoiceRows.filter((row) => currentSet.has(row.month));

  const chartRows = activityInWindow.filter((row) => row.currency === activeCurrency);
  const chartInvoiceRows = invoiceInWindow.filter((row) => row.currency === activeCurrency);

  const previousComparable =
    periodWindow.previous.length > 0 &&
    periodWindow.previous.length === periodWindow.current.length;

  const netReading = currencies.map((currency) => {
    const current = activity
      .filter((row) => row.currency === currency && currentSet.has(row.month))
      .reduce((total, row) => total + row.net, 0);
    const previousRows = activity.filter(
      (row) => row.currency === currency && previousSet.has(row.month),
    );
    const previous =
      periodWindow.previous.length === 0
        ? null
        : previousRows.reduce((total, row) => total + row.net, 0);
    return {
      currency,
      current,
      previous,
      // Solo hay variación si las dos ventanas tienen el mismo número de meses.
      change: previousComparable && previous !== null ? relativeChange(current, previous) : null,
    };
  });

  const pendingInvoices = sumByCurrency(
    invoiceInWindow.map((row) => ({
      currency: row.currency,
      value: row.pending_amount_sum ?? 0,
    })),
  );

  const partialMonths = periodWindow.current.filter((month) =>
    activity.some((row) => row.month === month && row.partial),
  );
  const balanceByProduct = new Map((data?.detail.balances ?? []).map((row) => [row.product_id, row]));
  const upcomingPayments = [...(data?.detail.schedule.items ?? [])]
    .filter((item) => item.next_payment_date !== null)
    .sort((a, b) => String(a.next_payment_date).localeCompare(String(b.next_payment_date)));

  if (companyId === "") {
    return <EmptyState title="Sociedad no indicada" description="Falta el identificador en la ruta." />;
  }

  if (companyQuery.isError) {
    return (
      <ErrorState
        error={companyQuery.error}
        context={`la sociedad ${companyId}`}
        onRetry={() => companyQuery.refetch()}
      />
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <LoadingPanel lines={3} />
        <LoadingPanel lines={8} />
      </div>
    );
  }

  const detail = data.detail;

  const identification = detail.identification;
  const coverage = detail.coverage;
  const banking = detail.products.banking;
  const debt = detail.products.debt;
  const qualityNotes = manifestQuery.data?.quality_notes ?? [];
  const cutoffDate = manifestQuery.data?.cutoff_date ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="num text-base">{identification.company_id}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Identificación de la sociedad en el dataset y pertenencia a grupo.
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-5">
            <div>
              <dt className="text-muted-foreground">Grupo</dt>
              <dd>
                <Link
                  to={`/?group=${encodeURIComponent(identification.group_id)}`}
                  className="num text-primary hover:underline"
                >
                  {identification.group_id}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">País</dt>
              <dd>{identification.country ?? EMPTY_VALUE}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Moneda</dt>
              <dd className="num">{identification.currency}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ERP</dt>
              <dd>{identification.erp ?? EMPTY_VALUE}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Alta</dt>
              <dd className="num">{formatDate(identification.created_at)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <EnginePanel engine={data.engine} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Periodo</span>
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.label}
            type="button"
            size="sm"
            variant={period === option.months ? "default" : "outline"}
            aria-pressed={period === option.months}
            onClick={() => setPeriod(option.months)}
          >
            {option.label}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">
          {periodWindow.current.length > 0
            ? `${formatMonth(periodWindow.current[0])} a ${formatMonth(periodWindow.current[periodWindow.current.length - 1])}`
            : "Sin meses en el periodo"}
        </span>
      </div>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm">Actividad mensual observada</CardTitle>
          <p className="text-xs text-muted-foreground">
            Entradas, salidas y neto por mes de los movimientos contabilizados. Cada moneda se
            muestra por separado, sin conversión.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {currencies.length === 0 ? (
            <EmptyState
              title="Sin actividad mensual para esta sociedad"
              description="El inventario no registra movimientos de esta sociedad en el periodo del dataset."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {currencies.map((currency) => (
                  <Button
                    key={currency}
                    type="button"
                    size="xs"
                    variant={currency === activeCurrency ? "default" : "outline"}
                    aria-pressed={currency === activeCurrency}
                    onClick={() => setChartCurrency(currency)}
                  >
                    {currency}
                  </Button>
                ))}
              </div>
              {chartRows.length === 0 ? (
                <EmptyNote>
                  {`Sin actividad en ${activeCurrency ?? ""} dentro del periodo seleccionado.`}
                </EmptyNote>
              ) : (
                <ActivityChart rows={chartRows} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm">Lectura del periodo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Importes observados del dataset. No es el score ni una señal del motor.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {netReading.length === 0 ? (
            <EmptyNote>Sin datos suficientes para calcular el neto del periodo.</EmptyNote>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Moneda</TableHead>
                    <TableHead className="text-right">Neto acumulado del periodo</TableHead>
                    <TableHead className="text-right">Periodo anterior equivalente</TableHead>
                    <TableHead className="text-right">Variación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {netReading.map((row) => (
                    <TableRow key={row.currency}>
                      <TableCell className="num">{row.currency}</TableCell>
                      <TableCell className="num text-right">{formatSigned(row.current)}</TableCell>
                      <TableCell className="num text-right">
                        {row.previous === null ? EMPTY_VALUE : formatSigned(row.previous)}
                      </TableCell>
                      <TableCell className="num text-right">
                        {formatPercent(row.change)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {periodWindow.previous.length === 0 ? (
            <EmptyNote>
              Sin periodo anterior equivalente: el periodo seleccionado cubre todo el histórico
              disponible.
            </EmptyNote>
          ) : previousComparable ? (
            <EmptyNote>
              {`El periodo anterior equivalente abarca ${formatMonth(periodWindow.previous[0])} a ${formatMonth(periodWindow.previous[periodWindow.previous.length - 1])}.`}
            </EmptyNote>
          ) : (
            <EmptyNote>
              {`El histórico anterior solo cubre ${formatCount(periodWindow.previous.length)} de los ${formatCount(periodWindow.current.length)} meses del periodo, así que no se calcula variación: las dos ventanas no serían comparables.`}
            </EmptyNote>
          )}
          {partialMonths.length > 0 ? (
            <EmptyNote>
              {`El periodo incluye el mes parcial ${partialMonths.map((month) => formatMonth(month)).join(", ")}, con menos días de datos que el resto: la comparación con el periodo anterior no está ajustada por días.`}
            </EmptyNote>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm">Facturas</CardTitle>
          <p className="text-xs text-muted-foreground">
            Recuento mensual por estado y pendiente acumulado del periodo. Series sin separación
            emitida/recibida verificada.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.monthly_invoices.direction_note ? (
            <EmptyNote>{detail.monthly_invoices.direction_note}</EmptyNote>
          ) : null}
          {invoiceRows.length === 0 ? (
            <EmptyState
              title="Sin facturas registradas"
              description="El inventario no registra facturas de esta sociedad en el periodo del dataset."
            />
          ) : chartInvoiceRows.length === 0 ? (
            <EmptyNote>
              {`Sin facturas en ${activeCurrency ?? ""} dentro del periodo seleccionado.`}
            </EmptyNote>
          ) : (
            <InvoiceChart rows={chartInvoiceRows} />
          )}
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              Pendiente acumulado del periodo por moneda
            </p>
            {pendingInvoices.length === 0 ? (
              <EmptyNote>Sin importe pendiente registrado en el periodo seleccionado.</EmptyNote>
            ) : (
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                {pendingInvoices.map((row) => (
                  <div key={row.currency} className="flex items-baseline gap-2">
                    <dt className="num text-muted-foreground">{row.currency}</dt>
                    <dd className="num">{formatAmount(row.total)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <EmptyNote>
              La suma agrupa importes pendientes de facturas sin distinción de dirección
              documental. No se consolida entre monedas.
            </EmptyNote>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm">Caja y productos bancarios</CardTitle>
          <p className="text-xs text-muted-foreground">
            Saldos observados con su fecha efectiva. No se consolidan monedas distintas.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
            <div>
              <p className="text-muted-foreground">Caja observada por moneda</p>
              {coverage.snapshot.balance_total_by_currency.length === 0 ? (
                <p className="num text-muted-foreground">{EMPTY_VALUE}</p>
              ) : (
                <dl className="space-y-0.5">
                  {coverage.snapshot.balance_total_by_currency.map((amount) => (
                    <div key={amount.currency} className="flex items-baseline gap-2">
                      <dt className="num text-muted-foreground">{amount.currency}</dt>
                      <dd className="num">{formatAmount(amount.total)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Fecha efectiva</p>
              <p className="num">
                {coverage.snapshot.dates.length > 0
                  ? coverage.snapshot.dates.map((date) => formatDate(date)).join(", ")
                  : EMPTY_VALUE}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Productos con saldo</p>
              <p className="num">
                {`${formatCount(coverage.snapshot.n_products_with_balance)} de ${formatCount(coverage.counts.banking_products)}`}
              </p>
            </div>
          </div>

          {banking.length === 0 ? (
            <EmptyNote>Sin productos bancarios registrados para esta sociedad.</EmptyNote>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Moneda</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Fecha efectiva</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banking.map((product) => {
                    const balance = balanceByProduct.get(product.product_id);
                    return (
                      <TableRow key={product.product_id}>
                        <TableCell>{product.type}</TableCell>
                        <TableCell className="num text-muted-foreground">
                          {product.label || product.product_id}
                        </TableCell>
                        <TableCell>{product.bank_name || EMPTY_VALUE}</TableCell>
                        <TableCell className="num">{product.currency}</TableCell>
                        <TableCell className="num text-right">
                          {formatAmount(balance?.balance)}
                        </TableCell>
                        <TableCell className="num">
                          {formatDate(product.balance_date ?? balance?.date)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm">Deuda</CardTitle>
          <p className="text-xs text-muted-foreground">
            Importes tal como vienen en el dataset: valores actuales de la extracción (no series) y
            con signo negativo en los campos de deuda. No se normalizan signos.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {debt.length === 0 ? (
            <EmptyNote>Sin productos de deuda registrados para esta sociedad.</EmptyNote>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Moneda</TableHead>
                    <TableHead className="text-right">Granted</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Liquidity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debt.map((product) => (
                    <TableRow key={product.product_id}>
                      <TableCell>{product.type}</TableCell>
                      <TableCell className="num text-muted-foreground">
                        {product.label || product.product_id}
                      </TableCell>
                      <TableCell>{product.bank_name || EMPTY_VALUE}</TableCell>
                      <TableCell className="num">{product.currency}</TableCell>
                      <TableCell className="num text-right">{formatAmount(product.granted)}</TableCell>
                      <TableCell className="num text-right">
                        {formatAmount(product.outstanding)}
                      </TableCell>
                      <TableCell className="num text-right">
                        {formatAmount(product.liquidity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground">
              Cobertura del cuadro de amortización
            </p>
            <p className="num">
              {`${formatCount(detail.schedule.n_with_schedule)} de ${formatCount(detail.schedule.n_debt_products)} productos con cuadro`}
            </p>
          </div>

          {upcomingPayments.length === 0 ? (
            <EmptyNote>
              Sin vencimientos publicados: ningún producto de deuda de esta sociedad tiene cuadro de
              amortización en el dataset.
            </EmptyNote>
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                Vencimientos publicados en el cuadro
              </p>
              <EmptyNote>
                Fechas tal como vienen en el cuadro de amortización del dataset; se marcan las
                anteriores a la fecha de corte.
              </EmptyNote>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Moneda</TableHead>
                    <TableHead>Próximo vencimiento</TableHead>
                    <TableHead>Último vencimiento</TableHead>
                    <TableHead>Frecuencia</TableHead>
                    <TableHead className="text-right">Interés</TableHead>
                    <TableHead className="text-right">Saldo del cuadro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingPayments.map((item) => (
                    <TableRow key={item.product_id}>
                      <TableCell className="num text-muted-foreground">{item.product_id}</TableCell>
                      <TableCell className="num">{item.currency}</TableCell>
                      <TableCell className="num">
                        {formatDate(item.next_payment_date)}
                        {cutoffDate !== null && item.next_payment_date !== null && item.next_payment_date < cutoffDate ? (
                          <span className="text-xs text-muted-foreground">
                            {" anterior al corte"}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="num">{formatDate(item.last_payment_date)}</TableCell>
                      <TableCell>{item.amortising_frequency || EMPTY_VALUE}</TableCell>
                      <TableCell className="num text-right">
                        {item.annual_interest_rate_or_spread === null
                          ? EMPTY_VALUE
                          : `${item.annual_interest_rate_or_spread} (${item.interest_type || "sin tipo"})`}
                      </TableCell>
                      <TableCell className="num text-right">
                        {formatAmount(item.outstanding_balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-sm">Cobertura y calidad</CardTitle>
          <p className="text-xs text-muted-foreground">
            Alcance de los datos disponibles para esta sociedad y notas de calidad del inventario.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Meses con actividad</dt>
              <dd className="num">
                {`${formatCount(coverage.months_with_activity)} de ${formatCount(coverage.periods_total)}`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Primera actividad</dt>
              <dd className="num">{formatDate(coverage.first_activity)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Última actividad</dt>
              <dd className="num">{formatDate(coverage.last_activity)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Snapshots</dt>
              <dd className="num">
                {coverage.snapshot.dates.length > 0
                  ? coverage.snapshot.dates.map((date) => formatDate(date)).join(", ")
                  : EMPTY_VALUE}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Productos bancarios</dt>
              <dd className="num">{formatCount(coverage.counts.banking_products)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Productos de deuda</dt>
              <dd className="num">{formatCount(coverage.counts.debt_products)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Facturas</dt>
              <dd className="num">{formatCount(coverage.counts.invoices)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Movimientos</dt>
              <dd className="num">
                {`${formatCount(coverage.counts.transactions)} (${formatCount(coverage.counts.transactions_pending)} pendientes)`}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">Monedas con movimientos</dt>
              <dd className="num">
                {coverage.currencies.length > 0
                  ? coverage.currencies
                      .map((currency) => `${currency.code} (${formatCount(currency.n_tx)})`)
                      .join(", ")
                  : EMPTY_VALUE}
              </dd>
            </div>
          </dl>

          {qualityNotes.length === 0 ? (
            <EmptyNote>Sin notas de calidad publicadas en el manifest del dataset.</EmptyNote>
          ) : (
            <details className="rounded-md border border-border px-3 py-2">
              <summary className={cn("cursor-pointer text-xs font-medium")}>
                {`Notas de calidad del dataset (${qualityNotes.length})`}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {qualityNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
