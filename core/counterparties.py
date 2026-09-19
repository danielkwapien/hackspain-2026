"""Agregacion de contrapartes por sociedad, lado y contraparte.

Es la evidencia que falta debajo de los pilares de Pago y Cobros: la ficha dice
que el pilar de cobros de una empresa vale 29,9 puntos y nunca dice que cliente
lo lleva. Aqui se construye quien, cuanto pesa, cuanto se desvia y cuanto debe.

Todo vive en SQL contra una conexion DuckDB con las tablas del reto, asi que la
misma funcion sirve para una base local de prueba y para MotherDuck. El motor no
se ejecuta dentro de una peticion HTTP: esto corre en lote y la API solo lee lo
que este modulo deja escrito.

Tres decisiones medidas que cambian el resultado si se ignoran
--------------------------------------------------------------

1. **Solo euros, y nunca multiplicando por `exchange_rate`.** La columna no es
   un cambio a euros: vale 1,0 en la mayoria de las monedas extranjeras y
   ~19.959 en IDR. Multiplicar convierte 111.158 facturas no-euro en 5,2
   billones de euros, y en una tabla ordenada por peso una sola fila basura se
   lleva el primer puesto. El coste de quedarse en euros es bajo: la sociedad
   mediana es 100 % euro por el lado de proveedores. Cada resumen publica su
   `eur_share` para que la pantalla pueda decir que parte del libro mira.

2. **El vencido vivo se reconstruye as-of**, vencidas al corte menos liquidadas
   al corte, como hace `monthly_invoices` en `pipeline_embat.py`. `status` no se
   limpia en este dataset: tomarlo como bandera de vencido acumula los 24 meses
   de atrasos en el tramo `90+` (1,17 billones de euros frente a 2.360 millones
   en `0-30`). `status = 'paid'` solo se usa para dar por buena `payment_date`,
   que viene rellena tambien en 237.593 facturas no pagadas.

3. **El desvio es media ponderada por importe, no mediana.** La mediana vale
   exactamente 0 en los dos lados —la mitad de las facturas pagan el dia del
   vencimiento— y una columna de ceros no ordena nada.

El lado sale del SIGNO del importe: en este dataset es lo unico que separa cobro
de pago. `amount > 0` es una factura emitida a un cliente (`ar`); `amount < 0`
es una recibida de un proveedor (`ap`).
"""

from __future__ import annotations

from dataclasses import dataclass

# Documentos que son factura. El resto (albaranes, depositos, cheques) no forma
# parte del libro de cobros y pagos que se ensena junto al pilar.
INVOICE_TYPES = "('invoice','invoiceGroup')"

# Tramos de antiguedad del vencido vivo, en dias desde el vencimiento.
BUCKETS = (("overdue_0_30", 0, 30), ("overdue_31_60", 31, 60),
           ("overdue_61_90", 61, 90), ("overdue_90_plus", 91, None))

COUNTERPARTY_DDL = """
company_id VARCHAR NOT NULL, group_id VARCHAR, month VARCHAR NOT NULL,
side VARCHAR NOT NULL, counterparty_id VARCHAR NOT NULL,
amount_12m DOUBLE, weight DOUBLE, n_invoices INTEGER,
days_late_w DOUBLE, pct_late DOUBLE,
overdue_total DOUBLE, overdue_0_30 DOUBLE, overdue_31_60 DOUBLE,
overdue_61_90 DOUBLE, overdue_90_plus DOUBLE,
sparkline_12 JSON, generated_at TIMESTAMPTZ NOT NULL
"""

SUMMARY_DDL = """
company_id VARCHAR NOT NULL, group_id VARCHAR, month VARCHAR NOT NULL,
side VARCHAR NOT NULL, n_counterparties INTEGER, total_amount DOUBLE,
top1_weight DOUBLE, effective_counterparties DOUBLE, hhi DOUBLE,
days_late_w DOUBLE, pct_late DOUBLE, overdue_total DOUBLE,
eur_share DOUBLE, generated_at TIMESTAMPTZ NOT NULL
"""


