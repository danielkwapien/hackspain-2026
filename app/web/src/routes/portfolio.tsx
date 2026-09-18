import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { cn } from "cn";
import { CurrencyAmounts } from "@/components/currency-amounts";
import { EngineBadge } from "@/components/engine-badge";
import { EmptyState, ErrorState, LoadingTable } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCompanies, getGroup, getGroups, getManifest } from "@/lib/api";
import { EMPTY_VALUE, formatCount, formatDate } from "@/lib/format";

const PAGE_SIZE = 50;
const ALL_GROUPS = "all";

const SORT_KEYS = ["company_id", "months_with_activity", "last_activity", "n_transactions"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const SORT_LABELS: Record<SortKey, string> = {
  company_id: "Sociedad",
  months_with_activity: "Cobertura",
  last_activity: "Última actividad",
  n_transactions: "Movimientos",
};

type Order = "asc" | "desc";

function isSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as readonly string[]).includes(value);
}

function SortHeader({
  label,
  sortKey,
  activeSort,
  order,
  onSort,
  numeric = false,
}: {
  label: string;
  sortKey: SortKey;
  activeSort: SortKey;
  order: Order;
  onSort: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const active = activeSort === sortKey;
  return (
    <TableHead aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium uppercase tracking-wide",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          numeric && "justify-end",
        )}
      >
        {label}
        {active ? (
          order === "asc" ? (
            <ArrowUp aria-hidden="true" className="size-3" />
          ) : (
            <ArrowDown aria-hidden="true" className="size-3" />
          )
        ) : null}
      </button>
    </TableHead>
  );
}

