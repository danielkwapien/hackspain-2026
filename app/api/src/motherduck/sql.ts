export const COMPANIES_SQL = `
WITH activity AS (
 SELECT company_id, min(date) FILTER (WHERE status = 'booked' AND date <= (SELECT cutoff_date FROM score_exports LIMIT 1))::varchar first_activity, max(date) FILTER (WHERE status = 'booked' AND date <= (SELECT cutoff_date FROM score_exports LIMIT 1))::varchar last_activity,
 count(DISTINCT date_trunc('month', date)) FILTER (WHERE status = 'booked' AND date <= (SELECT cutoff_date FROM score_exports LIMIT 1))::integer months_hist,
 count(*)::integer n_transactions, count(*) FILTER (WHERE status = 'pending')::integer n_pending
 FROM transactions GROUP BY company_id
), invoice_counts AS (SELECT company_id, count(*)::integer n FROM invoices GROUP BY company_id),
 bank_counts AS (SELECT company_id, count(*)::integer n FROM banking_products GROUP BY company_id),
 debt_counts AS (SELECT company_id, count(*)::integer n FROM debt_products GROUP BY company_id)
SELECT c.company_id, c.group_id, c.country, c.currency, c.erp, c.created_at::varchar created_at,
 a.first_activity, a.last_activity, coalesce(a.months_hist,0)::integer months_hist,
 coalesce(a.n_transactions,0)::integer n_transactions, coalesce(a.n_pending,0)::integer n_pending,
 coalesce(i.n,0)::integer n_invoices, coalesce(b.n,0)::integer n_banking_products,
 coalesce(d.n,0)::integer n_debt_products, s.payload::varchar payload,
 EXISTS(SELECT 1 FROM debt_schedule_config sc WHERE sc.company_id=c.company_id) has_debt_repayment,
 EXISTS(SELECT 1 FROM debt_products dp WHERE dp.company_id=c.company_id AND dp.type='lineofcredit') has_lineofcredit
FROM companies c JOIN scores s USING(company_id)
LEFT JOIN activity a USING(company_id) LEFT JOIN invoice_counts i USING(company_id)
LEFT JOIN bank_counts b USING(company_id) LEFT JOIN debt_counts d USING(company_id)
ORDER BY c.company_id`;
