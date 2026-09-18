# Diccionario de features v0.1

Todas las features se calculan por `company_id`, mes calendario y moneda del producto bancario. Base: movimientos observados con `status = booked`. Un mes ausente permanece nulo y no se convierte en cero.

| Feature | Fórmula | Unidad | Dirección económica | Ventana | Disponibilidad y límites |
|---|---|---|---|---|---|
| transaction_count | número de movimientos booked | conteo | calidad/actividad, no salud | mes | observado |
| active_days | días distintos con movimientos | días | cobertura, no salud | mes | observado |
| operating_inflow | suma positiva de collection, bulk_collection, pos_settlement, cash_settlement | moneda | mejor si mayor solo frente a salidas | mes | observado; no equivale a ingresos |
| operating_outflow | valor absoluto de payment, bulk_payment, utility, salary, tax, social_security, fee negativos | moneda | contexto | mes | observado; no equivale a gastos |
| operating_net_flow | operating_inflow - operating_outflow | moneda | mejor si mayor | mes | observado; excluye financiación/traspasos |
| gross_flow | suma de importes absolutos de todos los booked | moneda | escala, no salud | mes | observado |
| reconciled_share | proporción con conciliación o contabilización completada | proporción | calidad operativa | mes | 61,56 % del campo es nulo; no puntúa salud |
| missing_category_share | proporción sin categoría | proporción | cobertura | mes | observado |
| months_observed_6m | meses con extracción en los últimos 6 meses calendario | meses | cobertura, no salud | 6m | ausentes no se rellenan |
| operating_inflow_3m | suma de operating_inflow | moneda | evidencia, no salud por sí sola | 3m | observado; se conserva aunque no haya score |
| operating_outflow_3m | suma de operating_outflow | moneda | evidencia, no salud por sí sola | 3m | observado; se conserva aunque no haya score |
| operating_activity_3m | inflow 3m + outflow 3m | moneda | suficiencia de señal | 3m | cero implica ausencia de actividad operativa identificada |
| operating_smaller_side_share_3m | min(inflow, outflow) / max(inflow, outflow) | ratio | suficiencia de señal | 3m | adimensional; evita umbrales dependientes de divisa |
| operating_signal_status | no activity / one-sided / imbalanced / sufficient | categoría | elegibilidad, no salud | 3m | `sufficient` exige ambos lados y que el menor represente al menos 1 % del mayor |
| operating_flow_balance_3m | (inflow - outflow) / (inflow + outflow) | ratio [-1, 1] | mejor si mayor | 3m | solo si `operating_signal_status = sufficient`; sin floor monetario |
| inflow_outflow_ratio_3m | inflow / outflow | ratio | descriptiva | 3m | solo con señal suficiente; nulo si el denominador es cero o casi cero en términos relativos |
| outflow_cv_6m | desviación estándar / media de operating_outflow | ratio | mejor si menor, con cautela | 6m | media > 0 y al menos 2 observaciones; sin floor monetario |

## Score baseline

Versión `score-v0.3-operating-sufficiency`:

`score_preclip = 50 + 0,70 × C_flow_balance + 0,30 × C_stability`, donde cada `C` es una transformación `tanh` acotada a ±50 antes del peso. El score final se recorta a 0–100 y conserva `score_intercept`, `raw_contribution_sum`, `preclip_score` y `clip_adjustment` para reconstrucción exacta. `inflow_outflow_ratio_3m` es descriptivo y no aporta una contribución.

Elegibilidad: al menos 3 meses observados en la ventana de 6, actividad operativa identificada en ambos sentidos, soporte relativo mínimo del 1 % para el lado menor, balance operativo finito y estabilidad de salidas finita. `partial` significa siempre score calculado con 3–5 meses; `available`, score calculado con 6/6; cualquier fila sin score es `insufficient_data` con `score_reason` explícito. La ausencia de salidas o entradas no se puntúa como mala salud ni como fortaleza: queda como señal financiera insuficiente.

La trayectoria es `score(t) - score(t-3)`: improving si ≥ +4, deteriorating si ≤ -4, stable en otro caso. Una alerta exige además persistencia: al menos dos pasos mensuales en la misma dirección y |delta 3m| ≥ 8. `possible_blip` se conserva como régimen informativo sin alerta. `alert_kind` usa exclusivamente los enums del contrato: `improvement` o `deterioration`.

## Features bloqueadas

- DSO/DPO, aging de clientes/proveedores y pago en plazo: dirección de factura no resuelta.
- Caja histórica, runway y colchón: no hay snapshots mensuales completos ni reconstrucción validada.
- Servicio histórico de deuda: las 87 configuraciones son actuales y parciales.
- Grupo consolidado: FX y transferibilidad de caja entre filiales no demostradas.
- `pending_amount` histórico y estado final de factura: contienen información futura respecto al corte.
