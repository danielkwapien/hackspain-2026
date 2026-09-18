# Contrato del dashboard y de resultados (v1)

Estado: propuesta de la sesión de dashboard, 18 de septiembre de 2026. No fija la fórmula del score ni pesos: eso pertenece a `data-analysis/`. Este documento define **la frontera y el formato** con el que el dashboard lee datos hoy (inventario real del dataset) y leerá mañana los resultados del motor analítico.

## 1. Principio

El dashboard y su API **no calculan finanzas**: leen exports precalculados y versionados. El pipeline Python (propio o ajeno) es el único que toca los CSV del dataset. La API nunca abre un CSV durante una petición ni recalcula en TypeScript lo que el pipeline ya calculó.

```
CSV del dataset (fuera del repo, local)
        │  app/tools/dataset_inventory.py  (proceso batch, no sirve peticiones)
        ▼
app/exports/v1/*.json   (pequeños, versionados en Git, con hashes de origen)
        │  app/api (Fastify, solo lectura)
        ▼
app/web (React + Vite)  —  estados: disponible / parcial / pendiente / insuficiente
```

## 2. Capa 1 — Inventario del dataset (existe ya; `app/tools/dataset_inventory.py` se implementa en esta rama)

`app/tools/dataset_inventory.py` construye `app/exports/v1/` desde los CSV. Es un **inventario**: cuenta y describe lo que hay. No agrega señales financieras, no convierte moneda, no puntúa.

Ficheros:

| Fichero | Contenido |
|---|---|
| `manifest.json` | Versión de contrato, hashes SHA-256 de cada CSV de origen, ventana temporal, fecha de corte efectiva, `generated_at`, recuentos globales y notas de calidad |
| `groups.json` | Por grupo: `group_id`, `erp`, `n_companies_in_sample`, monedas y países presentes entre sus sociedades |
| `companies.json` | Por sociedad: identificación y cobertura (ver §4) |
| `companies/<company_id>.json` | Detalle por sociedad: productos bancarios, productos de deuda, calendario cuando existe, saldos con fecha efectiva, actividad mensual (recuentos y flujos observados por moneda), facturas por mes |

## 3. Capa 2 — Resultados del motor (pendiente, contrato fijado)

Cuando existan, el motor publicará `app/exports/v1/results/<entity_id>.json` (o su equivalente). El contrato que el dashboard ya sabe consumir:

```jsonc
{
  "contract_version": "dashboard-v1",
  "entity": { "kind": "company", "id": "COMP_0001" },
  "cutoff_date": "2026-09-01",          // corte de datos usado
  "model_version": "score-v1",          // versión del motor
  "data_version": "embat-v2",           // versión del dataset
  "status": "available | partial | insufficient_data | pending_engine",
  "score": 0.0,                          // null si pending/insufficient
  "months": [                            // serie mensual, M1..M24 + corte
    {
      "month": "2024-09",
      "score": null,
      "basis": "observed | reconstructed | forecast | scenario",
      "coverage": { "months_observed": null, "reason": null },
      "contributions": [                 // descomposición del nivel
        { "signal": "cash_buffer", "value": null, "weight": null, "contribution": null, "direction": "better_when_higher" }
      ],
      "change_vs_prev": {                // explicación del cambio mensual
        "delta": null, "drivers": [ { "signal": "dpo", "delta": null, "contribution": null } ]
      }
    }
  ],
  "trajectory": { "direction": "improving | stable | deteriorating | unknown", "months_in_direction": null, "regime": null },
  "quality": { "coverage_ratio": null, "reasons": [] },
  "alerts": [
    { "id": "...", "month": "2026-03", "kind": "deterioration | improvement", "severity": null, "signal": "...", "message": "...", "evidence": {} }
  ],
  "forecast": {                          // bloque separado, nunca mezclado con la serie observada
    "origin": "2026-09-01", "horizon_months": 6, "currency": "EUR",
    "points": [ { "month": "2026-10", "p10": null, "p50": null, "p90": null } ]
  }
}
```

Reglas duras:

- Si el motor no ha producido resultados, la API responde con `status: "pending_engine"` y `score: null`. **Nunca** se inventa un número, ni siquiera para la demo.
- Ausencia de datos ≠ 0. Cada serie declara `basis` y su cobertura.
- Sin política FX verificada no hay sumas entre monedas. Las agregaciones se devuelven por moneda.
- Los valores de extracción (`granted`, `outstanding`, condiciones de deuda, saldos) son **actuales**, no series históricas. Se etiquetan con su fecha efectiva.
- El calendario de deuda cubre solo una parte de los productos: se muestra la cobertura, no «compromisos totales».
- Un replay histórico del dataset no es monitorización bancaria en vivo: se etiqueta como corte del `cutoff_date`.

## 4. Definiciones de cobertura (inventario)

Por sociedad, el inventario reporta:

- `created_at`: fecha de alta en la plataforma (no de constitución). Condiciona la historia disponible.
- `months_with_activity`: meses con al menos un movimiento bancario; `first_activity`, `last_activity`.
- `counts`: productos bancarios, productos de deuda, facturas, movimientos.
- `snapshot`: fechas efectivas de saldo presentes (`2026-09-01` salvo el «día anterior más próximo con snapshot» para 16 productos).
- `currencies`: monedas presentes con el recuento por moneda; sin conversión.

## 5. Estados de UI derivados

| Estado | Cuándo | Qué ve el usuario |
|---|---|---|
| `pending_engine` | No hay resultados del motor para la entidad | Panel explícito «pendiente de cálculo», sin número |
| `insufficient_data` | El motor no puede calcular por cobertura | Motivos listados |
| `partial` | Resultado con cobertura incompleta | Número con aviso de cobertura |
| `available` | Resultado completo | Número, trayectoria, contribuciones, alertas |

## 6. Fuera de contrato (por ahora)

Consolidación de grupo, conversión FX, score agregado, scoring por señales, forecasting propio y alertas proactivas. Nada de eso existe aún y nada en la UI debe simularlo.
