# Grupos de señales para el score

## Objetivo

La idea es construir **una señal por cada grupo** y mantenerlas independientes. Una persona puede trabajar
en las señales mientras otra decide cómo combinarlas en el score final. Este documento define qué debería
representar cada grupo, pero no cierra todavía el algoritmo, los pesos ni los umbrales.

Todas las señales deberían devolver, como mínimo:

```json
{
  "name": "trajectory_pressure",
  "value": 72.4,
  "confidence": 0.81,
  "coverage": 0.92,
  "direction": "improving",
  "evidence": {"summary": "Mejora sostenida de caja y menor presión a corto plazo"}
}
```

`value` va de 0 (muy preocupante) a 100 (muy saludable). `confidence` indica cuánto confiar en el cálculo
y `coverage` cuántos datos relevantes estaban disponibles. La falta de datos debe bajar la cobertura, no
convertirse automáticamente en mala salud.

## 1. Salud actual — `current_health`

**Qué representa:** la fotografía financiera de la empresa en la fecha de análisis.

Parte del baseline que ya existe: liquidez, pagos, cobros, deuda y actividad. Su función es resumir la
situación actual con métricas financieras conocidas y explicables. No intenta anticipar el futuro.

La señal puede reutilizar los pilares actuales y acompañarse de sus valores para explicar qué fortalece o
debilita la empresa. La confianza dependerá de la cantidad, actualidad y variedad de los datos.

**Narrativa:** “Empezamos con una radiografía clara de la salud financiera actual”.

## 2. Trayectoria y presión futura — `trajectory_pressure`

**Qué representa:** si la empresa está mejorando o deteriorándose y si podrá absorber lo que se aproxima.

Debe mirar la evolución de caja, ingresos, mora, deuda y costes financieros durante varios meses. Puede
usar medias móviles, tendencias, volatilidad o cambios de régimen, evitando reaccionar en exceso a un solo
mes. También puede incorporar compromisos conocidos a corto plazo: facturas abiertas, vencimientos y
servicio de deuda frente a caja y cobros esperados.

La salida debería indicar dirección (`improving`, `stable` o `deteriorating`) y aportar dos o tres razones
claras. Más adelante se decidirá si conviene una única señal conjunta o dos componentes internos: pulso
histórico y presión futura.

**Narrativa:** “No solo vemos dónde está la empresa: detectamos hacia dónde va y si puede afrontar lo que
ya sabemos que viene”.

## 3. Inteligencia colectiva de Embat — `portfolio_learned_outlook`

**Qué representa:** qué ha ocurrido históricamente después en empresas con situaciones parecidas.

La señal aprende de ventanas históricas de otras empresas usando variables como caja, crecimiento,
volatilidad, mora y deuda. Una primera versión puede buscar vecinos parecidos o crear grupos de
trayectorias; posteriormente puede evolucionar hacia modelos supervisados si se define una etiqueta fiable
de tensión o recuperación.

El resultado no debe ser solo el nombre de un clúster. Debe producir una expectativa comparable de 0 a
100 y evidencia sencilla, por ejemplo: similitud encontrada, evolución posterior habitual y proporción de
casos que terminaron en tensión. La confianza será baja cuando haya pocos ejemplos realmente semejantes.

Para evitar fuga temporal, el modelo solo puede aprender de futuros que ya eran conocidos en la fecha de
evaluación.

**Narrativa:** “Cada nueva empresa se beneficia de lo aprendido en las trayectorias históricas de la
cartera de Embat”.

## 4. Posición entre pares — `peer_position`

**Qué representa:** cómo se encuentra la empresa frente a negocios financieramente comparables.

Como los datos actuales no incluyen un sector económico fiable, no conviene llamarlo todavía “ranking de
su sector”. Se pueden crear cohortes o arquetipos mediante tamaño de flujos, antigüedad observada,
estacionalidad, moneda, complejidad del grupo o uso de deuda.

La señal puede ser el percentil de salud dentro de su cohorte: un valor 80 significaría que está mejor que
aproximadamente el 80 % de sus pares. Debe indicar cómo se formó la cohorte y cuántas empresas contiene.
Si hay pocos pares comparables, se reduce la confianza.

**Narrativa:** “Un 65 aislado dice poco; mostramos la posición de la empresa frente a compañías que se
comportan como ella”.

## 5. Salud del ecosistema — `relationship_health`

**Qué representa:** la calidad y estabilidad de las relaciones comerciales que sostienen a la empresa.

Con las facturas puede construirse una red entre empresas y `counterparty_id`. La primera versión puede
valorar recurrencia, concentración, diversificación, puntualidad y persistencia de clientes o proveedores.
Una empresa dependiente de pocas contrapartes inestables tendría más riesgo que otra con una red estable y
diversificada.

Actualmente `counterparty_id` no está enlazado de forma fiable con `company_id`, por lo que no se puede
propagar directamente el score completo de las otras empresas. Si en el futuro existe esa relación, la
señal podría incorporar la salud de los vecinos mediante un grafo inspirado en PageRank o
Perron–Frobenius, con impacto limitado para evitar efectos circulares.

**Narrativa:** “Una empresa no vive aislada: su resistencia también depende de la red económica que
alimenta sus cobros y pagos”.

## Cómo puede trabajar el scoring en paralelo

El scoring debería consumir solo el contrato común, sin depender de cómo se calcula cada señal. De inicio:

- `current_health` puede seguir siendo el nivel base.
- Las otras cuatro señales pueden mostrarse separadas como diagnóstico y explicación.
- Después se probarán pesos, modificadores o límites usando validación temporal.
- Una señal con poca confianza o cobertura debería influir menos, nunca interpretarse como cero.
- El JSON final debería incluir el score agregado, las cinco señales y sus evidencias principales.

No es necesario decidir ahora si la combinación final será una media ponderada, reglas de riesgo o un
modelo. Primero interesa que cada señal tenga un significado estable y pueda evaluarse por separado. Solo
debería incorporarse al score oficial si aporta anticipación, estabilidad o una explicación útil.

## Orden sugerido

`current_health` ya existe. El siguiente orden permite avanzar de lo más directo a lo más experimental:

1. `trajectory_pressure`.
2. `portfolio_learned_outlook`.
3. `peer_position`.
4. `relationship_health`.

El relato conjunto para el pitch es:

```text
Salud actual · Trayectoria futura · Inteligencia Embat · Posición entre pares · Salud del ecosistema
```
