/**
 * CTE del pendiente de cobro en euros, compartido por los dos cargadores que
 * leen el directorio de sociedades (el snapshot de `sql.ts` y la publicación
 * temporal de `temporal-store.ts`): la misma columna en los dos sitios tiene
 * que salir del mismo SQL, o la ruta que sirve la app y la que sirve el
 * snapshot dirían cifras distintas con el mismo nombre.
 */
export const PENDING_EUR_CTE = `pending_eur AS (
 -- Pendiente de COBRO: solo EUR y solo positivo.
 -- Solo EUR porque el dataset trae 39 monedas y no hay tabla de cambio (no hay
 -- conversión FX implícita), así que sumar COP con EUR daría una cifra falsa; el
 -- euro va dicho en la etiqueta del front.
 -- Solo positivo porque en estos datos el SIGNO es lo único que separa cobro de
 -- pago: el pendiente negativo es pendiente de PAGO (deuda de la empresa) y se
 -- deja fuera a propósito, no es una nota de crédito: credit_note ni siquiera
 -- existe como document_type. Medido sobre las facturas en EUR: invoice, 85.688
 -- filas con pendiente > 0 (+1.105 M) y 84.282 con pendiente < 0 (−758 M);
 -- paymentDocument, 5.846 (+74,6 M) y 4.805 (−243 M); invoiceGroup, 870
 -- (+24,7 M) y 2.564 (−119 M). O sea que casi la mitad de las filas en euros
 -- — 91.651 de 184.055 — son pendiente de pago.
 -- Y se suman TODOS los tipos de documento porque ninguno separa limpiamente
 -- cobro de pago: los tres tienen filas de los dos signos.
 -- Sin filtro de fecha: el pendiente es el saldo VIVO del fichero de facturas,
 -- el mismo universo que el n_invoices de su misma fila, que también cuenta el
 -- fichero entero; y los dos cargadores publican cortes distintos (2026-09-01
 -- el snapshot, 2026-08-01 el motor), así que un pendiente «al corte» haría que
 -- la misma columna dijera dos cosas. Medido: las 5 facturas en euros emitidas
 -- después del corte del snapshot suman 36.166 € sobre 1.232.312.350 (0,003 %).
   SELECT company_id,
          sum(CASE WHEN pending_amount > 0 THEN pending_amount ELSE 0 END)::double p
   FROM invoices
   WHERE currency = 'EUR'
   GROUP BY company_id)`;

export const COMPANIES_SQL = `
WITH activity AS (
 SELECT company_id, min(date) FILTER (WHERE status = 'booked' AND date <= (SELECT cutoff_date FROM score_exports LIMIT 1))::varchar first_activity, max(date) FILTER (WHERE status = 'booked' AND date <= (SELECT cutoff_date FROM score_exports LIMIT 1))::varchar last_activity,
 count(DISTINCT date_trunc('month', date)) FILTER (WHERE status = 'booked' AND date <= (SELECT cutoff_date FROM score_exports LIMIT 1))::integer months_hist,
 count(*)::integer n_transactions, count(*) FILTER (WHERE status = 'pending')::integer n_pending
 FROM transactions GROUP BY company_id
), invoice_counts AS (SELECT company_id, count(*)::integer n FROM invoices GROUP BY company_id),
 ${PENDING_EUR_CTE},
 bank_counts AS (SELECT company_id, count(*)::integer n FROM banking_products GROUP BY company_id),
 debt_counts AS (SELECT company_id, count(*)::integer n FROM debt_products GROUP BY company_id)
SELECT c.company_id, c.group_id, c.country, c.currency, c.erp, c.created_at::varchar created_at,
 a.first_activity, a.last_activity, coalesce(a.months_hist,0)::integer months_hist,
 coalesce(a.n_transactions,0)::integer n_transactions, coalesce(a.n_pending,0)::integer n_pending,
 coalesce(i.n,0)::integer n_invoices, coalesce(pe.p,0)::double pending_eur,
 coalesce(b.n,0)::integer n_banking_products,
 coalesce(d.n,0)::integer n_debt_products, s.payload::varchar payload,
 EXISTS(SELECT 1 FROM debt_schedule_config sc WHERE sc.company_id=c.company_id) has_debt_repayment,
 EXISTS(SELECT 1 FROM debt_products dp WHERE dp.company_id=c.company_id AND dp.type='lineofcredit') has_lineofcredit
FROM companies c JOIN scores s USING(company_id)
LEFT JOIN activity a USING(company_id) LEFT JOIN invoice_counts i USING(company_id)
LEFT JOIN pending_eur pe USING(company_id)
LEFT JOIN bank_counts b USING(company_id) LEFT JOIN debt_counts d USING(company_id)
ORDER BY c.company_id`;
