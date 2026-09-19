---
feature: XR-035
depends_on: []
parallel: false
conflicts_with: []
lane: amplio
verify: evals/checks/XR-035.sh
max_attempts: 3
---
# Spec: XR-035

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-035: <item>") y termina la pasada.

## 1. Objetivo
X-Ray se recorre entero contra datos reales sin una sola excepcion, sirve un solo
numero por entidad, publica un regimen que no se contradice, calcula el score con
mas señales y en toda la escala, y habla en unidades de tesoreria con entidades
que tienen nombre.

## 2. Comportamiento (escenarios verificables)

Bloque 1 — producto navegable

- B1.1 DADO el motor publicando alertas CUANDO se construyen las filas de
  `company_alerts` y `group_alerts` ENTONCES `severity` solo toma los valores
  `urgent`, `review` o `watch`, con `urgent` si la banda del colchon es
  `critical`, `review` si lleva dos meses en `watch` y `watch` en el resto.
- B1.2 DADO el frontal CUANDO una alerta llega con una severidad que el
  diccionario no conoce ENTONCES el widget la pinta con un valor por defecto y no
  lanza ninguna excepcion.
- B1.3 DADO un widget cualquiera del tablero CUANDO su contenido lanza durante el
  render ENTONCES la frontera de error del widget lo contiene y el resto del
  tablero sigue montado.
- B1.4 DADO las alertas ya republicadas CUANDO se pide `/api/v2/alerts`
  ENTONCES toda fila trae una severidad del vocabulario del producto.
- B1.5 DADO el monitor CUANDO se abre `/monitor` ENTONCES lee la ruta v2 y pinta
  las alertas publicadas en vez del cartel de motor pendiente.
- B1.6 DADO el codigo de la API CUANDO se buscan las tablas del motor antiguo
  ENTONCES ninguna consulta nombra `scores` ni `score_exports`: el universo de
  sociedades sale de `company_scores` y la fecha de corte de `engine_exports`.
- B1.7 DADO `/health` CUANDO se consulta ENTONCES anuncia el motor real
  `embat-layered-v1` y su corte, no `static-baseline-v1`.
- B1.8 DADO el enrutador del frontal CUANDO se enumeran sus rutas ENTONCES no
  existe ninguna ruta de la ficha estatica v1.

Bloque 2 — credibilidad del numero

- B2.1 DADO la publicacion CUANDO se recorren las filas de score ENTONCES no
  existe ninguna con `regime` y `direction` opuestos.
- B2.2 DADO el motor CUANDO calcula el regimen ENTONCES lo decide por magnitud de
  `level_shift` con histeresis de dos meses sobre los seis valores
  `deteriorating`, `improving`, `blip`, `shock_pending`, `recovering` y `stable`,
  y `GROUP_0130` acaba en `deteriorating`.
- B2.3 DADO el catalogo de señales CUANDO se publica ENTONCES no contiene filas
  con etiqueta nula y peso cero.

Bloque 3 — calidad del dato

- B3.1 DADO los cortes de percentil CUANDO el motor normaliza ENTONCES los lee
  como constantes de un fichero de parametros versionado y el score de una
  entidad no cambia al variar la cohorte cargada.
- B3.2 DADO el banco de metricas CUANDO se mide la paridad entre ramas de
  cobertura ENTONCES es menor que 0,1.
- B3.3 DADO la utilizacion de lineas CUANDO el producto no trae el concedido
  ENTONCES se reconstruye del dispuesto en los movimientos y su cobertura sube
  por encima del 40 % de las filas.

Bloque 4 — prevision y ventanas

- B4.1 DADO una entidad con historia suficiente CUANDO se pide su score
  ENTONCES trae prevision a tres y seis meses con banda, no nula.
- B4.2 DADO las ventanas temporales de las graficas CUANDO se enumeran
  ENTONCES son cinco: un mes, tres, seis, un año y total.

Bloque 5 — idioma del comprador e identidad

- B5.1 DADO la cabecera de la ficha CUANDO se pinta ENTONCES enseña la fila de
  indicadores de tesoreria en unidades reales.
- B5.2 DADO las facturas CUANDO se calculan los tramos de antiguedad de cartera
  ENTONCES existen los cuatro: 0-30, 31-60, 61-90 y mas de 90.
- B5.3 DADO `entity_profile` CUANDO se consulta una entidad ENTONCES trae nombre,
  pais e industria con el metodo de cada campo, y la industria pertenece a los
  diez sectores acordados.
- B5.4 DADO el motor CUANDO se altera el nombre, el pais o la industria de una
  entidad ENTONCES su score no cambia.

Bloque 6 — remate

- B6.1 DADO una ficha sin informe de salud CUANDO se pinta ENTONCES el boton no
  aparece, y aparece en las que si lo tienen.
- B6.2 DADO la ficha CUANDO se pinta su cabecera ENTONCES no muestra
  `undefined`, el z-score va sin unidad inventada, la narrativa no se corta y la
  etiqueta de version y corte se ve con datos reales.

## 3. Fuera de alcance
- **No se borra ninguna tabla.** `scores` y `score_exports` se quedan en
  MotherDuck; solo se desengancha la API de ellas. Ningun `DROP` ni `DELETE`.
- Las diez tablas de origen (`groups`, `companies`, `banking_products`,
  `debt_products`, `debt_schedule_config`, `balances`, `invoices`,
  `transactions`, `scores`, `score_exports`) no se escriben nunca.
- El despliegue publico y el video: fuera de esta tanda por decision de Alfonso.
- `TASKQUEUE.md` no se toca desde esta rama.
- No se reabren las decisiones de la seccion 8 de DIAGNOSTICO.md.
- El motor no se ejecuta dentro de una peticion HTTP: la API solo lee tablas ya
  calculadas.
- Nombre, pais e industria son apariencia: no entran en el calculo del score.
- Ningun color literal fuera de `app/web/src/index.css`.

## 4. Verificacion
- [ ] bash evals/smoke.sh          → exit 0
- [ ] bash evals/checks/XR-035.sh  → exit 0   # nacio en rojo sobre main
- [ ] recorrido en el navegador desde almacenamiento local limpio, sin una sola
      excepcion en consola, con pares de capturas real/mock en
      `plans/XR-035/evidence/`

Los checks de motor y de contrato son tests: se escriben antes que el codigo y el
test que FALLA es el check rojo.

## 5. Prioridades (de arriba abajo)
1. B1.1 a B1.5: sin esto no hay producto navegable.
2. B1.6 a B1.8: un solo numero por entidad y una cabecera que no miente.
3. B2.1 a B2.3: el regimen deja de contradecirse.
4. B3.1 a B3.3: el score se calcula con mas señales y separa.
5. B4.1 y B4.2: la prevision deja de ser un hueco.
6. B5.1 a B5.4: unidades de tesoreria e identidad.
7. B6.1 y B6.2: el remate.
