# engine/ — el motor de scoring, por capas

Convierte los valores crudos de `signals/` en un número de 0 a 100 **y en la
frase que lo explica**. Una capa por módulo; todo lo ajustable en `config.py`.

## Las capas

Dos pasadas, porque las perspectivas estratégicas necesitan que el nivel exista
antes de poder calcularse:

```
1ª pasada
  señales    → familias   families.py    mezcla + encogimiento por cobertura
  familias   → nivel      combine.py     mezcla ponderada − eslabón más débil

  (signals/group_signals.py calcula las cinco perspectivas sobre ese nivel)

2ª pasada
  nivel      → ajustes    strategic.py   ±bound por perspectiva, × confianza
             → techos     overrides.py   cortes absolutos por eventos duros
             → score      calibrate.py   banda, confianza, alerta de liquidez
```

Los techos van los últimos: un techo **corta** el resultado, no discute con los
ajustes.

## Cómo se toca

**Todo en `config.py`.** Ningún otro módulo tiene constantes sueltas.

```python
FAMILY_BLEND  = {"liquidity": ("power", {"p": 0.5}), ...}   # cómo mezcla cada familia
COMBINE_BLEND = ("weighted_mean", {})                        # cómo mezclan las familias
PENALTY_LAMBDA, PENALTY_TAU                                  # castigo al eslabón débil
STRATEGIC_MODIFIERS = {"trajectory_pressure": {"bound": 8.0, "enabled": True, ...}}
CAPS, CAPS_ENABLED                                           # techos duros
BANDS, BUFFER_BANDS                                          # cortes de banda
```

Las mezclas disponibles están en `registry.py` y se eligen **por nombre**:
`arithmetic`, `geometric`, `power(p)`, `weakest(lam)`, `minimum`. Sobre
`[90, 90, 10]` dan 63,3 · 43,3 · 50,2 · 36,7 · 10,0 — de totalmente
compensatoria a eslabón más débil puro. Añadir una forma nueva es añadir una
función a `BLENDS` y escribir su nombre en la configuración.

## El rastro es lo que sostiene la narrativa

Cada capa escribe lo que hizo en `trace.py` **mientras calcula**. La
explicación no se reconstruye después mirando el número: se va escribiendo, así
que por construcción no puede contradecirlo.

```
Partimos de un nivel de 71: el pilar más débil (Cobros) descuenta 7;
la trayectoria resta 6 puntos tras 7 meses de deterioro.
```

`explain.py` monta esa frase desde el rastro, sin LLM. Si más adelante un
modelo redacta la versión larga, recibe esto ya calculado y solo reformula.

## Las cinco perspectivas como modificadores

`signals/` publica cinco lecturas con contrato común (`value` 0..100 donde 50 es
neutro, más `confidence` y `coverage`). `strategic.py` las convierte en ajustes
**acotados** y **escalados por su propia confianza**: una señal en la que no
confiamos encoge hacia cero en vez de meter ruido.

| Perspectiva | Techo | Estado | Por qué |
|---|---|---|---|
| `trajectory_pressure` | ±8 | **activa** | solo mira el pasado del propio grupo |
| `network_counterparty_health` | ±5 | **activa** | solo mira las facturas del propio grupo |
| `sector_benchmark_rank` | ±4 | desactivada | ordena dentro del lote cargado |
| `data_driven_peer_learning` | ±6 | desactivada | busca vecinos entre los demás grupos |
| `current_health` | — | nunca | es el nivel republicado: sumarlo sería contarlo dos veces |

Las dos desactivadas **romperían `tests/test_isolation.py`**: con 60 grupos en
vez de 250 darían otro número para el mismo grupo. Siguen publicándose en el
JSON como diagnóstico. Para meterlas en el score hay que congelar su referencia
antes.

## Invariantes que no se rompen

1. **Nada depende de la cohorte cargada.** Anclas y techos son absolutos;
   las perspectivas activas solo leen el pasado del propio grupo. Por eso saca el
   mismo número con 250 grupos en el fichero o con 60. Lo comprueba
   `tests/test_isolation.py`.
2. **Un mes nunca mira meses futuros.**
3. **Falta de dato no es mala salud.** Se renormaliza y se encoge hacia 50;
   nunca se imputa cero.
4. **El suavizado va en el pilar**, no en el score final, para que la
   descomposición en drivers siga cuadrando.
5. **La alerta de liquidez va aparte del score.** El score es un juicio
   estructurado para ordenar y explicar; el colchón de caja es la señal que
   anticipa. Juntarlas pierde las dos.

## Uso

```python
from engine import score_panel
from signals import calculate_signals, specs_by_pillar

scored = score_panel(panel, calculate_signals(panel), specs_by_pillar(),
                     extras={"buffer_days": "buffer_days_raw",
                             "loc_utilisation": "loc_utilisation"})
```

`core/scoring.py` es otra cosa: el baseline estático de Dani. Por eso este
paquete se llama `engine/` y no `scoring/`.
