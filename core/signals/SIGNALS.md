# Señales activas

El motor utiliza 21 señales repartidas en cinco pilares. Cada señal produce un valor mensual por grupo,
se convierte a 0–100 mediante umbrales fijos y se combina con las demás señales disponibles de su pilar.
Una señal sin datos queda ausente: nunca se convierte en cero.

## Liquidez — 25 % del score

- **Días de caja (50 % del pilar):** caja al cierre dividida por las salidas operativas medias. Más días es mejor.
- **Caja negativa (30 %):** proporción de los últimos tres meses con caja negativa. Menos es mejor.
- **Tendencia de caja (20 %):** compara la caja media reciente con los tres meses anteriores.

## Disciplina de pago — 20 %

- **Facturas de proveedor pagadas tarde (40 %):** porcentaje del importe pagado fuera de plazo.
- **Días de retraso (25 %):** retraso medio de los pagos a proveedores.
- **Regularidad de Seguridad Social (20 %):** presencia recurrente de estos pagos en seis meses.
- **Regularidad de impuestos (15 %):** presencia de pagos fiscales durante doce meses.

## Cobros — 15 %

- **Cartera vencida (35 %):** facturas de clientes vencidas sobre facturas abiertas.
- **Clientes que pagan tarde (30 %):** porcentaje cobrado fuera de plazo.
- **Cobrado sobre facturado (35 %):** importe cobrado frente a lo facturado en tres meses.

## Deuda — 20 %

- **Utilización de líneas (35 %):** deuda dispuesta sobre financiación concedida.
- **Servicio de deuda (35 %):** repagos, intereses y comisiones frente a cobros operativos.
- **Coste financiero (30 %):** comisiones e intereses sobre salidas operativas.

## Actividad — 20 %

- **Crecimiento de cobros (35 %):** cobros de tres meses frente a los tres anteriores.
- **Volatilidad de cobros (35 %):** variación de los cobros respecto a su media.
- **Flujo operativo neto (30 %):** diferencia entre cobros y pagos respecto a los pagos.

La lista que realmente entra en producción está en `active.py`. Crear un módulo nuevo no modifica el score
hasta que su señal se añada explícitamente allí.

## Señales de desviación (`*_z`)

Cada pilar lleva una señal que mide el valor actual **frente a la base que el propio grupo
tenía establecida**: mediana y MAD de los 12 meses anteriores, excluyendo el mes en curso.
Pesan un 20 % de su pilar.

Existen porque el nivel solo no distingue dos situaciones muy distintas: un grupo con 15 días
de colchón que *siempre* ha tenido 15 está estable; uno que venía de 60 y ha caído a 15 está en
problemas. Son las únicas señales que consumen historia larga.

Las anclas son **asimétricas** a propósito: mantenerse igual vale 70 —la estabilidad es buena
noticia para quien presta, y no debe lastrar a una empresa sólida—, deteriorarse cae rápido y
mejorar sube poco. Necesitan 6 meses previos; antes quedan ausentes y su peso se reparte.

| señal | pilar | mide |
|---|---|---|
| `buffer_days_z` | Liquidez | colchón de caja frente a su base |
| `ap_days_late_z` | Disciplina de pago | paga más tarde de lo que acostumbra |
| `ar_overdue_z` | Cobros | mora de clientes frente a la habitual |
| `feeint_share_z` | Deuda | coste financiero frente al habitual |
| `op_in_z` | Actividad | cobros frente a su base |

## Encima de estas: las cinco perspectivas

`group_signals.py` calcula cinco lecturas sobre el nivel que producen las 16 señales de arriba
—salud actual, trayectoria y presión, aprendizaje entre pares, posición en la cohorte y salud de la
red de cobro—, cada una con su propia confianza. El motor las aplica como ajustes acotados en una
segunda pasada. Cuáles están activas y por qué, en [`../engine/README.md`](../engine/README.md).
