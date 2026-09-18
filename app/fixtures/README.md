# Fixtures (datos sintéticos de demostración)

Esta carpeta contiene **datos sintéticos escritos a mano** para poder probar la interfaz antes de
que exista motor analítico. No son resultados del motor, no son cálculos sobre el dataset y no
describen la situación real de ninguna empresa.

| Fichero | Contenido |
|---|---|
| `v1/monitor-demo.json` | 8 alertas de ejemplo para el modo demostración del monitor (`GET /api/v1/monitor?demo=1`) |

Reglas de uso:

1. La API **nunca** sirve fixtures por defecto: `GET /api/v1/monitor` responde estado
   `pending_engine` con la bandeja vacía. Los fixtures solo se leen con el conmutador explícito
   `?demo=1`, y la respuesta se marca con `demo: true`, `source: "fixture"` y un `banner`.
2. La interfaz muestra el banner de forma persistente mientras el modo demostración esté activo.
   No existe forma de ver estas alertas sin el banner ni como estado inicial.
3. Los `company_id` de las alertas existen en el dataset (son reales), pero el contenido de cada
   alerta es inventado: motivo, severidad, meses y evidencias son de ejemplo.
4. Los fixtures no crecen hacia datos de negocio: cuando exista el motor, sus resultados van a
   `app/exports/v1/results/<entity_id>.json` con el contrato de `docs/dani/contrato-dashboard-v1.md`.
5. Para sustituir o añadir fixtures, mantén el envoltorio `{"demo": true, "source": "fixture",
   "banner": "..."}` y el mismo shape de alerta (`id`, `company_id`, `month`, `kind`, `severity`,
   `message`, `evidence`).
