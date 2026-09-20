---
feature: XR-037
depends_on: [XR-033, XR-036]
parallel: false
conflicts_with: []
lane: amplio
verify: evals/checks/XR-037.sh
max_attempts: 3
---
# Spec: XR-037 — Kima, la pasada de UI

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-037: <item>") y termina la pasada.

## 1. Objetivo

El producto pasa a llamarse **Kima** y la primera pantalla tiene que sostener una
demo. Hoy arranca vacia («Selecciona una empresa o un grupo»), la topbar ensena
la version del motor truncada (`at-layered-v1`), el panel Empresa repite el
mismo numero hasta tres veces —pilares, «Senales» y «Perspectivas»— y el pop-up
«Como se calcula» pinta formulas con puntos suspensivos porque `/api/v2/meta`
sirve `params: null`.

Debajo de eso hay un fallo de datos: el Mapa filtra por `companies.country`, que
esta relleno en **230 de 1.286 sociedades (17,9 %)** y sin normalizar (`ES`,
`ESPANA` y `Espana` son tres paises distintos), mientras la ficha de esa misma
empresa lee `entity_profile.country`, completo al 100 % y con 38 valores limpios.
El mismo dato, dos respuestas, en la misma pantalla.

XR-037 arregla las dos capas: el contrato y el pipeline primero, la pantalla
despues. Todas las cifras de esta spec estan medidas contra `md:hackspain_2026`,
ninguna estimada.

## 2. Comportamiento (escenarios verificables)

### Datos y contrato

- DADO `/api/v2/treemap` CUANDO se pide ENTONCES cada sociedad trae el pais del
  perfil (`entity_profile.country`, 1.286 de 1.286) en `country` y el pais
  declarado en origen (`companies.country`, 230) en `country_declared`: el
  declarado NO se borra, deja de ser el que manda. Trae ademas `industry` del
  perfil, y los grupos reciben el mismo `JOIN` o seguirian sin pais propio.

- DADO `/api/v2/treemap` CUANDO se agrupa por `industry` ENTONCES `GROUP_BYS` lo
  acepta y el `bucketKey` del handler tiene su rama, que es lo que el filtro de
  Industria necesita.

- DADO `/api/v2/meta` CUANDO se pide ENTONCES NO anuncia `params` ni `reference`:
  el cargador de MotherDuck no los rellena y un campo nulo que nadie rellena es
  peor que un campo ausente. `params_version` (`sha256:c463221d…`) se queda como
  la unica firma del modelo.

### Alertas

- DADO `core/publish_alerts.py` CUANDO se ejecuta ENTONCES escribe SOLO
  `company_alerts_v2` y `group_alerts_v2`, con el mismo DDL que `ALERT_COLUMNS`
  de `core/publication_schema.py`, copiando tal cual las filas de `buffer_days`
  ya existentes y anadiendo cuatro causas nuevas: `band_drop` (la banda del mes
  es peor que la del anterior, `urgent` si cae a `stress`), `cap_applied`
  (`cap_code` deja de ser nulo: `CAP_NEGCASH` → «Caja negativa persistente»,
  `CAP_LOCFULL` → «Lineas de credito agotadas»), `concentration`
  (`top1_weight >= 0,40`) y `score_drop` (`delta_1m <= -8`). `alert_id` mantiene
  el formato `{entity_id}:{month}:{slug}`.

- DADO `core/publish_alerts.py` CUANDO termina ENTONCES `company_alerts` sigue
  con **11.824** filas y `group_alerts` con **2.371**, exactas, y ninguna de las
  diez tablas del reto ha cambiado. El script imprime el recuento real por causa
  al publicar, para poder ajustar el umbral de `score_drop` con el dato delante.

- DADO la bandeja de alertas CUANDO se sirve ENTONCES se devuelve **la alerta
  viva mas grave por sociedad**, no su historico: con cinco causas sobre 24 meses
  las 50 primeras por mes descendente serian todas del ultimo mes y de la misma
  empresa.

### Marca, arranque y limpieza

- DADO la topbar CUANDO se pinta ENTONCES dice **Kima** junto a un logo, la
  inicial del avatar es `K`, y NO aparece la etiqueta `embat-layered-v1 · corte
  08/2026` con datos reales. Ningun `X-Ray` queda en un texto de interfaz de
  `app/web/src` —tampoco en el playground de tokens—; los tests que lo buscaban
  se actualizan, no se borran. Sobreviven tres comentarios de cabecera que
  nombran el motor, que no son marca en pantalla.

