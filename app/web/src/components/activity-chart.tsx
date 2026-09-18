import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MonthlyActivity } from "@/lib/api";
import { formatAmount, formatMonth } from "@/lib/format";

const CHART_CONFIG = {
  inflow: { label: "Entradas", color: "var(--positive)" },
  outflow: { label: "Salidas", color: "var(--negative)" },
  net: { label: "Neto", color: "var(--primary)" },
  partial: { label: "Mes parcial", color: "var(--warning)" },
} satisfies ChartConfig;

/**
 * Entradas, salidas y neto por mes para una única moneda. El mes parcial del
 * corte se pinta con el color de aviso y se anota bajo el gráfico.
 */
export function ActivityChart({ rows }: { rows: MonthlyActivity[] }) {
  const data = rows.map((row) => ({
    month: row.month,
    label: formatMonth(row.month),
    inflow: row.inflow,
    outflow: row.outflow,
    net: row.net,
    n_tx: row.n_tx,
    n_tx_pending: row.n_tx_pending,
    partial: row.partial,
  }));
  const partialMonths = rows.filter((row) => row.partial).map((row) => formatMonth(row.month));

  return (
    <div className="space-y-2">
      <ChartContainer config={CHART_CONFIG} className="h-[300px] w-full">
        <ComposedChart data={data} accessibilityLayer margin={{ left: 4, right: 8, top: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={92}
            tickFormatter={(value: number) => formatAmount(value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <span className="num">{formatAmount(Number(value))}</span>
                )}
              />
            }
          />
          <Legend content={<ChartLegendContent />} />
          <Bar dataKey="inflow" fill="var(--color-inflow)" radius={2} isAnimationActive={false}>
            {data.map((row) => (
              <Cell
                key={`inflow-${row.month}`}
                fill={row.partial ? "var(--color-partial)" : "var(--color-inflow)"}
              />
            ))}
          </Bar>
          <Bar dataKey="outflow" fill="var(--color-outflow)" radius={2} isAnimationActive={false}>
            {data.map((row) => (
              <Cell
                key={`outflow-${row.month}`}
                fill={row.partial ? "var(--color-partial)" : "var(--color-outflow)"}
              />
            ))}
          </Bar>
          <Line dataKey="net" type="monotone" stroke="var(--color-net)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Salidas en negativo, tal como vienen en el dataset. Solo se incluyen movimientos con estado
        contabilizado.
        {partialMonths.length > 0
          ? ` En color de aviso, el mes parcial del corte (${partialMonths.join(", ")}): solo contiene los días disponibles hasta la fecha de corte.`
          : ""}
      </p>
    </div>
  );
}