@dataclass(frozen=True, slots=True)
class Window:
    """Ventana de doce meses que termina en el corte, ambos inclusive."""

    cutoff: str          # 'YYYY-MM-DD', ultimo dia cubierto
    start: str           # 'YYYY-MM-DD', primer dia cubierto
    month: str           # 'YYYY-MM', etiqueta del corte

    @staticmethod
    def ending(cutoff: str) -> "Window":
        year, month = int(cutoff[0:4]), int(cutoff[5:7])
        start_year, start_month = (year - 1, month + 1) if month < 12 else (year, 1)
        if start_month > 12:
            start_year, start_month = start_year + 1, start_month - 12
        return Window(cutoff, f"{start_year:04d}-{start_month:02d}-01", cutoff[:7])


def _bucket_sum(column: str, low: int, high: int | None) -> str:
    """Suma del vencido vivo cuya antiguedad cae en el tramo."""
    upper = "" if high is None else f" AND age <= {high}"
    return (f"round(coalesce(sum(amt) FILTER (WHERE live_overdue AND age >= {low}{upper}), 0), 2)"
            f"::DOUBLE AS {column}")


def counterparty_sql(window: Window) -> str:
    """Una fila por sociedad, lado y contraparte en la ventana.

    `sparkline_12` es el importe emitido mes a mes dentro de la ventana, con un
    cero explicito en los meses sin factura: el hueco de una relacion que para
    es justo la informacion que se quiere ver, no un dato ausente.
    """
    buckets = ",\n           ".join(_bucket_sum(name, low, high) for name, low, high in BUCKETS)
    return f"""
    WITH scoped AS (
      SELECT i.company_id,
             c.group_id,
             CASE WHEN i.amount > 0 THEN 'ar' ELSE 'ap' END AS side,
             i.counterparty_id,
             abs(i.amount)::DOUBLE AS amt,
             date_trunc('month', i.issuance_date)::DATE AS m_iss,
             i.due_date,
             -- `payment_date` solo vale acompanada de `status = 'paid'`.
             CASE WHEN i.status = 'paid' THEN i.payment_date END AS paid_at
      FROM invoices i
      LEFT JOIN companies c USING (company_id)
      WHERE i.document_type IN {INVOICE_TYPES}
        AND i.amount <> 0
        AND i.counterparty_id IS NOT NULL
        -- Nunca `amount * exchange_rate`: ver nota 1 del modulo.
        AND i.currency = 'EUR'
        AND i.issuance_date >= DATE '{window.start}'
        AND i.issuance_date <= DATE '{window.cutoff}'
    ), marked AS (
      SELECT *,
             -- Vencida al corte y aun no liquidada al corte. Sin leer `status`
             -- como bandera de vencido: ver nota 2 del modulo.
             (due_date <= DATE '{window.cutoff}'
              AND (paid_at IS NULL OR paid_at > DATE '{window.cutoff}')) AS live_overdue,
             date_diff('day', due_date, DATE '{window.cutoff}') AS age,
             CASE WHEN paid_at IS NOT NULL AND paid_at <= DATE '{window.cutoff}'
                  THEN date_diff('day', due_date, paid_at) END AS days_late
      FROM scoped
    ), monthly AS (
      SELECT company_id, side, counterparty_id, m_iss, round(sum(amt), 2) AS v
      FROM marked GROUP BY 1, 2, 3, 4
    ), grid AS (
      SELECT g.company_id, g.side, g.counterparty_id, months.m,
             coalesce(v.v, 0)::DOUBLE AS v
      FROM (SELECT DISTINCT company_id, side, counterparty_id FROM marked) g
      CROSS JOIN (SELECT unnest(generate_series(DATE '{window.start}',
                                                DATE '{window.cutoff}',
                                                INTERVAL 1 MONTH))::DATE AS m) months
      LEFT JOIN monthly v
        ON v.company_id = g.company_id AND v.side = g.side
       AND v.counterparty_id = g.counterparty_id AND v.m_iss = months.m
    ), spark AS (
      SELECT company_id, side, counterparty_id, list(v ORDER BY m) AS sparkline_12
      FROM grid GROUP BY 1, 2, 3
    ), agg AS (
      SELECT company_id, any_value(group_id) AS group_id, side, counterparty_id,
             round(sum(amt), 2)::DOUBLE AS amount_12m,
             count(*)::INTEGER AS n_invoices,
             -- Media PONDERADA por importe, no mediana: ver nota 3 del modulo.
             round(sum(days_late * amt) FILTER (WHERE days_late IS NOT NULL)
                   / nullif(sum(amt) FILTER (WHERE days_late IS NOT NULL), 0), 2)::DOUBLE
                   AS days_late_w,
             round(count(*) FILTER (WHERE days_late > 0)::DOUBLE
                   / nullif(count(*) FILTER (WHERE days_late IS NOT NULL), 0), 4)::DOUBLE
                   AS pct_late,
             round(coalesce(sum(amt) FILTER (WHERE live_overdue), 0), 2)::DOUBLE AS overdue_total,
             {buckets}
      FROM marked GROUP BY 1, 3, 4
    )
    SELECT a.company_id, a.group_id, '{window.month}' AS month, a.side, a.counterparty_id,
           a.amount_12m,
           round(a.amount_12m / nullif(sum(a.amount_12m) OVER (
             PARTITION BY a.company_id, a.side), 0), 6)::DOUBLE AS weight,
           a.n_invoices, a.days_late_w, a.pct_late,
           a.overdue_total, a.overdue_0_30, a.overdue_31_60, a.overdue_61_90, a.overdue_90_plus,
           to_json(s.sparkline_12) AS sparkline_12,
           now() AS generated_at
    FROM agg a LEFT JOIN spark s USING (company_id, side, counterparty_id)
    """