- DADO una ventana limpia CUANDO se abre la app ENTONCES el primer tablero es
  **Investigacion** y hay una entidad ya seleccionada: `COMP_0169` (matriz de
  `GROUP_0090`, 81,1 pts, confianza 100 %), con `selectedGroup: "GROUP_0090"`.
  `STORAGE_VERSION` sube de 1 a 2 o el `localStorage` viejo tapa el cambio.

- DADO el widget «Empresas» ENTONCES se titula **Busquedas** y su columna `n`
  pasa a **Filiales**, con el ancho subido de 28 px y el array que alimenta al
  virtualizador actualizado.

- DADO la ficha CUANDO se pinta ENTONCES NO aparece la narrativa bajo el nombre
  (repetia el score, destripaba la mecanica del motor y venia sin tildes) ni el
  sufijo de rango en el delta de pilar (`+2,7 pts · 1A` pasa a `+2,7 pts`), ni en
  pilares ni en familias.

- DADO el Mapa CUANDO el raton pasa sobre una ficha ENTONCES la linea de estado
  NO cambia: se queda el censo (`1.286 empresas · 08/2026 · …`), que es el que
  dice que estas mirando.

### Ficha de empresa

- DADO la cabecera de la ficha ENTONCES el nombre va a `--text-figure` (20 px),
  los titulos de widget a `--text-widget-title` (18 px, un token que ya existia y
  no consumia nadie) con la cabecera subida de 28 px, el score pierde el sufijo
  `pts` **solo en su celda** (`fmtPoints` no se toca: lo consumen `KpiRow`,
  `TopDrivers`, `StrategicCards`, `KeyStats` y `LineNoAxes`), el delta viaja en
  la misma linea entre parentesis y la confianza se colorea: verde >= 85 %,
  primario 60-84 %, naranja 15-59 %, rojo < 15 %. El rojo alcanza a **1 de 1.286**
  sociedades y es correcto que asi sea.

- DADO la linea de identidad ENTONCES `entity_id`, industria y pais viajan como
  burbujas glass —la de un dato inferido con borde punteado y su `title`, no con
  asterisco— con el dinero a la derecha sin la etiqueta «Operativa», y el
  **regimen escrito con su color** (`Recuperando` en aguamarina, `Deteriorando`
  en rojo). Esa ultima parte es la compensacion obligatoria de E9, no un extra.

- DADO la grafica del score ENTONCES la linea va siempre en `--chart-score`, que
  pasa de `var(--white)` a `var(--tone-aqua)`; Liquidez se mueve a
  `--tone-rose: #c98fa8` para no colisionar con ella en la vista de familia; la
  baseline punteada y su fecha desaparecen; con dos series hay leyenda; y los
  picos llevan burbuja de valor con presupuesto por rango (0/1/2/3/3). La prop
  `peaks` de `LineNoAxes` es opcional y por defecto **0**, o la Comparativa se
  llenaria de burbujas sobre dos series superpuestas.

- DADO «Senales» ENTONCES se sustituye por metricas de tesoreria que hoy no estan
  en ninguna otra fila: runway (`buffer_days`, 93,6 % de cobertura), tendencia de
  caja (94,7 %), meses en negativo (99,9 %), flujo operativo neto (94,6 %) y las
  dos de contrapartes de XR-036. Tres de las cinco filas de hoy eran pilares
  repetidos 60 px mas arriba y dos decian «No aplica».

- DADO «Perspectivas» ENTONCES se llama **Contexto**, pierde `current_health`
  —que no es una perspectiva, es el nivel del score, con los mismos cuatro
  pilares como evidencia— y quedan cuatro tarjetas con etiqueta en espanol
  escrita en el front (el motor publica `label: null` en las cinco), cifra
  grande, `PillarBar` 0-100 y **dos** claves de evidencia traducidas por un
  diccionario; lo que no este en el diccionario no se pinta. El ajuste al score
  solo aparece cuando `modifier_applied` es `true`.

- DADO las fortalezas (`PAYS_ON_TIME` y las otras cuatro) ENTONCES bajan a una
  columna **Conclusion** debajo de la grafica, la fila pasa a seis columnas, y si
  la empresa no tiene ninguna dice «Sin senales destacadas» y vuelve a cinco.

