/**
 * Corte de la publicación real. `engine_exports.cutoff_date` es texto y se
 * castea para poder compararlo con fechas.
 *
 * Ya no hay dos cortes. Hasta XR-035 el snapshot leía el suyo de la cabecera del
 * motor antiguo (2026-09-01) mientras la publicación temporal servía el del motor
 * real (2026-08-01), así que la misma empresa contaba sus movimientos hasta una
 * fecha y su score hasta otra. Los dos cargadores usan este.
 *
 * (El nombre de aquella tabla no se escribe aquí a propósito: `legacy-tables.test.ts`
 * lo prohíbe en todo `app/api/src`, y esa guarda vale más estricta que matizada.)
 */
export const CUTOFF = `(SELECT cutoff_date::DATE FROM engine_exports LIMIT 1)`;

/**
 * Fecha de la foto de saldos. `balances` NO es una serie: es una sola foto, casi
 * toda a 2026-09-01, y el motor la usa como ancla para reconstruir la caja hacia
 * atrás (`core/pipeline_embat.py`, `monthly_cash`). Recortarla por el corte del
 * motor (2026-08-01) la dejaba entera fuera y la caja observada desaparecía. El
 * límite se toma de la propia tabla para que sea explícito y no dependa del corte.
 */
export const BALANCE_ASOF = `(SELECT max(date) FROM balances)`;

/**
 * CTE del pendiente de cobro en euros, compartido por los dos cargadores que
 * leen el directorio de sociedades (el snapshot de `sql.ts` y la publicación
 * temporal de `temporal-store.ts`), parametrizado por la expresión SQL de corte
 * que cada uno usa en sus otros CTE. Desde XR-035 los dos pasan `CUTOFF`, pero
 * el parámetro se conserva: la definición es de aquí y la fecha la pone quien
 * llama, que es lo que impide que vuelvan a divergir en silencio.
 */
export const pendingEurCte = (cutoff: string): string => `pending_eur AS (
 -- Pendiente de COBRO al corte: solo EUR, solo positivo y solo ya emitido.
 -- Solo EUR porque el dataset trae 39 monedas y no hay tabla de cambio (no hay
 -- conversión FX implícita), así que sumar COP con EUR daría una cifra falsa; el
 -- euro va dicho en la etiqueta del front.
 -- Solo positivo porque en estos datos el SIGNO es lo único que separa cobro de
 -- pago: el pendiente negativo es pendiente de PAGO (deuda de la empresa).
 -- Medido en euros: 96.959 filas negativas de las 194.991 con pendiente distinto
 -- de cero, y ningún document_type sirve de filtro porque todos tienen filas de
 -- los dos signos (invoice, 85.693 positivas y 84.305 negativas).
 -- Solo hasta el corte porque una factura emitida después todavía no existía:
 -- aplicar el del motor deja fuera 121.706.871 € de 1.232.312.350 (9,88 %),
 -- 10.877 facturas de 441 sociedades.
   SELECT company_id,
          sum(CASE WHEN pending_amount > 0 THEN pending_amount ELSE 0 END)::double p
   FROM invoices
   WHERE currency = 'EUR' AND issuance_date <= ${cutoff}
   GROUP BY company_id)`;

/**
 * Recuento de facturas al corte, compartido por los mismos dos cargadores y
 * parametrizado igual que `pendingEurCte`: la fila entera habla del corte, así
 * que el número de facturas también. Una emitida después todavía no existía:
 * sin filtrar son 57.385 de 897.894 (6,39 %) en 646 sociedades, y una empresa
 * salía más grande en el mapa por facturas que al corte no estaban.
 */
export const invoiceCountsCte = (cutoff: string): string => `invoice_counts AS (
   SELECT company_id, count(*)::integer n
   FROM invoices
   WHERE issuance_date <= ${cutoff}
   GROUP BY company_id)`;

/** Universo de sociedades: las que puntúa el motor real (`company_scores`), una vez cada una. */
export const COMPANIES_SQL = `
WITH scored AS (SELECT DISTINCT company_id FROM company_scores),
activity AS (
 SELECT company_id, min(date) FILTER (WHERE status = 'booked' AND date <= ${CUTOFF})::varchar first_activity, max(date) FILTER (WHERE status = 'booked' AND date <= ${CUTOFF})::varchar last_activity,
 count(DISTINCT date_trunc('month', date)) FILTER (WHERE status = 'booked' AND date <= ${CUTOFF})::integer months_hist,
 -- Al corte como sus vecinos de este CTE, y por la misma razón: un movimiento
 -- posterior todavía no existía. Sin filtrar eran 158.281 de 2.556.437 (6,19 %)
 -- en 1.165 sociedades, y una empresa salía más grande en el mapa por ellos.
 -- Los dos estados (booked y pending) siguen contando: lo único que cambia es
 -- la fecha, no el criterio de estado.
 count(*) FILTER (WHERE date <= ${CUTOFF})::integer n_transactions,
 count(*) FILTER (WHERE status = 'pending' AND date <= ${CUTOFF})::integer n_pending
 FROM transactions GROUP BY company_id
), ${invoiceCountsCte(CUTOFF)},
 ${pendingEurCte(CUTOFF)},
 bank_counts AS (SELECT company_id, count(*)::integer n FROM banking_products GROUP BY company_id),
 debt_counts AS (SELECT company_id, count(*)::integer n FROM debt_products GROUP BY company_id)
SELECT c.company_id, c.group_id, c.country, c.currency, c.erp, c.created_at::varchar created_at,
 a.first_activity, a.last_activity, coalesce(a.months_hist,0)::integer months_hist,
 coalesce(a.n_transactions,0)::integer n_transactions, coalesce(a.n_pending,0)::integer n_pending,
 coalesce(i.n,0)::integer n_invoices, coalesce(pe.p,0)::double pending_eur,
 coalesce(b.n,0)::integer n_banking_products,
 coalesce(d.n,0)::integer n_debt_products,
 EXISTS(SELECT 1 FROM debt_schedule_config sc WHERE sc.company_id=c.company_id) has_debt_repayment,
 EXISTS(SELECT 1 FROM debt_products dp WHERE dp.company_id=c.company_id AND dp.type='lineofcredit') has_lineofcredit
FROM companies c JOIN scored USING(company_id)
LEFT JOIN activity a USING(company_id) LEFT JOIN invoice_counts i USING(company_id)
LEFT JOIN pending_eur pe USING(company_id)
LEFT JOIN bank_counts b USING(company_id) LEFT JOIN debt_counts d USING(company_id)
ORDER BY c.company_id`;