export function PortfolioPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const groupId = params.get("group") ?? "";
  const sortParam = params.get("sort");
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "company_id";
  const order: Order = params.get("order") === "desc" ? "desc" : "asc";
  const offset = Math.max(0, Number.parseInt(params.get("offset") ?? "0", 10) || 0);
  const urlQuery = params.get("q") ?? "";
  const [queryInput, setQueryInput] = useState(urlQuery);

  const updateParams = (
    next: Record<string, string | null>,
    options: { replace?: boolean } = {},
  ) => {
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(next)) {
          if (value === null || value === "") updated.delete(key);
          else updated.set(key, value);
        }
        return updated;
      },
      { replace: options.replace ?? false },
    );
  };

  // La búsqueda por ID se traslada a la URL con una pausa corta para no escribir
  // una entrada de historial por pulsación.
  useEffect(() => {
    if (queryInput === urlQuery) return;
    const timer = window.setTimeout(() => {
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);
          if (queryInput) updated.set("q", queryInput);
          else updated.delete("q");
          updated.delete("offset");
          return updated;
        },
        { replace: true },
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryInput, urlQuery, setParams]);

  const manifestQuery = useQuery({ queryKey: ["manifest"], queryFn: getManifest });
  const groupsQuery = useQuery({ queryKey: ["groups"], queryFn: getGroups });
  const groupQuery = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => getGroup(groupId),
    enabled: groupId !== "",
  });
  const companiesQuery = useQuery({
    queryKey: ["companies", { groupId, q: urlQuery, sort, order, offset }],
    queryFn: () => getCompanies({ groupId, q: urlQuery, sort, order, offset, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const partialMonth = manifestQuery.data ? manifestQuery.data.cutoff_date.slice(0, 7) : null;
  const list = companiesQuery.data;
  const total = list?.total ?? 0;
  const returned = list?.items.length ?? 0;
  const from = returned === 0 ? 0 : offset + 1;
  const to = offset + returned;
  const selectedGroup = groupQuery.data?.group ?? null;

  const handleSort = (key: SortKey) => {
    const nextOrder: Order = key === sort && order === "asc" ? "desc" : "asc";
    updateParams({ sort: key, order: nextOrder, offset: null }, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Cartera</h1>
          <p className="text-xs text-muted-foreground">
            Sociedades del dataset por grupo, con cobertura observada, caja por moneda y productos
            contratados. Los importes no se convierten ni se suman entre monedas distintas.
          </p>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {companiesQuery.isSuccess
            ? `Mostrando ${formatCount(from)} a ${formatCount(to)} de ${formatCount(total)} sociedades`
            : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={groupId === "" ? ALL_GROUPS : groupId}
          onValueChange={(value) =>
            updateParams({ group: value === ALL_GROUPS ? null : value, offset: null }, { replace: true })
          }
        >
          <SelectTrigger aria-label="Grupo" className="w-64">
            <SelectValue placeholder="Todos los grupos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_GROUPS}>Todos los grupos</SelectItem>
            {(groupsQuery.data ?? []).map((group) => (
              <SelectItem key={group.group_id} value={group.group_id}>
                {`${group.group_id} · ${formatCount(group.n_companies_present)} sociedades`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          aria-label="Buscar por ID de sociedad"
          className="w-56"
          placeholder="Buscar por ID (COMP_0047)"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
        />

        <Select
          value={sort}
          onValueChange={(value) =>
            updateParams({ sort: value, offset: null }, { replace: true })
          }
        >
          <SelectTrigger aria-label="Ordenar por" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {`Ordenar por ${SORT_LABELS[key]}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={order}
          onValueChange={(value) =>
            updateParams({ order: value, offset: null }, { replace: true })
          }
        >
          <SelectTrigger aria-label="Dirección del orden" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Ascendente</SelectItem>
            <SelectItem value="desc">Descendente</SelectItem>
          </SelectContent>
        </Select>

        {groupId !== "" || urlQuery !== "" || sort !== "company_id" || order !== "asc" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQueryInput("");
              updateParams(
                { group: null, q: null, sort: null, order: null, offset: null },
                { replace: true },
              );
            }}
          >
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      {groupId !== "" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{`Grupo ${groupId}`}</CardTitle>
          </CardHeader>
          <CardContent>
            {groupQuery.isPending ? (
              <LoadingTable rows={2} columns={4} />
            ) : groupQuery.isError ? (
              <ErrorState
                error={groupQuery.error}
                context="la ficha del grupo"
                onRetry={() => groupQuery.refetch()}
              />
            ) : selectedGroup ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Sociedades</dt>
                  <dd className="num">
                    {`${formatCount(selectedGroup.n_companies_present)} presentes`}
                    {selectedGroup.n_companies_in_sample !== selectedGroup.n_companies_present
                      ? ` (${formatCount(selectedGroup.n_companies_in_sample)} en la muestra)`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ERP</dt>
                  <dd>{selectedGroup.erp ?? EMPTY_VALUE}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cobertura</dt>
                  <dd className="num">
                    {`${selectedGroup.coverage.months_with_activity_min ?? EMPTY_VALUE} a ${selectedGroup.coverage.months_with_activity_max ?? EMPTY_VALUE} meses con actividad`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Snapshot</dt>
                  <dd className="num">
                    {selectedGroup.snapshot_dates.length > 0
                      ? selectedGroup.snapshot_dates.map((date) => formatDate(date)).join(", ")
                      : EMPTY_VALUE}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Monedas</dt>
                  <dd className="num">
                    {selectedGroup.currencies.length > 0
                      ? selectedGroup.currencies
                          .map((currency) => `${currency.code} (${formatCount(currency.n)})`)
                          .join(", ")
                      : EMPTY_VALUE}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Países</dt>
                  <dd className="num">
                    {selectedGroup.countries.length > 0
                      ? selectedGroup.countries
                          .map((country) => `${country.code} (${formatCount(country.n)})`)
                          .join(", ")
                      : EMPTY_VALUE}
                  </dd>
                </div>
              </dl>
            ) : (
              <EmptyState title="Grupo sin datos en el inventario" />
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Sin score agregado de grupo: el motor analítico está pendiente de cálculo.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!list ? (
        companiesQuery.isError ? (
          <ErrorState
            error={companiesQuery.error}
            context="el listado de sociedades"
            onRetry={() => companiesQuery.refetch()}
          />
        ) : (
          <LoadingTable rows={8} columns={10} />
        )
      ) : list.items.length === 0 ? (
        <EmptyState
          title="Sin sociedades para estos filtros"
          description="Ninguna sociedad del inventario coincide con el grupo o la búsqueda indicados."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="Sociedad" sortKey="company_id" activeSort={sort} order={order} onSort={handleSort} />
                <TableHead>Grupo</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Moneda</TableHead>
                <SortHeader label="Cobertura" sortKey="months_with_activity" activeSort={sort} order={order} onSort={handleSort} />
                <SortHeader label="Última actividad" sortKey="last_activity" activeSort={sort} order={order} onSort={handleSort} />
                <TableHead className="text-right">Caja observada</TableHead>
                <TableHead className="text-right">Productos</TableHead>
                <SortHeader label="Movimientos" sortKey="n_transactions" activeSort={sort} order={order} onSort={handleSort} numeric />
                <TableHead>Score</TableHead>
                <TableHead>Tendencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((company) => {
                const isPartial = partialMonth !== null && company.coverage.last_activity?.startsWith(partialMonth);
                return (
                  <TableRow
                    key={company.company_id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/companies/${company.company_id}`)}
                  >
                    <TableCell>
                      <Link
                        to={`/companies/${company.company_id}`}
                        className="num text-primary hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {company.company_id}
                      </Link>
                    </TableCell>
                    <TableCell className="num text-muted-foreground">{company.group_id}</TableCell>
                    <TableCell>{company.country ?? EMPTY_VALUE}</TableCell>
                    <TableCell className="num">{company.currency}</TableCell>
                    <TableCell className="num whitespace-nowrap">
                      {`${company.coverage.months_with_activity}/${company.coverage.periods_total}`}
                      {isPartial ? (
                        <Badge
                          variant="outline"
                          className="ml-2 border-warning/40 text-warning"
                          title="La última actividad cae en el mes parcial del corte"
                        >
                          mes parcial
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap">
                      {formatDate(company.coverage.last_activity)}
                    </TableCell>
                    <TableCell className="text-right">
                      <CurrencyAmounts amounts={company.coverage.snapshot.balance_total_by_currency} />
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right">
                      {`${formatCount(company.coverage.counts.banking_products)} / ${formatCount(company.coverage.counts.debt_products)}`}
                    </TableCell>
                    <TableCell className="num text-right">
                      {formatCount(company.coverage.counts.transactions)}
                    </TableCell>
                    <TableCell>
                      <EngineBadge status={company.engine?.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{EMPTY_VALUE}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Productos: bancarios / deuda. Movimientos: recuento de transacciones del periodo.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => updateParams({ offset: String(Math.max(0, offset - PAGE_SIZE)) })}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!list || to >= total}
            onClick={() => updateParams({ offset: String(offset + PAGE_SIZE) })}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
