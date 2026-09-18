import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MonthlyInvoiceRow } from "@/lib/api";
import { formatCount, formatMonth } from "@/lib/format";

const CHART_CONFIG = {
  n_paid: { label: "Pagadas", color: "var(--positive)" },
  n_pending: { label: "Pendientes", color: "var(--chart-1)" },
  n_overdue: { label: "Vencidas", color: "var(--negative)" },
  n_cancel: { label: "Anuladas", color: "var(--chart-5)" },
} satisfies ChartConfig;

/** Recuento mensual de facturas por estado para una única moneda. */
export function InvoiceChart({ rows }: { rows: MonthlyInvoiceRow[] }) {
  const data = rows.map((row) => ({
    month: row.month,
    label: formatMonth(row.month),
    n_paid: row.n_paid,
    n_pending: row.n_pending,
    n_overdue: row.n_overdue,
    n_cancel: row.n_cancel,
  }));

  return (
    <ChartContainer config={CHART_CONFIG} className="h-[240px] w-full">
      <BarChart data={data} accessibilityLayer margin={{ left: 4, right: 8, top: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) => formatCount(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent formatter={(value) => <span className="num">{formatCount(Number(value))}</span>} />
          }
        />
        <Legend content={<ChartLegendContent />} />
        <Bar dataKey="n_paid" stackId="estado" isAnimationActive={false} fill="var(--color-n_paid)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="n_pending" stackId="estado" isAnimationActive={false} fill="var(--color-n_pending)" />
        <Bar dataKey="n_overdue" stackId="estado" isAnimationActive={false} fill="var(--color-n_overdue)" />
        <Bar dataKey="n_cancel" stackId="estado" isAnimationActive={false} fill="var(--color-n_cancel)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
