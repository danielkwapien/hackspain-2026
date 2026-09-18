# Análisis del esquema CSV y propuesta de scoring

Estado: propuesta de Dani, revisada contra `PROBLEM.md` el 18 de septiembre de 2026. No se han inspeccionado los CSV ni su diccionario. Los nombres de features de este documento son propuestos, no campos verificados.

## 1. Encaje con el reto

El brief transcrito en [PROBLEM.md](../../PROBLEM.md#2-el-brief-transcrito-íntegro-pdf) pide un score de salud financiera que refleje nivel y trayectoria mensual, detecte mejora y deterioro, diferencie baches de cambios persistentes y explique cada cambio. Debe generalizar al test oculto y sostener un producto vendible y navegable.

El apartado de datos anuncia 1.286 sociedades en 250 grupos y 24 meses de historia; la cabecera habla de 250 empresas. La unidad del leaderboard sigue pendiente: no asumir que grupo es un hecho confirmado. Se enumeran ocho CSV y un diccionario Markdown aunque el texto dice nueve CSV; la posible existencia de etiquetas es una pregunta, no un dato.

Estos ficheros encajan con salud financiera observada desde tesorería. No equivalen a estados contables completos. La previsión de caja complementa, pero no reemplaza, la trayectoria del score.

## 2. Mapa de datos

| Fichero | Grano anunciado | Uso y señales candidatas |
|---|---|---|
| groups.csv | Grupo empresarial | Jerarquía, dispersión de salud entre filiales, concentración de caja/deuda |
| companies.csv | Sociedad | company_id, grupo, país, moneda, ERP y fecha de alta; segmentación y cobertura |
| banking_products.csv | Cuenta/producto | Clasificación de liquidez, concentración bancaria, moneda y naturaleza del saldo |
| debt_products.csv | Financiación | Deuda por tipo, pendiente, límites/utilización cuando proceda, exposición contingente |
| debt_schedule_config.csv | Condiciones de deuda con cuadro | Calendario de cuotas, principal/intereses y próximos vencimientos |
| transactions.csv | Movimiento | Cobros/pagos realizados, recurrencia, tendencia, volatilidad, contrapartes |
| invoices.csv | Factura o vencimiento, por confirmar | Pendientes, aging, fechas y comportamiento de cobro/pago |
| balances.csv | Saldo de producto al corte | Foto al 1 de septiembre de 2026, no balance contable completo |
| data_dictionary.md | Definiciones | Claves, tipos, signos, unidades, estados, fechas y restricciones |

No hacer un join de movimientos y facturas solo por company_id: multiplicaría filas e importes. Mantener hechos separados y agregarlos al grano requerido antes de unirlos. Las relaciones entre productos, deuda y movimientos deben verificarse para evitar duplicar la misma exposición.

Propuesta de flujo: originales → hechos validados → features sociedad/mes/moneda → consolidación compatible → score y trayectoria → exports para dashboard.

## 3. Features candidatas

### Liquidez

- Caja utilizable, separada de inversiones no líquidas, tarjetas y otros pasivos.
- Colchón de caja: caja / salidas operativas medias por día o mes; explicitar unidad y ventana.
- Runway: caja / consumo neto de caja positivo; no forzar un valor si la empresa genera caja.
- Flujos netos a distintas ventanas, persistencia de déficits y mínimos intrames si la cobertura permite reconstruirlos.
- Concentración bancaria y headroom de crédito realmente disponible, solo con límites/dispuesto/restricciones conocidos.

### Cobros y pagos

- Pendiente emitido y recibido; proporción del pendiente vencido, por importe.
- Aging con tramos no solapados; separar no vencido y vencido.
- Días entre emisión y liquidación y retraso frente a vencimiento, por dirección; mediana, percentiles y ponderación por importe cuando proceda.
- Proporción liquidada en plazo; concentración en contrapartes; calendario de vencimientos.
- No eliminar las facturas abiertas del análisis: estudiar su antigüedad por separado. Un futuro modelo de tiempo hasta cobro debe tratar la censura.
- No llamar DSO/DPO contable a cualquier media de días de facturas pagadas: definir la métrica operativa utilizada. DSO−DPO no es el CCC completo sin inventario.

### Financiación

- Deuda pendiente por naturaleza, cuotas próximas y concentración de vencimientos.
- Utilización de líneas revolving; no interpretar pendiente/concedido de un préstamo amortizable como utilización de línea.
- Coste de financiación si conocemos tipo efectivo, saldo y condiciones aplicables.
- Cobertura de compromisos con caja/cobros previstos como proxy explícito, no DSCR contable certificado.
- Avales como exposición contingente, no cuota cierta. Factoring/confirming requieren distinguir liquidez recibida y obligación restante.

### Dinámica y trayectoria

- Evolución de cobros/pagos operativos, excluyendo financiación, aportaciones y transferencias internas identificables.
- Pendientes a varias ventanas, aceleración, persistencia y variabilidad.
- Cambios respecto a la propia historia y comparaciones interanuales donde exista cobertura.
- Recurrencia, dependencia de clientes y cambios de patrón. Dos años permiten poca evidencia sobre estacionalidad anual: no prometer robustez sin medirla.
- Estados candidatos: sólida/estable, mejorando, deteriorándose y posible bache. La reversión se confirma después; en tiempo real no etiquetar un shock como bache seguro usando su futuro.

### Calidad separada del score financiero

Cobertura histórica, frescura cuando sea observable, claves huérfanas, faltantes, conciliación, categorización y cobertura de deuda. Pocos datos no equivale a mala salud. Devolver confianza/cobertura y motivos de insuficiencia por separado.

## 4. Guardrails financieros y temporales

- Cobros no son ingresos contables; pagos no son gastos contables. No derivar EBITDA, ROE, ROA, deuda/patrimonio, current ratio, quick ratio o Altman sin sus entradas reales.
- No sumar factura liquidada y movimiento bancario como dos flujos. No duplicar una cuota entre calendario y predicción de pagos recurrentes.
- No sumar monedas sin política FX. Si no hay tipos, mantener vistas por moneda. Una conversión fija para una demo solo puede ser un supuesto visible, no verdad histórica.
- Consolidar no implica caja transferible entre sociedades; mostrar riesgo individual y restricciones desconocidas. Eliminar intercompany solo cuando sea identificable.
- Saldo final menos movimientos posteriores permite reconstrucción histórica únicamente con cobertura completa y consistencia de signos, fechas y ajustes. Contrastar con balances independientes si existen.
- La foto final de facturas, límites o condiciones no da automáticamente su historia. No usar pendingAmount o estado final en meses pasados. Pagos parciales y cambios contractuales pueden impedir reconstrucción exacta.
- Trabajar con fecha de corte explícita; distinguir fecha de negocio de momento de disponibilidad. La demo del dataset no debe presentarse como banca en vivo.
- Importes y conciliación requieren representación monetaria exacta (decimales o unidades menores por divisa); redondear solo para presentación. Los modelos pueden usar floats sobre features normalizadas.

## 5. Scores: hipótesis a comparar

Separar métrica oficial de evaluación, score de producto y loss del modelo. Cambiar la definición del score no demuestra que haya mejorado la predicción.

### A. Índice explicable

Pocos pilares: liquidez, cobros/pagos, compromisos, dinámica y resiliencia. Features transformadas a escalas compatibles, con dirección y contribución explícitas. Escala candidata 0–100, mayor es mejor; acompañar de tendencia y régimen.

Pesos y umbrales provisionales hasta inspección de datos. Evitar duplicar señales correlacionadas, convertir ausentes en ceros o dejar que buenos indicadores secundarios oculten alertas críticas. Mostrar sensibilidad a pesos y versión del score. Ajustar normalizadores en entrenamiento, no en el test oculto.

### B. Supervisado, si existen etiquetas

Regresión regularizada, modelo aditivo o boosting pequeño sobre features financieras y temporales. Mantener todos los miembros del grupo en el mismo fold y respetar los cortes temporales. La explicación debe corresponder al modelo que produce el número; las contribuciones predictivas no prueban causalidad.

### C. Híbrido

Índice de dominio más calibración supervisada o señales de previsión. Evaluar ablaciones antes de añadir complejidad. Un modelo que aprende nuestras propias etiquetas heurísticas reproduce la regla, no valida anticipación real.

La probabilidad de tensión de caja puede ser una señal adicional, no la definición completa del reto. No presentar un score o escenarios de estrés como probabilidad calibrada de quiebra.

## 6. Forecasting y combinación

Comparar histórico puro, calendario financiero e híbrido:

1. Cuotas y compromisos conocidos al corte.
2. Facturas abiertas, con fecha esperada ajustada por comportamiento observado.
3. Nuevos flujos aún no registrados, estimados estadísticamente.
4. Escenarios explícitos de retrasos y cambios de actividad.

Partir de caja inicial y acumular flujos sin solapar componentes. Un forecast de todos los cobros históricos ya contiene pagos de facturas: no añadir encima todas las facturas abiertas sin definir qué residual se predice.

Modelos: ingenuo/estacional como suelo; StatsForecast; MLForecast con LightGBM/CatBoost; TimesFM o Chronos zero-shot como tesis paralela; redes pequeñas en PyTorch solo si aportan. PyTorch es framework, transformer arquitectura y TimesFM familia de modelos.

Ensembles: comenzar con medias de predicciones comparables; no mezclar scores heterogéneos sin calibrar. Pesos, umbrales y calibración solo en validación. Para stacking, usar predicciones fuera de muestra respetando tiempo y grupos; mantener una evaluación final intacta.

## 7. Librerías investigadas, no probadas

| Herramienta | Encaje | Límite |
|---|---|---|
| pandas | EDA, agregados, ventanas y features | Medir volumen antes de asumir que todo cabe en memoria |
| Pandera | Esquemas y reglas de validación | No sustituye las reglas semánticas financieras |
| numpy-financial | pmt, ipmt, ppmt para deuda estándar | No motor contractual universal; comprobar frecuencia, tipo y plazos restantes |
| StatsForecast | Baselines estadísticos | Disponibilidad de covariables futuras y estacionalidad por verificar |
| MLForecast + boosting | Lags, rolling, calendario, covariables | No pasar información futura desconocida como covariable |
| Plotly | Exploración interactiva en notebooks/Codex | No obliga al dashboard React a usar la misma librería |
| FinanceToolkit | Referencia de ratios clásicos/custom | Muchos ratios requieren estados contables que no tenemos |

Recomendación mínima: pandas + Pandera + numpy-financial + Plotly; añadir forecasting cuando haya datos. No instalar una pila completa por anticipado.

Fuentes consultadas:
- https://numpy.org/numpy-financial/latest/
- https://pandera.readthedocs.io/en/stable/
- https://www.jeroenbouma.com/projects/financetoolkit/docs/ratios
- https://nixtlaverse.nixtla.io/mlforecast/docs/how-to-guides/exogenous_features.html
- https://nixtlaverse.nixtla.io/statsforecast/docs/getting-started/getting_started_complete.html
- https://github.com/google-research/timesfm
- https://github.com/amazon-science/chronos-forecasting

En la consulta de la sesión, el README de TimesFM anunciaba 3.0 con pesos no comerciales/no producción, frente a pesos hasta 2.5 Apache-2.0. Revalidar licencia del checkpoint elegido y reglas del hackathon antes de usarlo. No hay benchmark ni compatibilidad local verificados.

## 8. Primer análisis cuando lleguen los datos

Leer diccionario; inventariar filas/tipos/claves/monedas; verificar cobertura por sociedad y mes; cuantificar faltantes/duplicados; entender signos y estados; localizar etiquetas/test; estudiar distribuciones y casos extremos; validar reconstrucciones; crear dataset de features y splits compartidos. Entregar conclusiones que cambien decisiones, no solo gráficos.