- DADO el pop-up «Como se calcula» ENTONCES es prosa en cuatro apartados, sin una
  sola formula, y **no scrollea** a 1440x900 ni a 1280x800: si el texto no cupiera
  se recorta el texto, no se activa el scroll. `BandScale` y `WeightsRow` se
  conservan como cabecera.

- DADO el `Segmented` de Investigacion profunda ENTONCES pierde `Health score`
  (22 celdas que ya estaban en la cabecera de al lado) y arranca en Liquidez.

### Mapa

- DADO la cabecera del Mapa ENTONCES hay cuatro desplegables —Cartera, Pais,
  Industria, ERP— y con los cuatro en su valor por defecto el mapa ensena las
  **1.286** fichas. El de ERP incluye **«Sin ERP»**, que recupera las **541**
  sociedades (42 %) que no lo tienen. Cruzar filtros hasta vaciar el mapa da un
  estado vacio que dice que filtro corta, no un rectangulo negro.

## 3. Fuera de alcance

- **E16 completo.** Los paneles nuevos de Liquidez, Deuda y Actividad necesitan
  tres endpoints (`/cash`, `/debt`, `/activity`) y probablemente tablas de
  resumen publicadas: es una PR del tamano de XR-036. Entra SOLO quitar
  `Health score` del `Segmented`.
- `evals/` fuera del check de esta feature, `TASKQUEUE.md`, `datasets/`,
  `datasets_mocked/`, `data/`: intocables.
- Las diez tablas del reto (`groups`, `companies`, `banking_products`,
  `debt_products`, `debt_schedule_config`, `balances`, `invoices`,
  `transactions`, `scores`, `score_exports`) no se borran, ni se alteran, ni se
  recrean. `company_alerts` y `group_alerts` originales tampoco.
- `core/publish.py` no se ejecuta: hace `CREATE OR REPLACE TABLE` sobre trece
  tablas derivadas y republicar para anadir alertas reescribiria scores,
  senales, drivers, catalogo y exports enteros.
- El score no cambia. Ni un punto, en ninguna sociedad.
- La prop `baseline` NO se borra de `LineNoAxes`: es opcional y el playground de
  tokens la usa. Se deja de pasar desde `SheetChart`, que es otra cosa.
- Sin dependencias nuevas. Un unico primitivo de color nuevo (`--tone-rose`), en
  `index.css`, y ningun literal de color fuera de ahi.

## 4. Verificacion

```sh
API_URL=http://localhost:8789 BASE_URL=http://localhost:4173 bash evals/checks/XR-037.sh
```

Los puertos alternativos no son cosmeticos: `ensure_server` reutiliza cualquier
servidor que ya escuche en `API_URL`, y en 8787/5173 vive la sesion del Gate
sobre `main`. Sin cambiarlos, el check verifica el codigo de otra rama y sale
verde en falso.

## 5. Items

1. Datos y contrato: H1 (`entity_profile` en los dos cargadores), H2
   (`params`/`reference` fuera de `/meta`), I3.b-backend (`industry`).
2. Pipeline de alertas: `core/publish_alerts.py`, cuatro reglas, tablas `*_v2`,
   deduplicacion por sociedad.
3. Limpieza de front: E3, E5, E12, I3.a, I1, I0.
4. Marca y jerarquia: E2, E1, E4, E6, E7, E8 (+ regimen con su color).
5. Color y grafica: E9 → E11 → E10, en ese orden.
6. Contenido: E13, E14, E15, E16-parcial.
7. Pop-up en prosa (E17) y los cuatro filtros del Mapa (I3.b-front).

## 6. Cobertura medida

| Medida | Valor |
|---|---:|
| Sociedades con pais en `companies.country` | 230 de 1.286 (17,9 %) |
| Sociedades con pais en `entity_profile.country` | 1.286 (100 %), 38 valores |
| Sociedades sin ERP | 541 (42 %) |
| Filas en `company_alerts` / `group_alerts` | 11.824 / 2.371, una sola causa |
| Filas que daria `band_drop` | 1.977 |
| Filas que daria `cap_applied` | 1.491 (196 entidades) |
| Filas que daria `concentration` | 856 (424 `ar` + 432 `ap`) |
| Sociedades con confianza < 15 % | 1 |
