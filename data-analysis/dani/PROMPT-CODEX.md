# Codex: análisis financiero y temporal completo del dataset Embat

Actúa como agente de código y data scientist senior con acceso local a archivos, terminal y notebooks. Implementa y EJECUTA el análisis; no entregues solo un plan. Responde e informa en español. Dani revisará visualizaciones contigo y llevará el handoff a Hermes. No necesitas iniciar otros harnesses.

## Contexto y fronteras

Repo: `/Users/danik/projects/hackspain-2026`.
Tu área exclusiva: `data-analysis/dani/` (minúsculas). Hay otra sesión creando el dashboard y compañeros trabajando en datos/modelos. Inspecciona git status e instrucciones aplicables antes de empezar. No hagas checkout, reset, stash, pull sobre cambios ajenos, commit/push o deploy. No modifiques otros directorios, PROBLEM.md ni el contrato del dashboard. Puedes leerlos y proponer cambios en tus entregables.

Leer: PROBLEM.md (distinguir brief y conjeturas), docs/dani/analisis-csv-y-scoring.md, docs/dani/planning-provisional.md, data-analysis/README.md, README.md de esta carpeta y el diccionario REAL del dataset. Si existe docs/dani/contrato-dashboard-v1.md, leerlo para proponer exports compatibles, sin editarlo ni aceptar semántica financiera no respaldada.

El reto requiere score mensual de salud financiera, mejora y deterioro, trayectoria, bache frente a cambio persistente, explicación y generalización a entidades nuevas. No es un detector de quiebras. Forecasting es una tesis auxiliar, no sustituto del score.

## Datos y entorno

ZIP recibido: `/Users/danik/.hermes/profiles/founder/attachments/output_hackspain_data-2.zip`.
Contiene output/ con ocho CSV y data_dictionary.md. El compañero estaba subiéndolos a GitHub: buscar primero si ya hay una copia local completa. Si no, extraer de forma segura en tu `data/raw/` ignorado, comprobando rutas y sin sobrescribir datos existentes. Registrar fuente, hash, archivos y versión; no descargar desde servicios externos ni esperar al compañero si el ZIP está disponible.

Entorno uv preparado en esta carpeta, Python 3.12. Usar `uv run ...` desde aquí o `uv run --project <ruta> ...`. No usar pip global. Puedes instalar más librerías con `uv add`, actualizar lock y documentar por qué; no comprar servicios ni buscar credenciales en otros proyectos. Ya hay stack dataframe/SQL, estadísticas, notebooks, plots, validación, boosting, SHAP, ruptures y forecasting; ver README. No dar por probada compatibilidad de un modelo solo por haberlo instalado.

El diccionario afirma: 1.286 sociedades, 250 grupos, 2.556.437 transacciones, 897.894 facturas, 5.987 productos bancarios, 2.239 de deuda, 87 configuraciones de amortización y 7.996 balances. Verifica todos los conteos programáticamente, sin darlos por ciertos. No hay etiquetas/lista de test en el ZIP observado: buscar de nuevo en fuentes locales, no inventarlas.

## Resultado que buscamos

Un análisis reproducible y visual que permita al equipo decidir qué señales y scores usar, qué datos son fiables y qué hipótesis merece entrenar. No una colección de gráficos genéricos ni una plataforma de ML. Produce resultados intermedios útiles pronto y profundiza donde la evidencia lo justifique.

### 1. Auditoría real completa

