# Planning provisional del hackathon

Propuesta de Dani, 18 de septiembre de 2026. No asigna tareas de forma definitiva ni fija horarios oficiales. Fuente principal: [PROBLEM.md](../../PROBLEM.md); detalle analítico en [analisis-csv-y-scoring.md](analisis-csv-y-scoring.md).

## 1. Ajuste tras leer el problema

La primera conversación se hizo sin acceso al artefacto de Claude. Leído el brief transcrito, la prioridad es score mensual de salud con trayectoria, mejora/deterioro, explicación y generalización a empresas no vistas. Forecasting de caja es complementario, no el objetivo único ni un sustituto del score.

Obligatorios del brief: predicción del test oculto, ambas direcciones, trayectoria, explicación, producto vendible, comprador identificado y demo navegable. Anticipación medida y monitor proactivo son bonus. Acierto, oportunidad y valor del producto tienen igual importancia según el texto transcrito; no inventar una fórmula de leaderboard.

Por confirmar con organización: etiquetas, unidad empresa/grupo, métrica y formato del test, acceso al dataset, deadline exacto y reglas de envío. Las indicaciones de vídeo/plataforma de PROBLEM.md proceden de la investigación del compañero: comprobar el procedimiento vigente antes de la entrega. Los horarios detallados del artefacto no se han verificado en esta sesión.

## 2. Tesis de producto

Dashboard de salud financiera y tesorería para el CFO/tesorero de un grupo: qué sociedades necesitan atención, cuáles mejoran, por qué y qué hacer para investigar el cambio. Embat es una posible vía de comercialización como módulo integrado; propuesta, no acuerdo comercial.

El producto no debe quedarse en tarjetas: bandeja priorizada de señales de mejora/deterioro, drill-down a evidencias y comparación temporal. Escenarios de caja como ampliación si aportan y hay tiempo. Nada de pagos reales, financiación concedida o promesas de ahorro sin evidencia.

## 3. UI y stack propuestos por Dani

- React + Vite + TypeScript para frontend.
- Fastify para API.
- shadcn/ui como sistema base: reutilizar primitivas y componentes, incluidos Charts; no crear un segundo sistema visual.
- Python en data-analysis/ para features, score, experimentos y forecasting.
- Integración sencilla mediante exports versionados; Fastify sirve resultados y no reimplementa cálculos financieros ni entrena por petición.
- Persistencia y estructura del workspace pendientes de inspección; evitar añadir servicios innecesarios.

Referencias visuales vistas en conversación: terminal financiero oscuro con mapa de activos y paneles vinculados; dashboard Embat oscuro con curva de caja, barras de entradas/salidas, realizado/previsión y detalle operativo. Son referencias de jerarquía y densidad, no assets propios ni autorización para copiar marca. Capturas no incluidas en el repo.

### Pantallas prioritarias

1. **Grupo/cartera:** ranking o tabla filtrable, trayectoria, alertas y cobertura; mapa opcional. No consolidar monedas sin FX ni promediar scores sin definir agregación.
2. **Empresa:** score y serie mensual como foco, tendencia/régimen y descomposición del cambio; caja y compromisos como apoyo; facturas/deuda y evidencias.
3. **Monitor:** cambios relevantes en ambas direcciones con fecha, motivo y enlaces a señales. Sin afirmar monitorización en vivo si solo hay un corte estático.

Estados: carga, vacío, error, datos insuficientes y fuente/fecha de corte. Fixture sintético solo para desarrollo, separado y rotulado; no presentarlo como resultado del dataset o benchmark real.

## 4. Paralelización entre cinco personas

La independencia está en las hipótesis, no en cambiar datos y evaluación para cada una. Distribución orientativa:

| Frente | Primera entrega |
|---|---|
| Dani: datos/EDA/evaluación en Codex local | Diccionario interpretado, features base, splits y hallazgos visuales |
| Score explicable y clasificación | Índice con contribuciones; supervisado si hay etiquetas |
| Trayectoria y forecasting tabular | Baselines, lags, persistencia, cambios y forecasts útiles |
| Hipótesis alternativa | TimesFM/Chronos u otro enfoque justificado, evaluado con el mismo protocolo |
| Producto e integración | Dashboard/API sobre contrato compartido; casos narrativos y demo |

El frente de producto empieza pronto: no dejar integración para el final. Ensembles cuando existan predicciones comparables; redirigir esfuerzo desde tesis que no aporten. Si otra distribución encaja mejor con las fortalezas del equipo, cambiarla: no hay responsables confirmados salvo la preferencia de Dani por EDA en Codex.

## 5. Contrato compartido mínimo

