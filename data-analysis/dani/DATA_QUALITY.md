# Informe de calidad del dataset Embat v2

Fecha de ejecución: 18 de septiembre de 2026. Fuente: copia local completa de los ocho CSV del ZIP `output_hackspain_data-2.zip` (SHA-256 `c468be1d1482b3c1a595fc63f2b835280c5908b52ca8d68e1d02aca58c93f686`). El inventario con hash por fichero está en `artifacts/audit/inventory.parquet`.

## Dictamen

El dataset es utilizable para EDA de movimientos, features mensuales por sociedad y moneda y un baseline explicable basado en flujos observados. No es suficientemente fiable para DSO/DPO direccional, reconstrucción histórica exacta de caja, consolidación multidivisa ni servicio histórico completo de deuda sin aclaraciones adicionales.

## Inventario y claves

| Tabla | Filas verificadas | Clave | Resultado |
|---|---:|---|---|
| groups | 250 | group_id | única, sin nulos |
| companies | 1.286 | company_id | única, sin nulos |
| banking_products | 5.987 | product_id | única, sin nulos |
| debt_products | 2.239 | product_id | única, sin nulos |
| debt_schedule_config | 87 | product_id | única, sin nulos |
| transactions | 2.556.437 | transaction_id | única, sin nulos |
| invoices | 897.894 | operation_id | única, sin nulos |
| balances | 7.996 | product_id | 7.996 productos distintos |

No hay huérfanos en sociedad→grupo ni en las relaciones de productos, movimientos, facturas y saldos hacia `company_id`. Los identificadores de producto no se solapan entre las tablas bancaria y de deuda.

## Hallazgos prioritarios

### Alta: semántica de producto en movimientos

184.941 movimientos (7,23 %) no enlazan con `banking_products`. De ellos, 183.627 enlazan con `debt_products`; 1.314 (0,05 % del total) no enlazan con ninguna tabla de productos. Por tanto, un join exclusivo contra cuentas bancarias perdería movimientos y sesgaría importes. El baseline financiero usa solo movimientos enlazados a productos bancarios para conservar moneda demostrable; la cobertura excluida se reporta por separado.

### Alta: facturas sin dirección fiable

El dataset no contiene un campo emitida/recibida. El signo no resuelve el sentido: `invoice` contiene 309.849 importes positivos y 449.558 negativos, y el resto de tipos también mezcla signos. `document_type` distingue clase documental, no venta frente a compra. Se bloquean DSO, DPO, aging de clientes/proveedores y ratios derivados hasta que la organización confirme la convención o aporte una dirección explícita.

Además, 20.869 facturas tienen vencimiento anterior a emisión (2,32 %), 29.089 tienen pago anterior a emisión (3,24 %), 110.465 presentan `pending_amount < 0` (12,30 %) y 67 tienen pendiente superior al importe absoluto. Estos campos no entran en features online sin una regla corregida.

### Alta: FX no apto para consolidación automática

Movimientos: no hay nulos, pero 77 tipos son `<= 0` y el rango llega a 6.500. Facturas: existen 261 nulos, ceros y extremos; para USD→EUR se observa máximo 11.931,77 y para EUR→GBP máximo 50. El dataset no declara dirección ni base del tipo. Las cifras permanecen por moneda de producto; no se consolidan grupos ni se multiplican importes por `exchange_rate`.

### Media: cobertura temporal desigual

Las 1.286 sociedades tienen algún movimiento, pero cubren entre 1 y 25 meses: percentil 10 = 8, p25 = 10, mediana = 19, p75 = 24 y p90 = 25. Septiembre de 2024 a septiembre de 2026 produce 25 meses calendario, no 24 filas mensuales uniformes. Los meses sin extracción se conservan como ausentes; el score requiere al menos 3 meses observados en una ventana de 6 y lleva cobertura separada.

### Media: saldos y deuda son snapshots parciales

Los 7.996 saldos cubren cinco fechas: 7.980 a 2026-09-01 y 16 entre 2026-08-25 y 2026-08-29. No se copia una fecha única ni se reconstruye caja histórica. 5.760 saldos enlazan con productos bancarios, 2.207 con deuda y 29 con ninguno.

Los 87 calendarios enlazan con su producto de deuda, pero solo 77 (88,5 %) enlazan con una cuenta de liquidación. Son condiciones actuales; `total_periods` no se interpreta como plazos restantes y `annual_interest_rate_or_spread` no se trata automáticamente como tipo efectivo total.

### Media: faltantes estructurales

`balances.available` está vacío al 100 %; `countable` al 91,70 %, `liquidity` al 76,29 % y `granted` al 66,88 %. `transactions.counterparty_id` falta en 90,19 % y `accounting_status` en 61,56 %. `companies.country` falta en 82,12 %. Estos campos no se imputan a cero.

## Decisiones analíticas

1. Grano de features: sociedad/mes/moneda del producto bancario.
2. Solo movimientos `booked`; `pending` y estado nulo no se mezclan con realizado.
3. Categorías de financiación, inversión y transferencias quedan fuera del flujo operativo.
4. No se hace join factura-movimiento por contraparte/importe/fecha: no existe relación uno-a-uno demostrable.
5. `pending_amount`, estado final de factura, deuda actual y saldos finales no se replican en meses históricos.
6. Calidad/cobertura es una salida separada y nunca una contribución negativa al score.
7. No hay etiquetas ni lista de test: no se reporta accuracy supervisada ni probabilidad de default.

## Preguntas bloqueantes para Embat/organización

1. ¿Qué campo o convención identifica facturas emitidas frente a recibidas?
2. ¿Cuál es la dirección exacta de `exchange_rate` en movimientos y facturas, y cuál es la moneda del `amount` de movimientos?
3. ¿Por qué 1.314 movimientos referencian productos ausentes y 29 saldos no enlazan con ningún producto?
4. ¿Las fechas de pago/vencimiento anteriores a emisión y los pendientes negativos son artefactos intencionales del generador?
5. ¿Existe un fichero separado de target/test y cuál es la unidad oficial del leaderboard?
