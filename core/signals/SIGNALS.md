# Señales activas


## 1. Salud actual — `current_health`

**Qué representa:** la fotografía financiera de la empresa en la fecha de análisis.

Parte del baseline que ya existe: liquidez, pagos, cobros, deuda y actividad. Su función es resumir lasituación actual con métricas financieras conocidas y explicables. No intenta anticipar el futuro.

La señal puede reutilizar los pilares actuales y acompañarse de sus valores para explicar qué fortalece odebilita la empresa. La confianza dependerá de la cantidad, actualidad y variedad de los datos.

**Narrativa:** “Empezamos con una radiografía clara de la salud financiera actual”.

## 2. Trayectoria y presión futura — `trajectory_pressure`

**Qué representa:** si la empresa está mejorando o deteriorándose y si podrá absorber lo que se aproxima.

Debe mirar la evolución de caja, ingresos, mora, deuda y costes financieros durante varios meses. Puedeusar medias móviles, tendencias, volatilidad o cambios de régimen, evitando reaccionar en exceso a un solomes. También puede incorporar compromisos conocidos a corto plazo: facturas abiertas, vencimientos yservicio de deuda frente a caja y cobros esperados.

La salida debería indicar dirección (`improving`, `stable` o `deteriorating`) y aportar dos o tres razonesclaras. Más adelante se decidirá si conviene una única señal conjunta o dos componentes internos: pulsohistórico y presión futura.

**Narrativa:** “No solo vemos dónde está la empresa: detectamos hacia dónde va y si puede afrontar lo queya sabemos que viene”.

## 3. Inteligencia colectiva de Embat — `portfolio_learned_outlook`

**Qué representa:** qué ha ocurrido históricamente después en empresas con situaciones parecidas.

La señal aprende de ventanas históricas de otras empresas usando variables como caja, crecimiento,volatilidad, mora y deuda. Una primera versión puede buscar vecinos parecidos o crear grupos detrayectorias; posteriormente puede evolucionar hacia modelos supervisados si se define una etiqueta fiablede tensión o recuperación.

El resultado no debe ser solo el nombre de un clúster. Debe producir una expectativa comparable de 0 a100 y evidencia sencilla, por ejemplo: similitud encontrada, evolución posterior habitual y proporción decasos que terminaron en tensión. La confianza será baja cuando haya pocos ejemplos realmente semejantes.

Para evitar fuga temporal, el modelo solo puede aprender de futuros que ya eran conocidos en la fecha deevaluación.

**Narrativa:** “Cada nueva empresa se beneficia de lo aprendido en las trayectorias históricas de lacartera de Embat”.

## 4. Posición entre pares — `peer_position`

**Qué representa:** cómo se encuentra la empresa frente a negocios financieramente comparables.

Como los datos actuales no incluyen un sector económico fiable, no conviene llamarlo todavía “ranking desu sector”. Se pueden crear cohortes o arquetipos mediante tamaño de flujos, antigüedad observada,estacionalidad, moneda, complejidad del grupo o uso de deuda.

La señal puede ser el percentil de salud dentro de su cohorte: un valor 80 significaría que está mejor queaproximadamente el 80 % de sus pares. Debe indicar cómo se formó la cohorte y cuántas empresas contiene.Si hay pocos pares comparables, se reduce la confianza.

**Narrativa:** “Un 65 aislado dice poco; mostramos la posición de la empresa frente a compañías que secomportan como ella”.

## 5. Salud del ecosistema — `relationship_health`

**Qué representa:** la calidad y estabilidad de las relaciones comerciales que sostienen a la empresa.

Con las facturas puede construirse una red entre empresas y `counterparty_id`. La primera versión puedevalorar recurrencia, concentración, diversificación, puntualidad y persistencia de clientes o proveedores.Una empresa dependiente de pocas contrapartes inestables tendría más riesgo que otra con una red estable ydiversificada.

Actualmente `counterparty_id` no está enlazado de forma fiable con `company_id`, por lo que no se puedepropagar directamente el score completo de las otras empresas. Si en el futuro existe esa relación, laseñal podría incorporar la salud de los vecinos mediante un grafo inspirado en PageRank oPerron–Frobenius, con impacto limitado para evitar efectos circulares.

**Narrativa:** “Una empresa no vive aislada: su resistencia también depende de la red económica quealimenta sus cobros y pagos”.



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
