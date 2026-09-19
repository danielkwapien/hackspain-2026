import { z } from "zod";
import type { Coverage } from "../exports.js";
import type { CompanyRow } from "../v2/store.js";
import { MotherDuckUnavailableError, type MotherDuckClient } from "./client.js";
import { BALANCE_ASOF, CUTOFF } from "./sql.js";

const summary = z.object({ company_id: z.string(), dates: z.array(z.string()), totals: z.array(z.object({ currency: z.string(), total: z.number() })), n_products: z.number(), currencies: z.array(z.object({ code: z.string(), n_tx: z.number() })) });
export async function loadCoverage(client: MotherDuckClient, companies: CompanyRow[]) {
  const observation = await client.query(`WITH cutoff AS (SELECT ${CUTOFF} cutoff_date)
    SELECT min(t.date)::date::varchar AS "start",
    e.cutoff_date::varchar AS "end",
    (date_diff('month',min(t.date),e.cutoff_date)+1)::integer periods_total
    FROM transactions t CROSS JOIN cutoff e WHERE t.date <= e.cutoff_date GROUP BY e.cutoff_date`,
    z.object({ start: z.string(), end: z.string(), periods_total: z.number().int().positive() }));
  if (observation.length !== 1) throw new MotherDuckUnavailableError();
  const window = observation[0];
  const rows = await client.query(`WITH products AS (
    SELECT product_id,company_id,currency FROM banking_products UNION ALL SELECT product_id,company_id,currency FROM debt_products
  ), latest AS (SELECT * FROM balances WHERE date <= ${BALANCE_ASOF} QUALIFY row_number() OVER(PARTITION BY company_id,product_id ORDER BY date DESC)=1),
  totals AS (SELECT b.company_id,coalesce(p.currency,'UNKNOWN') currency,sum(b.balance)::double total FROM latest b JOIN banking_products p USING(product_id,company_id) GROUP BY 1,2),
  -- Al corte como sus vecinos de este fichero: este desglose por moneda es el
  -- mismo recuento de movimientos que counts.transactions (ya acotado en
  -- COMPANIES_SQL), y la ficha de empresa los pinta en la misma tarjeta. Sin
  -- filtrar, 137 de las 1.286 sociedades enseñaban las dos cifras a la vez y
  -- distintas (COMP_0769: 15.073 contra 15.138).
  currencies AS (SELECT t.company_id,coalesce(p.currency,'UNKNOWN') code,count(*)::integer n_tx FROM transactions t LEFT JOIN products p USING(product_id,company_id) WHERE t.date <= ${CUTOFF} GROUP BY 1,2)
  SELECT c.company_id,
    coalesce((SELECT list(DISTINCT b.date::varchar ORDER BY b.date::varchar) FROM balances b WHERE b.company_id=c.company_id AND b.date <= ${BALANCE_ASOF}),[]) dates,
    coalesce((SELECT list(struct_pack(currency:=t.currency,total:=t.total) ORDER BY t.currency) FROM totals t WHERE t.company_id=c.company_id),[]) totals,
    (SELECT count(DISTINCT b.product_id)::integer FROM balances b JOIN banking_products p USING(product_id,company_id) WHERE b.company_id=c.company_id AND b.date <= ${BALANCE_ASOF}) n_products,
    coalesce((SELECT list(struct_pack(code:=x.code,n_tx:=x.n_tx) ORDER BY x.code) FROM currencies x WHERE x.company_id=c.company_id),[]) currencies
    FROM companies c`, summary);
  const byId = new Map(rows.map((row) => [row.company_id, row]));
  const byCompany = new Map<string, Coverage>(companies.map((company) => {
    const row = byId.get(company.company_id);
    if (!row) throw new MotherDuckUnavailableError();
    return [company.company_id, { months_with_activity: company.months_hist ?? 0, periods_total: window.periods_total,
      first_activity: company.first_activity, last_activity: company.last_activity,
      counts: { banking_products: company.n_banking_products ?? 0, debt_products: company.n_debt_products ?? 0,
        invoices: company.n_invoices ?? 0, transactions: company.n_transactions ?? 0, transactions_pending: company.n_transactions_pending ?? 0 },
      snapshot: { dates: row.dates, balance_total_by_currency: row.totals, n_products_with_balance: row.n_products },
      currencies: row.currencies }];
  }));
  return { byCompany, window: { start: window.start, end: window.end } };
}