def summary_sql(window: Window) -> str:
    """Resumen por sociedad y lado, con la concentracion ya resuelta.

    `effective_counterparties` es 1/HHI, el numero de contrapartes de igual peso
    que darian esta misma concentracion: con un cliente al 90 % da 1,2, y esa
    cifra se entiende sin explicar que es un indice.

    `eur_share` es la parte del libro que estas filas cubren, en importe bruto
    sin convertir. Es la unica cifra honesta sobre lo que queda fuera: sin ella
    la pantalla afirmaria que el libro entero esta en la tabla.
    """
    return f"""
    WITH book AS (
      SELECT company_id,
             CASE WHEN amount > 0 THEN 'ar' ELSE 'ap' END AS side,
             sum(abs(amount)) FILTER (WHERE currency = 'EUR')::DOUBLE AS eur_amount,
             sum(abs(amount))::DOUBLE AS all_amount
      FROM invoices
      WHERE document_type IN {INVOICE_TYPES} AND amount <> 0 AND counterparty_id IS NOT NULL
        AND issuance_date >= DATE '{window.start}' AND issuance_date <= DATE '{window.cutoff}'
      GROUP BY 1, 2
    )
    SELECT c.company_id, any_value(c.group_id) AS group_id, '{window.month}' AS month, c.side,
           count(*)::INTEGER AS n_counterparties,
           round(sum(c.amount_12m), 2)::DOUBLE AS total_amount,
           round(max(c.weight), 6)::DOUBLE AS top1_weight,
           round(1.0 / nullif(sum(c.weight * c.weight), 0), 2)::DOUBLE AS effective_counterparties,
           round(sum(c.weight * c.weight), 6)::DOUBLE AS hhi,
           round(sum(c.days_late_w * c.amount_12m) FILTER (WHERE c.days_late_w IS NOT NULL)
                 / nullif(sum(c.amount_12m) FILTER (WHERE c.days_late_w IS NOT NULL), 0),
                 2)::DOUBLE AS days_late_w,
           round(sum(c.pct_late * c.n_invoices) FILTER (WHERE c.pct_late IS NOT NULL)
                 / nullif(sum(c.n_invoices) FILTER (WHERE c.pct_late IS NOT NULL), 0),
                 4)::DOUBLE AS pct_late,
           round(sum(c.overdue_total), 2)::DOUBLE AS overdue_total,
           round(any_value(b.eur_amount) / nullif(any_value(b.all_amount), 0), 4)::DOUBLE AS eur_share,
           now() AS generated_at
    FROM company_counterparties c
    LEFT JOIN book b ON b.company_id = c.company_id AND b.side = c.side
    WHERE c.month = '{window.month}'
    GROUP BY c.company_id, c.side
    """