- Inventario, filas, tamaños, tipos inferidos frente a declarados, claves únicas/duplicadas, nulos, dominios categóricos y rangos.
- Integridad referencial entre empresas/grupos/productos/movimientos/saldos/deuda; detectar solapes entre tablas de productos. Agregar antes de joins para evitar multiplicación de importes.
- Cobertura por sociedad, grupo, cuenta, moneda y mes. No rellenar ausencia de extracción como actividad cero sin evidencia.
- Perfil de signos, importes, outliers, estados booked/pending, categorías, fechas, timezone si existe, cambios de frecuencia y duplicados potenciales.
- Fechas de alta son onboarding, no fundación. Los saldos pueden usar un snapshot previo al 1 de septiembre de 2026: no tomar una fecha única por defecto.
- Emitidas/recibidas: el diccionario de invoices NO especifica sentido. Investiga valores/signos/contrapartes/conceptos y consistencia cruzada. Documenta grado de certeza; no inferir venta vs compra de invoice vs credit_note ni de un único ejemplo. Si no hay identificación fiable, bloquear esas métricas y entregar una pregunta concreta.
- FX: hay exchange_rate en movimientos y facturas, pero no asumir dirección/base ni que todos los importes estén en moneda del producto. Probar hipótesis y mantener cifras por moneda si no se resuelve.
- Conciliación: counterparty_id no es una relación uno-a-uno factura-movimiento. Evitar matches ambiguos por importe/fecha; medir cobertura de enlaces realmente demostrables.
- Deuda: cobertura exacta de las 87 configuraciones por producto, sociedad e importe; condiciones actuales no son historia. total_periods no significa plazos restantes; tipos variables pueden ser spreads, no tipos efectivos completos.
- Exponer anomalías del generador, posibles shortcuts por IDs, ERP, fechas o texto. No explotar artefactos como si fueran señales financieras robustas.

### 2. EDA financiero y temporal

Crear notebooks ejecutados con gráficos legibles (Plotly y estáticos donde convenga), comentarios y conclusiones basadas en datos. Usar vistas agregadas: no incrustar millones de puntos en HTML/notebooks.

Estudiar composición y concentración de flujos, series por empresa y grupo, actividad operativa vs financiación/traspasos, aging y comportamiento de pago cuando el sentido y la historia lo permitan, deuda y liquidez disponible, heterogeneidad, cobertura, estacionalidad y cambios persistentes. Mostrar casos de distintas escalas y cobertura, no solo los más bonitos.

Separar cobros de ingresos y pagos de gastos; no fabricar ratios contables sin sus entradas. Distinguir colchón frente a salidas y runway por consumo neto. DSO/DPO operativos deben definirse, no confundirse con ratios contables estándar; sin inventario no tenemos CCC completo.

### 3. Dataset mensual de features con trazabilidad

Implementar funciones reutilizables con tests y diccionario de features: fórmula, fuente, unidad, signo económico, ventana, disponibilidad, cobertura, tratamiento de ausentes y limitaciones. Features básicas de nivel, pendientes/cambios, persistencia y dispersión. Empezar por pocas de alta calidad, ampliar si hay valor.

Grano sociedad/mes/moneda; agregación de grupo solo con semántica y FX justificadas. No sumar caja como si fuera automáticamente transferible entre filiales. No promediar scores de grupo arbitrariamente.

Atención crítica al look-ahead:
- pending_amount, estados finales y deuda actual no pueden copiarse a cada mes histórico.
- Reconstrucción de caja desde saldo final solo con movimientos completos, fecha exacta y consistencia; validar. No llamar disponible online a una reconstrucción que no lo demuestra.
- Fechas de pago futuras solo sirven para evaluar resultados, no para features en cortes anteriores.
- Pagos parciales y ausencia de snapshots pueden impedir reconstrucción exacta: etiquetar no reconstruible y usar una variante con menos datos.
- Disponibilidad por tiempo de negocio no garantiza disponibilidad real de ingestión.
- Un bache solo queda confirmado tras observar reversión; separar sospecha online de etiqueta retrospectiva.

### 4. Comparar tesis de score y trayectoria

Primero verificar si hay etiquetas/resultados oficiales y formato de test en el repo. Si no hay, no detener EDA ni fabricar targets oficiales.

Construir un baseline explicable de salud (nivel + trayectoria, ambas direcciones) con contribuciones exactas y confianza/cobertura separada. Probar al menos una alternativa razonada si es viable: pesos/normalización robusta, modelo aditivo supervisado si hay etiqueta, o detección persistente de cambio sobre señales.

Analizar sensibilidad a pesos, ventanas, normalización, outliers, faltantes y redundancia. No fijar umbrales por decorar semáforos. Mostrar nivel y tendencia por separado para no ocultar una empresa deteriorándose detrás de un score alto.

