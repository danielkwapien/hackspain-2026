# XR-020: Fastify consulta MotherDuck

Autorizado por Dani el 19-09-2026: sustituir datos mock visibles por el dataset completo importado en `md:hackspain_2026`. Mantener interfaces de navegación y presentación existentes, adaptando estados a los datos disponibles.

## Fuente y límites

- Fastify usa MotherDuck por defecto y credenciales exclusivamente de servidor. Sin fallback silencioso a ficheros/mock ante fallo.
- El modo local se selecciona explícitamente para fixtures/tests. No modificar core, datasets ni fórmulas.
- `static-baseline-v1`: snapshot por empresa a 2026-09-01. No hay trayectoria ni forecast. No consolidar scores de empresas como si existiera un score de grupo publicado.
- Fuente oficial sintética del reto: no denominarla datos de empresas reales. Nombres no publicados: mostrar identificadores.
- Conservar 1.286 empresas, 250 grupos y 456 scores NULL. No convertir NULL a cero ni omitir empresas sin score.
- `meta.source='motherduck'`, `data_kind='real'` (dataset del reto), `capabilities.snapshots_only=true`, `params=null` para este modelo.
- Detalle v2 expone `snapshot` íntegro (payload original), además de campos compatibles; deltas/regímenes/forecast/modelo temporal ausentes como NULL. Factores propios del baseline en UI, sin fingir cinco pilares temporales.
- Pantallas v1 y v2 deben servir la misma fuente. Monitor real no muestra fixtures ni afirma que el motor esté pendiente si existen resultados.
- Agregados financieros separados por moneda; LEFT JOIN para referencias huérfanas; fechas originales conservadas y exclusiones temporales explícitas.

## Verificación

Scorer independiente mantiene `evals/checks/XR-020.sh` usando solo primitivas de lib.sh. RED antes de integración. Builder no modifica evals ni TASKQUEUE.

- Meta confirma fuente/versión/corte. Universo 1.286 empresas y 250 grupos, búsqueda/paginación/filtros correctos.
- COMP_0001 score 54.93, grupo GROUP_0147 y payload original; COMP_0002 score NULL e insufficient_data.
- Ningún score histórico, delta, régimen o forecast fabricado para el snapshot. Grupo sin score consolidado publicado.
- IDs inválidos 400, inexistentes 404, parámetros inválidos 400, fallo de conexión 503 sin secretos ni mock.
- UI real: abrir tabla, buscar ambas empresas, detalle, comparar, grupo, monitor y widgets; sin crashes con NULL; procedencia y limitaciones visibles.
- Typecheck, tests y build del workspace. QA de API viva y navegador, revisión adversaria independiente.

## Ajustes confirmados durante implementación

- Actividad monetaria y meses con actividad: solo movimientos `booked`. Los `pending` se cuentan aparte y los movimientos sin estado no entran en las series monetarias.
- Caja observada y productos con saldo: solo catálogo bancario, sin restar deuda. El detalle de balances conserva los productos de deuda y las referencias huérfanas.
- Facturas pendientes incluyen `pending`, `payment_in_progress`, `paymentOrder` y `shipped`, como en el inventario original.
- Dani reserva el QA manual para él y solicita no usar computer use salvo petición explícita. Las verificaciones restantes son automáticas por terminal/API; no abrir ni controlar navegadores. Si solicita computer use posteriormente, delegarlo en un subagente GPT-5.6 Luna.
