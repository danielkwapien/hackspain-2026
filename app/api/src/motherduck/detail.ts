import { z } from "zod";
import type { CompanyDetail, CompanyListItem } from "../exports.js";
import type { MotherDuckClient } from "./client.js";
import { CUTOFF } from "./sql.js";

const text = z.string().nullable();
const number = z.number().nullable();
const bank = z.object({ product_id: z.string(), label: z.string(), type: z.string(), bank_name: z.string(), service: z.string(), currency: z.string(), created_at: text, has_balance: z.boolean(), balance_date: text });
const debt = z.object({ product_id: z.string(), label: z.string(), type: z.string(), bank_name: z.string(), currency: z.string(), granted: number, outstanding: number, liquidity: number });
const balance = z.object({ product_id: z.string(), date: z.string(), balance: number, available: number, liquidity: number, countable: number });
const schedule = z.object({ product_id: z.string(), currency: z.string(), amortising_frequency: z.string(), total_periods: number, next_payment_date: text, last_payment_date: text, annual_interest_rate_or_spread: number, interest_type: z.string(), outstanding_balance: number });
const activity = z.object({ month: z.string(), currency: z.string(), n_tx: z.number(), inflow: z.number(), outflow: z.number(), net: z.number(), n_tx_pending: z.number(), partial: z.boolean() });
const invoice = z.object({ month: z.string(), currency: z.string(), n: z.number(), n_paid: z.number(), n_overdue: z.number(), n_pending: z.number(), n_cancel: z.number(), pending_amount_sum: number });
const products = `(SELECT product_id, company_id, currency FROM banking_products UNION ALL SELECT product_id, company_id, currency FROM debt_products)`;

export async function readDetail(client: MotherDuckClient, company: CompanyListItem): Promise<CompanyDetail> {
  const id = [company.company_id];
  const banking = await client.query(`SELECT p.product_id,p.label,p.type,p.bank_name,p.service,p.currency,p.created_at::varchar created_at,
    b.date IS NOT NULL has_balance,b.date::varchar balance_date FROM banking_products p
    LEFT JOIN (SELECT product_id,company_id,max(date) date FROM balances WHERE date <= ${CUTOFF} GROUP BY ALL) b USING(product_id,company_id) WHERE p.company_id=? ORDER BY product_id`, bank, id);
  const debts = await client.query(`SELECT product_id,label,type,bank_name,currency,granted::double AS "granted",outstanding::double outstanding,liquidity::double liquidity FROM debt_products WHERE company_id=? ORDER BY product_id`, debt, id);
  const balances = await client.query(`SELECT product_id,date::varchar date,balance::double balance,available::double available,liquidity::double liquidity,countable::double countable FROM balances WHERE company_id=? AND date <= ${CUTOFF} ORDER BY date,product_id`, balance, id);
  const schedules = await client.query(`SELECT product_id,currency,amortising_frequency,total_periods::integer total_periods,next_payment_date::varchar next_payment_date,last_payment_date::varchar last_payment_date,annual_interest_rate_or_spread::double annual_interest_rate_or_spread,interest_type,outstanding_balance::double outstanding_balance FROM debt_schedule_config WHERE company_id=? ORDER BY product_id`, schedule, id);
  const monthly = await client.query(`SELECT strftime(t.date,'%Y-%m') AS month,coalesce(p.currency,'UNKNOWN') currency,count(*) FILTER(WHERE t.status='booked')::integer n_tx,
    coalesce(sum(greatest(t.amount,0)) FILTER(WHERE t.status='booked'),0)::double inflow,
    coalesce(sum(least(t.amount,0)) FILTER(WHERE t.status='booked'),0)::double outflow,
    coalesce(sum(t.amount) FILTER(WHERE t.status='booked'),0)::double net,
    count(*) FILTER(WHERE t.status='pending')::integer n_tx_pending,
    strftime(t.date,'%Y-%m')=strftime(${CUTOFF},'%Y-%m') AS partial
    FROM transactions t LEFT JOIN ${products} p USING(product_id,company_id)
    WHERE t.company_id=? AND t.status IN ('booked','pending') AND t.date <= ${CUTOFF}
    GROUP BY 1,2 ORDER BY 1,2`, activity, id);
  const monthlyInvoices = await client.query(`SELECT strftime(issuance_date,'%Y-%m') AS month,currency,count(*)::integer n,
    count(*) FILTER(WHERE status='paid')::integer n_paid,count(*) FILTER(WHERE status='overdue')::integer n_overdue,
    count(*) FILTER(WHERE status IN ('pending','payment_in_progress','paymentOrder','shipped'))::integer n_pending,count(*) FILTER(WHERE status='cancel')::integer n_cancel,
    sum(pending_amount)::double pending_amount_sum FROM invoices WHERE company_id=?
    AND issuance_date <= ${CUTOFF} GROUP BY 1,2 ORDER BY 1,2`, invoice, id);
  return {
    contract_version: "dashboard-v1", identification: company,
    coverage: company.coverage,
    products: { banking, debt: debts }, schedule: { n_with_schedule: schedules.length, n_debt_products: debts.length, items: schedules }, balances,
    monthly_activity: monthly,
    monthly_invoices: { direction_note: "Facturas emitidas antes del corte, por moneda y mes de emisión; sin convertir divisas. Los estados son los del fichero fuente.", items: monthlyInvoices },
  };
}