- Snapshot de datos y semántica financiera común.
- Grano sociedad/mes y soporte de grupo; contrato final del leaderboard pendiente.
- Salida propuesta: entidad/tipo, fecha de corte, versión de datos/modelo, score, tendencia, régimen, contribuciones, variación respecto al corte anterior, calidad y alertas. Son campos de interfaz propuestos, no esquema oficial.
- Forecasts separados: origen, horizonte, moneda/unidad, predicción y cuantiles si existen.
- Explicaciones del modelo que produce el score; sin justificar un modelo con contribuciones de otro.
- Cada experimento declara hipótesis, configuración, features, splits, resultados y costes.

## 5.1. Nueva tesis a explorar: categorías no supervisadas

Insight de Dani: al definir nosotros el score, aprenderlo con supervisión solo reproduciría nuestra regla, sin validación externa. Incluir como alternativa **clustering de perfiles financieros y trayectorias**, sin imponer de antemano categorías derivadas del score. Ver fundamentos y cautelas en [análisis, sección 5.D](analisis-csv-y-scoring.md#d-categorías-mediante-aprendizaje-no-supervisado--insight-de-dani).

Experimento propuesto, todavía no ejecutado: features fiables y normalizadas → baseline de clustering → perfiles explicables → estabilidad temporal y asignación a grupos no vistos → contraste con el índice de reglas. Evaluar si los perfiles y sus transiciones aportan decisiones útiles, no solo separación geométrica. No interpretar cluster ni anomalía como riesgo automáticamente.

Mantener supervisado para etiquetas oficiales independientes o resultados futuros observables; no confundir esta crítica al target autodefinido con descartar forecasting. Esta nota añade una tesis al planning, no lanza trabajo ni cambia el contrato del dashboard.

## 5.2. Objetivo de presentación: letras y +/−

Dani concreta que el resultado debe leerse como un scoring/rating empresarial: grados ordenados con letras y modificadores +/−, análogos en presentación al rating bancario de clientes. Mantener el score numérico y su explicación como detalle. Escala y umbrales por definir y validar; no hay equivalencia acreditada con ratings externos.

La categoría no puede ser simplemente el número de un cluster: hay que justificar el orden financiero. Separar grado actual, modificador dentro del grado y trayectoria temporal. Mostrar «sin calificación» ante evidencia insuficiente. Esta propuesta se documenta para la siguiente iteración; no modifica por sí misma el contrato ni los exports actuales del dashboard.

## 6. Evaluación

Dos ejes: grupos no vistos y tiempo. Mantener filiales del mismo grupo juntas, y limitar información al corte de cada predicción. Un split temporal solo no prueba generalización a nuevas empresas; un GroupKFold solo no prueba anticipación temporal.

Si hay etiquetas: evaluar nivel/ranking según el target oficial y separar mejora/deterioro. Si no: consistencia financiera y validación contra eventos observables explícitamente definidos, sin vender etiquetas heurísticas como ground truth.

Medir estabilidad/falsas alertas, tendencia, cobertura y anticipación cuando haya eventos de referencia. Definir evento y criterio antes de ajustar el detector. Un change-point calculado con toda la serie sirve para análisis retrospectivo, no para afirmar detección online adelantada.

No entrenar normalizadores ni seleccionar features con el test oculto. Usar predicciones out-of-fold temporales/grupales para stacking y una evaluación final no usada para elegir pesos. Métricas de forecasting son auxiliares: no sustituyen la evaluación del score.

## 7. Ritmo por bloques, no horario oficial

1. Arranque común: leer brief/diccionario, aclarar leaderboard, inspeccionar muestra y fijar contrato/evaluación.
2. Primera vertical: features mínimas → score explicable → export → API → empresa navegable. En paralelo, alternativas.
3. Puestas en común cada 60–90 minutos: evidencia, obstáculos, siguiente tesis; no presentaciones largas.
4. Comparación: descartar enfoques débiles, analizar errores y combinar solo si mejora.
5. Bloque final protegido: congelar experimentos, reproducir ganador, preparar predicciones, desplegar con autorización, comprobar demo externa y grabar recorrido.

No entrenar un transformer desde cero por defecto. Priorizar señal, evaluación y producto sobre complejidad.

## 8. Cierre verificable

- Pipeline reproducible y predicción del test en formato confirmado.
- Casos reales del dataset: sólida, mejora, deterioro y shock/bache; este último con distinción entre sospecha online y reversión confirmada.
- Score mensual, trayectoria y explicación comprobables desde la UI.
- Funcionalidad que utiliza el score para priorizar/avisar, comprador y utilidad claramente definidos.
- API y frontend ejecutados, tests/build y recorrido de navegador verificados.
- Demo y entrega según reglas vigentes; no confundir lista local con publicada.

Las decisiones de pesos, arquitectura del score y calendario siguen abiertas. No hay análisis estadístico, modelo ni aplicación implementados como parte de estas notas.