Si no hay etiquetas, reportar evaluación como consistencia/sensibilidad o proxies explícitos. Aprender nuestra regla no prueba predicción real. No presentar percentiles o score como probabilidad calibrada de default. No dejar que mala cobertura automáticamente signifique mala salud.

### 5. Forecasting y evaluación, proporcionados a datos

Evaluar una baseline ingenua/estacional y una alternativa sencilla (estadística o MLForecast/boosting) sobre flujos cuyo significado sea fiable. Comparar calendario conocido y residual únicamente si podemos evitar doble conteo de facturas, deuda y recurrencias. No forzar un modelo para todas las series.

Priorizar series/segmentos con cobertura y documentar selección. Forecasts temporales no validan por sí mismos salud financiera. TimesFM/Chronos o PyTorch son opcionales si aportan una tesis concreta; no dedicar el trabajo a instalar pesos enormes o ajustar muchas arquitecturas. Comprueba licencia, RAM/hardware y coste antes. Sin servicios de pago.

Validación: grupos enteros separados, cortes temporales, train-only para normalización/imputación/selección. Distinguir evaluación de empresas nuevas de forecasting sobre historia disponible de una empresa. Conservar conjunto final intacto. Si combinas modelos, usar predicciones out-of-fold con aislamiento temporal/grupal apropiado.

Reportar métricas, cobertura, baseline, coste y errores por segmentos; intervalos de incertidumbre si hay evidencia suficiente. Anticipación solo con evento y fecha de referencia independientes y definidos; no demostrarla con cambio retrospectivo que vio toda la serie.

### 6. Entregables y handoff

Dentro de esta carpeta:
- README actualizado con comandos exactos para reproducir.
- Notebooks ejecutados y narrativa visual, sin outputs gigantes.
- Código de preparación/features/scoring/evaluación reutilizable y tests focalizados.
- Informe de calidad y diccionario de features.
- RESULTS.md: hallazgos, comparación de tesis, métricas realmente ejecutadas, decisiones recomendadas, límites y preguntas a organización.
- HANDOFF.md breve para pegar/adjuntar a Hermes: qué está listo, comandos y resultados, archivos relevantes, riesgos, siguiente decisión.
- Exports y manifiesto para integrar con dashboard: JSON ligero/Parquet según tamaño; versión, corte, entidad, unidad/moneda, cobertura, observed/reconstructed/predicted, score y contribuciones donde estén calculados. Proponer contrato compatible sin modificar el backend.
- Gráficos HTML/PNG y artefactos grandes en artifacts/ ignorado; fuentes y reportes ligeros fuera de esa carpeta para conservarlos. Indexar rutas duraderas en README. No confiar en /tmp como único entregable.

Publicar resultados parciales al terminar auditoría y features, sin esperar a todos los modelos. El informe debe distinguir hechos, hipótesis comprobadas/refutadas, supuestos y bloqueos. No incluir caminos absolutos de Dani como única manera de reproducir: configura fuente de datos por argumento/env.

## Verificación obligatoria y criterio de parada

Ejecutar scripts/notebooks desde kernel limpio; ejecutar tests sobre signos, joins/cardinalidad, monedas, ventanas/cortes, ausentes y aditividad de explicaciones. Hacer una reproducción end-to-end del pipeline final. Comprobar que gráficos/tablas tienen unidades, cortes y valores reales; abrir HTML o renderizar figuras cuando sea necesario.

Si hay revisión independiente disponible dentro de Codex, enfócala en leakage, doble conteo y semántica; no crear múltiples capas de revisión. No afirmar que hubo revisión si no se ejecutó.

El presupuesto no es hacer todos los modelos imaginables. Parar cuando haya auditoría completa, features trazables, score baseline explicado, comparación acotada o bloqueo demostrado, evaluación honesta y handoff reproducible. Tras dos intentos fallidos del mismo enfoque, registrar bloqueo y continuar con alternativa útil.

ENTREGABLE FINAL PARA DANI:
Resumen de hallazgos accionables; ruta de notebooks/informe/HANDOFF; comandos verificados; tabla breve de experimentos y evidencia; preguntas que bloquean métricas; recomendación concreta para el equipo y para el contrato del dashboard. Sin commit/push ni cambios fuera de data-analysis/dani/.
