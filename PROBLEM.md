# PROBLEM.md — Reto de Embat en HackSpain 2026

**Título del reto:** *«¿Puede el dinero decir cómo está una empresa?»* (HackSpain 2026 · X Ray · Reto de Embat)
**Fecha de este documento:** 18 de septiembre de 2026
**Propósito:** ser el *source of truth* del problema para cualquier persona o agente de IA que trabaje en este repositorio. Contiene el contexto completo de la empresa que plantea el reto (Embat), la transcripción literal del brief, su análisis, el dataset, los requisitos, los criterios de evaluación y las preguntas abiertas.

---

## 0. Cómo leer este documento

### 0.1 Jerarquía de fuentes

Cuando dos fuentes se contradigan, manda la que esté más arriba:

1. **El brief oficial del reto** (`Embat_Problem.pdf`, 6 páginas, transcrito íntegro en §2). Es la única fuente normativa sobre qué se pide y cómo se evalúa.
2. **Este documento** (análisis, inferencias y decisiones derivadas del brief).
3. **`INFORME-EMBAT.md`** (investigación sobre Embat hecha el 18/09/2026 *antes* de que se publicara el reto). Sigue siendo válido para todo lo que es Embat como empresa, sector, producto, arquitectura y API. **Sus secciones §8 («Qué reto podrían plantear»), §9 («Ideas de proyecto») y §10 («Guion de pitch») quedan superadas por el brief real** y no deben usarse como guía de qué construir. Ver §1.4.
4. **`embat-openapi.json`** (spec OpenAPI 3.1 de la API pública de Embat, v2.120.53). Útil para entender el modelo de datos de Embat, que el dataset del reto replica casi uno a uno (§5.3).

### 0.2 Marcas de procedencia

Cada afirmación relevante lleva una marca:

| Marca | Significado |
|---|---|
| **[PDF]** | Literal o directamente derivado del brief oficial del reto. |
| **[INF]** | Procede de `INFORME-EMBAT.md`. Ese informe tiene sus propias marcas: **[V]** verificado con fuente, **[E]** afirmación de marketing de Embat, **[C]** conocimiento de dominio, **[H]** hipótesis. Se conservan cuando importa. |
| **[V]** | Verificado contra fuente primaria con enlace, bien en el informe previo, bien en la investigación complementaria hecha el 18/09/2026 para este documento (webs de Embat, repositorio público de HackSpain, tesis de Cathay, comparables de mercado). |
| **[E]** | Afirmación de marketing de Embat, no auditada. |
| **[API]** | Extraído de `embat-openapi.json`. |
| **[C]** | Conocimiento de dominio financiero/tesorería, no verificado contra una fuente concreta. Sirve para entender, no para citar. |
| **[H]** | Hipótesis o inferencia razonada en este documento. |
| **[?]** | Pregunta abierta que hay que resolver con el dataset, con los organizadores o con Embat. Todas están reunidas en §11. |

### 0.3 Qué NO hay en este documento

- No contiene el dataset ni el `data_dictionary.md`. A fecha de este documento **no se ha descargado todavía**. Cuando esté, §5 debe actualizarse con el esquema real y las preguntas [?] de §11 sobre datos deben cerrarse.
- No contiene una solución elegida. Contiene el espacio de decisión (§8, §9) para que se elija con criterio.

---

## 1. Contexto: HackSpain 2026 y el track de Embat

### 1.1 El evento [INF, V]

| Dato | Valor |
|---|---|
| Nombre | HackSpain 2026 |
| Fechas | **18–20 de septiembre de 2026**. Apertura el viernes 18 a las **17:00 CEST** [V] |
| Lugar | **ETSIT–UPM, Madrid**, presencial |
| Duración | **36 horas** |
| Participantes | ~250 *builders* menores de 30 años |
| Tracks | **5**, uno por startup: Maisa (agentes auditables para banca/seguros), THEKER Robotics, Prosper AI (operaciones sanitarias), **Embat**, HappyRobot (agentes de voz/email para logística). **Máximo 15 equipos por track** [V] |
| Premio | **Un único gran premio de 5.000 €** para el equipo ganador, patrocinado por JME Ventures, Kfund, Kibo Ventures, Enzo Ventures y Acurio Ventures. **No hay premio por track publicado** [V] |
| Jurado final | Cinco VCs: Jaime Novoa (Kfund), Iván Landabaso (JME), Miguel González (Acurio), Iván Fernández (Enzo), Ignacio Alfeirán (Kibo) [V] |
| Jurado general | Doce personas de startups y fondos (HappyRobot, Base10, Harbor, Krea, Caspian, Invoke.bio, Canopy Labs…) [V] |
| Mentores | Entre otros, **Maex Ament** (Causa Prima, cofundador de **Taulia**, plataforma de financiación de circulante) [V]. Relevante para la parte de producto (§9). No hay mentor de Embat listado. |
| Sponsors de infraestructura | Convex, Vercel, QuiverAI, Cloudflare, Tinybird, Cognition, Exa, fal.ai, Cursor, Helmcode. «Compute gratis para todos»; los créditos concretos se reclaman en `hackspain.app/perks` tras login [V] |
| Herramientas oficiales | CLI (`curl -fsSL https://hackspain.com/install.sh \| sh`), dashboard `https://hackspain.app`, repositorio `https://github.com/HackSpain/hackspain26` [V] |

Los sponsors importan por un requisito concreto del brief: la **demo tiene que ser navegable** y «un notebook que solo corre en vuestro portátil no cuenta» [PDF]. Vercel, Cloudflare, Convex y Tinybird son las vías naturales para desplegar algo que el jurado pueda abrir.

### 1.1.1 Mecánica de entrega y de jurado en la plataforma [V]

Verificado en el código público del dashboard de HackSpain (`github.com/HackSpain/hackspain26`) y en `hackspain.com/conduct`:

- **Registro en el track:** `hackspain track register embat`.
- **Entrega** con `hackspain submit`: nombre, descripción, **repositorio de GitHub público (obligatorio)**, URL de demo (opcional), **URL de vídeo (YouTube, Loom o MP4, opcional, «for judges»)**, tracks a los que se presenta (uno o varios) y perks usados. `--draft` guarda; el envío final bloquea el proyecto («Submitting is final»). El plazo lo fija la organización con un interruptor; «si el formulario se cierra, se cierra». **Lo presentado tiene que haberse construido durante HackSpain.**
- **Jurado, dos vías independientes.** (a) **Grupos generales de jueces**: puntúan todos los proyectos con **nota entera de 1 a 10 por juez**, media → ranking general → gran premio. (b) **Jurado del track**: puntúa todos los proyectos enviados al reto de Embat; esas notas **no cuentan** en la clasificación general y forman un ranking separado. **Los jueces evalúan con el vídeo embebido**, así que el vídeo «opcional» es en la práctica imprescindible.
- **No hay rúbrica ni pesos publicados** en la plataforma. La rúbrica del brief (§2.7) es la única que existe para el track de Embat.
- **El leaderboard del test oculto no está en la plataforma de HackSpain.** Es infraestructura propia de Embat (o se resuelve a mano). Métrica, formato y plazo hay que preguntárselos a Embat [?].
- Tamaño de equipo: sin límite encontrado en código ni en web [?].
- Este repositorio **tendrá que ser público** en el momento de la entrega.

### 1.2 Texto literal del track en hackspain.com [INF, V]

> **Embat — El sistema operativo de la tesorería europea**
> Tesorería en tiempo real con IA para equipos financieros de medianas y grandes empresas. Automatiza hasta el 80% del trabajo manual, con 400 clientes en Europa y una Serie B de 30M€ liderada por Cathay Innovation. *(€50M+ levantados)*

### 1.3 El brief del reto

El reto se publicó como un documento de 6 páginas titulado **«¿Puede el dinero decir cómo está una empresa?»**, con cabecera «HACKSPAIN 2026 · X RAY · RETO DE EMBAT». «X Ray» parece ser el nombre interno del reto [H]: la metáfora es una radiografía de la empresa a partir de su rastro financiero. Está transcrito completo en §2.

El enunciado **no es público**: vive en el dashboard privado de HackSpain (`hackspain.app/tracks/embat`, tras login de participante aceptado) [V]. No hay copia en Notion, Devpost, GitHub ni redes, y ni Embat ni sus fundadores han publicado nada sobre el reto [V]. Conviene revisar esa página del dashboard durante el evento por si Embat añade el enlace al dataset, la métrica del leaderboard o aclaraciones.

En una frase [PDF]: **os dan el rastro financiero de 250 empresas durante 24 meses; con él construís un score de salud financiera y, encima del score, un producto que se pueda vender a esas mismas empresas. El score es el motor. Lo que se monte encima lo elige el equipo.**

### 1.4 Qué cambia respecto a lo que anticipaba el informe previo

`INFORME-EMBAT.md` se escribió cuando el reto no estaba publicado y apostaba (§8.1) por *«un agente que automatice un workflow de tesorería con trazabilidad y control humano»*, con la conciliación o la verificación de beneficiario (VoP) como candidatas principales. **El reto real no va por ahí.** Es un problema de **scoring / analítica predictiva sobre datos de tesorería, con explicabilidad, más una capa de producto**. Consecuencias:

- Las ocho ideas de proyecto del informe (§9: escudo VoP, motor de conciliación, exposición FX, netting, watchtower, cierre mensual, evidence pack, webhooks) **no son el reto**. No se construyen.
- Lo que **sí sigue vigente** del informe y hay que usar: quién es Embat y a quién vende (§2, §3.8, §6), sus principios de arquitectura de IA (§5.1: determinismo primero, LLM como propositor, traza, reversibilidad, tasa de aceptación), su modelo de datos y API (§5.3), su módulo de Risk Management y sus huecos (§4, §7), la tesis de Cathay («workflow ownership earns transaction ownership»), y el vocabulario de tesorería (§3.3, §3.5).
- El «criterio que casi seguro van a aplicar» (§8.3 del informe) sigue siendo una buena lectura de cómo piensa el jurado técnico de Embat, **complementaria** a la rúbrica oficial de §2.7.

---

## 2. El brief, transcrito íntegro [PDF]

Transcripción fiel del documento `Embat_Problem.pdf`. Se conserva la estructura de secciones y el texto. Donde el original es una tabla o un gráfico se describe.

### 2.1 Cabecera

> **HACKSPAIN 2026 · X RAY · RETO DE EMBAT**
>
> # ¿PUEDE EL DINERO DECIR CÓMO ESTÁ UNA EMPRESA?
>
> Os damos el rastro financiero de 250 empresas durante 24 meses. Con él construís un score de salud financiera, y **encima del score, un producto que se le pueda vender a esas mismas empresas**. El score es el motor. Lo que montéis con él lo elegís vosotros.
>
> **DATOS** — 250 empresas, 24 meses
> **TEST OCULTO** — 60–80 empresas sin resultado
> **ENTREGA** — el score y algo vendible encima

### 2.2 El problema: «Dos empresas, tres puntos de diferencia»

> Toda empresa deja un rastro. Entra dinero, se emiten facturas, se paga a proveedores, se cobra de clientes, se dispone y se devuelve deuda. Ese rastro cambia todos los días, pero casi nadie lo lee. Lo que se mira son fotos fijas: cuentas que llegan tarde y ratings que se actualizan cada tanto.

**Gráfico del brief:** dos series mensuales de score (escala 0–100, eje X de M1 a M24).
- **NORTHBROOK FOODS: 45 → 65.** Línea verde, empieza en 45 y sube de forma sostenida con pequeñas oscilaciones hasta 65 en M24.
- **VELASCO INDUSTRIAL: 82 → 68.** Línea roja, empieza en 82 y baja de forma gradual y continuada hasta 68 en M24.
- Las dos líneas se cruzan cerca de M24.

> En el mes 24 estas dos empresas sacan tres puntos de diferencia. **Una es mucho mejor riesgo que la otra**, y en la foto de hoy no se distingue cuál. Eso es lo que os pedimos que saquéis del rastro.

### 2.3 Lo esencial: «Seis preguntas que tiene que contestar vuestro sistema»

> Esto no va de predecir quiebras. Va de leer el comportamiento financiero en las dos direcciones, y de hacerlo antes de que sea evidente. Estas son las seis preguntas que tiene que contestar el vuestro, empresa por empresa y mes a mes.

| # | Pregunta | Texto literal |
|---|---|---|
| 1 | **QUIÉN ESTÁ SANO** | No solo quién está en problemas. Reconocer a una empresa excepcionalmente sólida es tan útil como detectar a la que se hunde. |
| 2 | **QUIÉN ESTÁ MEJORANDO** | Una empresa que pasa de 45 a 65 puede tener números mediocres hoy y ser la mejor apuesta del año que viene. |
| 3 | **QUIÉN EMPIEZA A TORCERSE** | De 82 a 68 sigue pareciendo sana. Pero algo en su comportamiento ya ha cambiado y conviene verlo ahora. |
| 4 | **BACHE O CAÍDA** | Un mes malo de caja no es lo mismo que un deterioro estructural. El sistema tiene que saber separarlos. |
| 5 | **POR QUÉ HA CAMBIADO** | Un número sin explicación no sirve para decidir. Hace falta saber qué señal se movió y cuándo. |
| 6 | **CUÁNDO SE VIO VENIR** | Detectar algo el mes que pasa no vale mucho. La gracia está en cuántos meses antes lo vio el sistema. |

### 2.4 Qué debe hacer: «Cuatro cosas que tiene que saber hacer el sistema»

> Las tres primeras construyen el motor. La cuarta es la que convierte el motor en algo que alguien firma.

| # | Capacidad | Texto literal |
|---|---|---|
| 1 | **LEER EL RASTRO** | Movimientos de banco, facturas emitidas y recibidas, comportamiento de pago, coste de financiación y saldos de deuda. Veinticuatro meses por empresa. De ahí salen las señales. **El trabajo está en decidir cuáles importan.** |
| 2 | **EL SCORE, EL EJE** | Una puntuación que capte la trayectoria y no solo la foto del último mes, y que aguante en las 60–80 empresas que vuestro sistema no ve nunca. Todo lo demás se apoya aquí. **Si el número no vale, el producto tampoco.** |
| 3 | **EXPLICARSE** | Por qué esta empresa saca este número, y por qué ha cambiado desde el mes pasado. **Nadie compra una caja negra para decidir a quién presta o a quién asegura.** |
| 4 | **CONSTRUIR ALGO ENCIMA** | Un producto, un servicio o una herramienta que se apoye en el score y que alguien pagaría por usar. Y saber a quién se lo vendéis. **Pista: la empresa que os entrega los datos es el comprador más obvio.** |

### 2.5 Los datos: «Qué hay en el dataset»

> 1.286 empresas sintéticas agrupadas en 250 grupos empresariales, con 24 meses de historia cada una (de septiembre de 2024 a septiembre de 2026), en nueve ficheros CSV. Está generado a partir de la distribución estadística de datos reales de tesorería de pymes: volúmenes, estacionalidad, patrones de contraparte y condiciones de financiación se comportan como los de verdad. Ninguna fila corresponde a una empresa, una cuenta o una persona real.

| Fichero | Qué lleva (literal) |
|---|---|
| `groups.csv` | Un grupo empresarial por fila. Un grupo puede ser un holding con varias filiales: de 1 a 24 empresas, mediana 2. |
| `companies.csv` | Una empresa por fila: grupo, país, moneda, ERP y fecha de alta. Su `company_id` es la clave que cruza todos los demás ficheros. |
| `banking_products.csv` | Cuentas bancarias: corriente, tarjeta, TPV, ahorro, inversión y plataforma de gastos, con banco y moneda. |
| `debt_products.csv` | Financiación: préstamos, leasing, líneas de crédito, hipotecas, renting, factoring, confirming y avales. Con importe concedido y saldo pendiente. |
| `debt_schedule_config.csv` | Condiciones de los préstamos con cuadro de amortización: tipo de cuota, frecuencia, número de plazos, tipo de interés y próxima fecha de pago. |
| `transactions.csv` | Movimientos bancarios de los 24 meses: fecha, importe, categoría, estado de conciliación, contraparte y concepto del banco. |
| `invoices.csv` | Facturas sincronizadas del ERP, emitidas y recibidas: emisión, vencimiento, fecha de cobro o pago, importe pendiente, estado y contraparte. |
| `balances.csv` | Saldo de cada cuenta y producto a 1 de septiembre de 2026, la foto final. |
| `data_dictionary.md` | Todos los campos explicados, fichero a fichero. |

### 2.6 Requisitos: «Qué tiene que llevar la entrega»

| Qué | Qué significa (literal) | Estado |
|---|---|---|
| **Predicción sobre el test oculto** | Vuestro sistema puntúa las empresas que no ha visto nunca. Es lo que entra en el leaderboard. | **OBLIGATORIO** |
| **Señal en las dos direcciones** | Reconoce la mejora igual que el deterioro. Un detector de quiebras a secas se queda corto. | **OBLIGATORIO** |
| **Trayectoria, no foto** | La salida refleja hacia dónde va la empresa, no solo dónde está el último mes. | **OBLIGATORIO** |
| **Explicación** | Para una empresa cualquiera, podéis decir por qué saca ese número y qué lo movió. | **OBLIGATORIO** |
| **Producto encima del score** | Algo construido sobre el número: un marketplace, una póliza, una línea de circulante, un agente. El score solo no es la entrega. | **OBLIGATORIO** |
| **Comprador identificado** | Sabéis decir quién lo paga y por qué le sale a cuenta. No hace falta un plan de negocio, hace falta una respuesta. | **OBLIGATORIO** |
| **Demo navegable** | Algo que se abra y se pruebe delante del jurado. Un notebook que solo corre en vuestro portátil no cuenta. | **OBLIGATORIO** |
| **Anticipación medida** | Enseñáis cuántos meses antes detecta el cambio, no solo que lo detecta. | **BONUS** |
| **Monitor que avisa** | El sistema no espera a que le preguntéis: levanta la mano cuando una empresa se mueve de verdad. | **BONUS** |

### 2.7 Evaluación: «Qué se mira»

> Tres bloques: si acierta, si llega a tiempo y si vale algo. **Ninguno pesa más que otro.** Un modelo sencillo con un producto claro encima nos interesa más que uno sofisticado que se queda en el número.

**SI ACIERTA**

| Criterio | Pregunta literal |
|---|---|
| Generalización | ¿Funciona en las empresas que no ha visto nunca? |
| Trayectoria | ¿Capta la dirección del movimiento o solo el nivel de hoy? |
| Las dos caras | ¿Detecta la mejora igual de bien que el deterioro? |

**SI LLEGA A TIEMPO**

| Criterio | Pregunta literal |
|---|---|
| Anticipación | ¿Ve el cambio antes de que sea evidente en los números? Cuántos meses antes, medido. |
| Estabilidad | ¿Distingue un bache puntual de un deterioro de verdad? |
| Monitor | Puntos extra si además avisa solo, sin que nadie pregunte. |

**SI VALE ALGO**

| Criterio | Pregunta literal |
|---|---|
| Producto | ¿Hay algo construido encima del score, o se queda en el número? |
| Comprador | ¿Sabéis quién lo paga y por qué le sale a cuenta? La empresa que genera los datos es el candidato obvio. |

---

## 3. Embat: la empresa que plantea el reto

Resumen de lo que hay que saber de Embat para este reto. El detalle, con fuentes, está en `INFORME-EMBAT.md`.

### 3.1 En una página [INF]

| | |
|---|---|
| **Qué es** | TMS (*Treasury Management System*) cloud para el *mid-market* europeo: empresas de 50–500 M€ de facturación con varios bancos, varios ERPs y equipos financieros pequeños. [V] |
| **Fundada** | 2021, Madrid. [V] |
| **Fundadores** | Antonio Berga (co-CEO, ex-JP Morgan), Carlos Serrano CFA (co-CEO, ex-JP Morgan y TowerBrook), Tomás Gil (co-fundador técnico, ex-CTO de Fintonic). [V] |
| **Financiación** | >50 M€. Serie B de 30 M€ (mayo 2026, Cathay Innovation); Serie A de 14,7 M€ (feb 2024, Creandum); seed 5 M€ (jun 2023, Samaipata). [V] |
| **Escala** | 400+ clientes (su web dice 500+); ~150–189 empleados; Madrid, Londres, Múnich, Berlín. [V] |
| **Volumen** | >250.000 M€ movidos en 2025 sobre 47M+ transacciones. [V] |
| **Crecimiento** | CAGR de ingresos del 355,65 % a 2 años; #8 del Sifted 100 Southern Europe 2026. [V] |
| **Clientes** | Cabify, Wallapop, Fever, Playtomic, Treatwell, Cementos Molins, Vicio, HOFF, Copisa, Cooltra, Watford FC, PetLab Co., thePower, Northern Data Group. **>75 % de sus clientes son economía tradicional** (fabricantes, distribuidores, retail). [V] |
| **Producto estrella** | **TellMe**, analista de tesorería agéntico (feb 2026). [V] |
| **CTO** | Víctor Cuenca, desde septiembre de 2026 (ex-Twilio, MessageBird, Bitvavo). [V] |
| **Naturaleza regulatoria** | **No es una entidad de pago regulada.** Es una capa de software sobre infraestructura regulada de terceros (agregadores como Flanks, Afterbanks, Plaid, Airwallex). [V] |

### 3.2 Qué vende, módulo a módulo [INF, V]

Nueve módulos comerciales: **1** Bank Connectivity · **2** ERP Connectivity · **3** Cashflow Management & Forecasting · **4** Intercompany Operations · **5** **Risk Management (contraparte + deuda)** · **6** Bank Reconciliation · **7** PSP Reconciliation · **8** Payment Flows & Execution · **9** Approval Flows. Más superficies no tarifadas: Global Banking (IBANs locales en 22 países, jul 2026), Business Rules y TellMe.

Para este reto los módulos que importan son:

- **Risk Management = Counterparty Management + Debt Management** [V, `embat.io/financial-risk-management`]. Es el hogar natural de un score de salud financiera dentro del producto de Embat. Lo que hace hoy, literal de sus páginas:
  - *Counterparty Management*: «Monitor credit risk, track DSO and DPO automatically from actual paid invoices»; **aging buckets 0–30 / 31–60 / 61–90 / 90+ días** actualizados en tiempo real con análisis de desviación; «Real-time deviation alerts flag deteriorating counterparties before overdue balances escalate»; «TellMe monitors counterparty behaviour continuously and flags risks before they materialise». Métrica de impacto: «reduce overdue receivables by 22 % on average» [E].
  - *Debt Management*: préstamos, líneas de crédito, leasing, renting y estructuras bullet; tipos variables (EURIBOR 1M–12M, €STR); conciliación de cargos bancarios contra condiciones pactadas; «smart alerts for upcoming maturities and interest rate review dates». En mayo de 2026 añadieron un **Consolidated Debt Report** (total mensual a debitar por banco y producto, con principal, intereses e impuestos).
  - **No cubre** FX, derivados ni covenants, aunque la home menciona «covenant breaches» [INF §7.2]. **Y no existe ningún «score», «rating», «health score» ni «scoring» en producto, marketing, pricing ni changelog** [V]. Su vocabulario es DSO/DPO, aging, *deviation*, *deteriorating counterparties*, *credit exposure*.
  - **El hueco exacto [H]:** hoy Embat mide riesgo **sobre las contrapartes** de su cliente (¿me van a pagar mis clientes?), no **sobre el propio cliente** (¿cómo está mi empresa y hacia dónde va?). El reto pide lo segundo, con los mismos ingredientes (facturas, DSO/DPO, deuda) que Embat ya calcula para lo primero.
- **Cashflow Management & Forecasting.** TellMe ya modela el **comportamiento real de pago de cada contraparte**: la entrada del changelog de febrero de 2026 «Forecast date adjustment» dice «Not all clients pay on the exact due date. TellMe cross-references historical payment behaviour with the current dates in your forecasts and proposes adjustments when the difference is significant. You decide what to apply» [V]. La previsión también incorpora el *headroom* dispuesto y no dispuesto en confirming, factoring y líneas revolving [V]. Eso son literalmente dos de las señales que pide el brief («comportamiento de pago», «saldos de deuda»).
- **TellMe en modo Silent/Guided.** TellMe ejecuta tareas en background y propone con contexto cuando hace falta criterio humano [INF §4.4]. El bonus «monitor que avisa» encaja de forma natural como una tarea más de TellMe, y su patrón «propone, tú decides» es el que debe seguir cualquier alerta del sistema.

### 3.3 Qué son los clientes de Embat y por qué el dataset se parece a ellos [H]

Los clientes de Embat son **grupos empresariales del mid-market** con varias sociedades, varios bancos y varias divisas, que conectan sus bancos y su ERP a Embat. El dataset del reto reproduce exactamente esa forma: **250 grupos con 1.286 empresas (de 1 a 24 por grupo, mediana 2)**, cada empresa con país, moneda y ERP, con cuentas bancarias, productos de deuda, movimientos y facturas del ERP. Es decir, **cada «empresa» del dataset es un cliente tipo de Embat**, y el rastro financiero es el que Embat ya tiene de sus 400+ clientes reales. Esa es la razón por la que «la empresa que os entrega los datos es el comprador más obvio»: Embat es quien posee este rastro a escala y quien puede vender lo que se construya encima.

### 3.4 Cómo piensa Embat la IA: lo que van a premiar [INF §5.1, V]

Embat tiene un blog técnico público (`embat.io/tech`) que describe cómo construyen IA en finanzas. Estos principios son el criterio implícito del jurado técnico y **deben respetarse en la solución**:

> *«Let the model interpret intent, and let deterministic code do the work.»*
> *«A cheap, deterministic method runs first, and the LLM is only invoked when determinism isn't enough — and even then its answer is treated as a proposal, not a fact.»*

- **Determinismo primero.** Los números los calcula código. El LLM interpreta intención y redacta; nunca calcula un importe ni un score.
- **La salida del modelo nunca se escribe directamente** en el libro mayor. Todo es propuesta con traza.
- **Traza de auditoría y reversibilidad.** Se preserva la propuesta original, las ediciones del humano y un resumen en lenguaje llano.
- **Tasa de aceptación como métrica principal de calidad**: *«A drop in acceptance for one agent is a far more honest quality alarm than any offline benchmark.»*
- **Multi-proveedor** (Claude Managed Agents + Google ADK), Claude Code como entorno de desarrollo, prompt caching agresivo.

Traducido al reto: un score **determinista y explicable por construcción** (señales calculadas con código, ponderaciones visibles, cambios atribuibles a señales concretas) con un LLM **solo** para redactar la explicación en lenguaje llano o para conversar sobre ella, habla el idioma de Embat. Un LLM que «adivine» el score, pierde.

### 3.5 Stack y API de Embat, por si la solución quiere «hablar su idioma» [INF §5.2–5.3, V]

- **Backend:** API pública v2 en **Python + FastAPI**; Google Cloud (`europe-west3`), Firebase, BigQuery como almacén analítico con una «Semantic Layer» propia.
- **Frontend:** React + Vite, Redux Toolkit, TanStack Query, MUI, AG Grid.
- **API pública:** `https://api.embat.io/openapi.json`, 59 paths, 104 operaciones, JWT por email+password, paginación por cursor, **sin webhooks**, filtros de fecha de máximo 90 días, todo con scope a un único `companyId` (**no hay endpoints de grupo**: un holding hace fan-out manual).
- **Modelo de dominio de la API** (es el mismo que el del dataset, ver §5.3):

```
Bank (relación bancaria)
  └─ Product (cuenta corriente / línea de crédito / tarjeta / préstamo / ahorro / wallet)
       ├─ Balance   (saldo de CIERRE DE DÍA, uno por producto y día)
       └─ Transaction (movimiento: fecha contable y fecha valor, importe, saldo posterior,
                       tipo auto-clasificado, flag reconciled, categorías)
Operation (factura/efecto con UN vencimiento; pendingAmount decrece hasta paid)
Payment (puente entre una Transaction y N Operations)
DebtScheduleConfig (condiciones + calendario de amortización de una deuda)
```

Datos de la API sin credenciales: **todos los endpoints devuelven 401**; el sandbox se pide a `tech@embat.io`. Para el reto no hace falta la API: el dataset ya trae los datos. Pero conocer el modelo ayuda a diseñar el producto como algo que Embat podría enchufar.

### 3.6 Huecos de producto de Embat que el reto puede tocar [INF §7, V]

- Sin objeto de **covenant** ni de **score/rating** en la API ni en el producto [V]. `Risk Management` cubre contraparte y deuda de forma descriptiva (aging, desviaciones, vencimientos).
- El riesgo se mide sobre las **contrapartes** del cliente, no sobre el **cliente mismo** (§3.2).
- Sin **alertas proactivas** expuestas por API (`webhook` = 0). TellMe Silent es interno.
- Sin **vista de grupo** consolidada en la API (todo es por `companyId`), aunque el producto sí agrupa sociedades y el dataset está organizado por grupos.
- Sin **financiación de circulante**, sin marketplace de financiación, sin partnership público con banco, aseguradora o factor, y sin nada llamado «Embat Capital» [V, búsqueda sin resultados]. Lo más cercano es **Global Banking** (jul 2026): cuentas gestionadas por Embat bajo marco EMI de un proveedor regulado no nombrado, con saldos en cuentas de salvaguarda segregadas, 60+ divisas y 150+ países. Embat se está acercando a **mover** dinero, no todavía a **prestarlo**. Un score de salud es la pieza que falta para dar ese paso.

### 3.7 La tesis del inversor: por qué a Embat le interesa un score [INF, V]

Cathay Innovation (lead de la Serie B, mayo 2026) explica por qué invirtió en un post público (`cathayinnovation.com/behind-the-term-sheet-embats-e30m-series-b/`). Citas literales [V]:

> «The longer-term bet is that workflow ownership earns transaction ownership»: «a CFO who runs treasury through Embat doesn't just manage cash better, they eventually move it».
> «Owning the workflow is the path to owning the transaction, and that opens a second commercial vector into the $500B global corporate payments market».
> «...moves Embat from software budgets into corporate banking economics».
> «Clean, connected, owned data is what the AI layer runs on».

Mercado según Cathay: mid-market europeo con **4.000 M$** de oportunidad; **más de tres cuartos** de los clientes de Embat son economía tradicional (fabricantes, distribuidores, retail). Uso de la Serie B: expansión a **UK y DACH**.

**Lo que Cathay NO dice [V]:** no menciona «risk», «credit», «lending» ni «financing» como vector. Su tesis es pagos, no crédito. Por tanto el argumento «un score de salud es el puente entre los datos de workflow y un producto financiero (crédito, seguro, marketplace) que lleva a Embat a *corporate banking economics*» es una **inferencia [H]** coherente con la tesis, y hay que presentarla como tal, no como cita.

---

## 4. Análisis del problema

### 4.1 Qué se pide, en términos de ingeniería

Tres entregables encadenados, de los que el primero condiciona a los demás [PDF]:

1. **Un motor de score.** Función que, para cada empresa (o grupo, ver §4.3) y cada mes M1…M24, produce un número de salud financiera y una descomposición explicable de ese número. Debe capturar **nivel y trayectoria**, en **ambas direcciones**, distinguir **bache de deterioro**, y **generalizar** a empresas nunca vistas.
2. **Una predicción sobre el test oculto.** 60–80 empresas «sin resultado» que entran en un **leaderboard**. Formato y métrica no especificados en el brief [?].
3. **Un producto vendible encima del score**, con **comprador identificado** y **demo navegable**.

Más dos bonus: **anticipación medida** (cuántos meses antes) y **monitor que avisa** solo.

### 4.2 Lo que el brief dice que NO es

- **No es predicción de quiebras** («Esto no va de predecir quiebras»). Un clasificador binario de default «se queda corto».
- **No es una foto** del último mes. Es trayectoria.
- **No es una caja negra.** Cada número tiene que poder explicarse y cada cambio atribuirse a una señal y un momento.
- **No es solo un modelo.** «El score solo no es la entrega.» Y «un modelo sencillo con un producto claro encima nos interesa más que uno sofisticado que se queda en el número».
- **No es un notebook.** La demo se abre y se prueba delante del jurado.

### 4.3 Unidad de análisis: ¿empresa o grupo? [?]

El brief usa «250 empresas» en la cabecera y «1.286 empresas sintéticas agrupadas en 250 grupos empresariales» en el dataset. El test oculto son «60–80 empresas» de 250. Por tanto **la unidad que se puntúa en el leaderboard es casi seguro el grupo empresarial** (`groups.csv`), y las 1.286 filas de `companies.csv` son las sociedades que lo componen [H]. Pero el brief también pide contestar «empresa por empresa y mes a mes».

Decisión recomendada hasta que el `data_dictionary.md` o los organizadores lo aclaren [H]: calcular señales **a nivel de sociedad** (`company_id`, que es la clave que cruza todo), **consolidar a nivel de grupo** (suma de saldos y flujos convertidos a una moneda común, intercompany neteado si se puede identificar) y producir el score **a los dos niveles**, entregando al leaderboard el que corresponda. Preguntar el primer día qué unidad espera el leaderboard.

### 4.4 El «resultado» oculto y el aprendizaje supervisado [?]

«60–80 empresas **sin resultado**» implica que las otras ~170–190 **sí tienen resultado**: alguna etiqueta, score o trayectoria de referencia generada por el simulador. El brief lista 8 CSV + `data_dictionary.md` pero dice «**nueve ficheros CSV**». Hipótesis fuerte [H]: **existe un noveno CSV con el resultado** (por ejemplo un score mensual o una etiqueta de estado por empresa/grupo para el conjunto de entrenamiento) que el brief no lista o que se entrega aparte. Hay que comprobarlo **en cuanto se descargue el dataset**.

Dos escenarios y hay que estar preparado para ambos:

| Escenario | Qué hay | Enfoque |
|---|---|---|
| **A. Hay etiqueta** (score o clase mensual de referencia para ~170–190 grupos) | Problema supervisado: aprender a reproducir el score del simulador en grupos no vistos. | Ingeniería de señales (§6) + modelo **simple y explicable** (regresión regularizada, GBM pequeño con SHAP, o modelo aditivo) validado con *group k-fold* por grupo. La explicación sale de las contribuciones de las señales. |
| **B. No hay etiqueta** | Problema no supervisado: definir el score desde el dominio. | Score **compuesto por construcción**: señales normalizadas (por percentiles del universo o por sector/tamaño), ponderadas con criterio de dominio, con componente de nivel y componente de tendencia. Validación por consistencia: separa a las empresas que acaban impagando/agotando líneas de las que no, y por *face validity* en casos como Northbrook/Velasco. |

En los dos casos, el brief valora **generalización**, así que la validación debe ser siempre por grupos enteros que el modelo no ha visto, nunca por filas.

### 4.5 Qué significa «trayectoria, no foto»

El gráfico del brief es la definición operativa [PDF]: dos empresas con **el mismo nivel** hoy (65 vs 68) y **trayectorias opuestas** (45→65 subiendo vs 82→68 bajando). El sistema tiene que decir que Northbrook es mejor riesgo que Velasco a pesar de estar tres puntos por debajo. Implicaciones para el diseño:

- La salida por empresa y mes debe incluir, como mínimo, **nivel** (el score), **dirección** (tendencia sobre una ventana, p. ej. pendiente a 3 y 6 meses) y **régimen** (estable / mejorando / deteriorándose / bache puntual).
- «Bache o caída» exige separar **shock transitorio** (un mes malo de caja que revierte) de **cambio estructural** (varias señales se mueven de forma persistente en la misma dirección). Esto pide ventanas móviles, persistencia de la señal y, probablemente, detección de cambio de régimen (*change-point*).
- «Cuándo se vio venir» exige poder decir, a posteriori, **en qué mes el sistema habría levantado la mano** respecto al mes en que el deterioro (o la mejora) es evidente en los números. Ese desfase en meses es la métrica de anticipación del bonus.

### 4.6 Qué significa «explicarse»

Para **una empresa cualquiera** [PDF] hay que poder decir (a) **por qué saca ese número** (qué señales lo componen y cuánto pesa cada una) y (b) **qué lo movió desde el mes pasado** (qué señal cambió, cuánto, y cuándo). La explicación tiene que ser **atribuible y determinista** (§3.4). Un LLM puede redactarla, no inventarla.

### 4.7 Qué significa «producto encima» y «comprador identificado»

El brief da cuatro ejemplos de producto: **un marketplace, una póliza, una línea de circulante, un agente** [PDF]. Y una pista sobre el comprador: **Embat**. No pide plan de negocio, pide **una respuesta**: quién paga y por qué le sale a cuenta. Ver §9.

---

## 5. El dataset

### 5.1 Hechos [PDF]

- **1.286 empresas sintéticas** en **250 grupos**; de 1 a 24 empresas por grupo, mediana 2.
- **24 meses**: septiembre 2024 → septiembre 2026. `balances.csv` es la foto a **1 de septiembre de 2026**.
- Generado a partir de la **distribución estadística de datos reales de tesorería de pymes**: volúmenes, estacionalidad, patrones de contraparte y condiciones de financiación «se comportan como los de verdad». Ninguna fila es real.
- **Clave de cruce:** `company_id` en `companies.csv`.
- **Test oculto:** 60–80 empresas (grupos) sin resultado.

### 5.2 Ficheros y su contenido esperado

Lo que el brief dice de cada fichero está en §2.5. Esta tabla añade, marcado [H]/[API], la estructura probable, inferida de que el dataset replica el modelo de datos de Embat (§3.5). **Sustituir por el esquema real de `data_dictionary.md` cuando se tenga.**

| Fichero | Grano | Campos confirmados [PDF] | Campos/valores probables [H, API] |
|---|---|---|---|
| `groups.csv` | 1 fila por grupo | id de grupo, tamaño (1–24 empresas) | nombre, posiblemente moneda de consolidación (`groupCurrency` existe en la API) |
| `companies.csv` | 1 fila por empresa | `company_id`, grupo, país, moneda, ERP, fecha de alta | El ERP probablemente usa los valores del `ErpEnum` de Embat (netsuite, sageX3, odoo, businessCentral, holded, a3, sage50, s4, datev…). La **fecha de alta** es la fecha de incorporación a Embat: condiciona cuántos meses de historia tiene cada empresa [?]. |
| `banking_products.csv` | 1 fila por cuenta/producto | tipo (corriente, tarjeta, TPV, ahorro, inversión, plataforma de gastos), banco, moneda | `company_id`, id de producto. En la API los tipos son `checking`, `savings`, `card`, `loan`, `lineofcredit`, `wallet`; posible `balanceCreditGranted` para líneas. |
| `debt_products.csv` | 1 fila por producto de deuda | tipo (préstamo, leasing, línea de crédito, hipoteca, renting, factoring, confirming, aval), **importe concedido**, **saldo pendiente** | `company_id`, banco, moneda, fechas. Para líneas de crédito, concedido vs dispuesto da la **utilización**. |
| `debt_schedule_config.csv` | 1 fila por préstamo con cuadro | tipo de cuota, frecuencia, número de plazos, tipo de interés, próxima fecha de pago | Réplica de `DebtScheduleConfigSchema` [API]: `amortisingFrequency` (monthly/quarterly/semiannually/yearly), `outstandingBalance`, `grantedBalance`, `totalPeriods`, `nextPaymentDate`, `lastPaymentDate`, `annualInterestRateOrSpread`, `interestType` (fixed/variable). Es la fuente del **coste de financiación** y del **servicio de la deuda** futuro. |
| `transactions.csv` | 1 fila por movimiento | fecha, importe, categoría, estado de conciliación, contraparte, concepto del banco | `company_id`, id de producto/cuenta, posiblemente fecha contable y fecha valor, saldo posterior. La categoría probablemente sigue el `TransactionTypeEnum` de Embat [API]: `payment`, `debt_repayment`, `fee`, `tax`, `utility`, `social_security`, `bulk_payment`, `cash_withdrawal`, `pos_withdrawal`, `collection`, `pos_settlement`, `cash_settlement`, `collection_refund`, `bulk_collection`. Estado de conciliación: reconciliado / no. |
| `invoices.csv` | 1 fila por factura (o por vencimiento) | emitidas y recibidas; emisión, vencimiento, fecha de cobro o pago, importe pendiente, estado, contraparte | Réplica de `Operation` [API]: `issuanceDate`, `dueDate`, `paymentDate`, `amount`, `pendingAmount`, `status` (`pending`, `overdue`, `paid`, `payment_in_progress`, `paymentOrder`, `cancel`), sentido (cobro/pago), contacto. En Embat **una factura con 3 vencimientos son 3 operations**: comprobar el grano [?]. |
| `balances.csv` | 1 fila por cuenta/producto | saldo a 1 de septiembre de 2026 | **Solo la foto final.** Los saldos históricos hay que **reconstruirlos hacia atrás** desde `transactions.csv` (saldo final − suma de movimientos posteriores) o desde el saldo posterior por movimiento si viene [H]. |
| `data_dictionary.md` | — | todos los campos explicados | — |
| **noveno CSV [?]** | — | — | Posible fichero de **resultado/etiqueta** para el conjunto de entrenamiento. Ver §4.4. |

### 5.3 Correspondencia dataset ↔ API de Embat [H, API]

| Dataset | Recurso de la API de Embat |
|---|---|
| `companies.csv` | `Companies` (+ `config.accountingCurrency`, `tags`) y `ErpEnum` |
| `banking_products.csv` | `Products` con `type` de cuenta (`checking`, `savings`, `card`, `wallet`) |
| `debt_products.csv` | `Products` con `type` de deuda (`loan`, `lineofcredit`) + `balanceCreditGranted`, `arrangedBalance` |
| `debt_schedule_config.csv` | `DebtScheduleConfigs` (BETA en la API) |
| `transactions.csv` | `Transactions` (`operationDate`, `valueDate`, `amount`, `type`, `reconciled`, `concept`, `categories`) |
| `invoices.csv` | `Operations` (`issuanceDate`, `dueDate`, `paymentDate`, `pendingAmount`, `status`, `contact`) |
| `balances.csv` | `Balances` (saldo de cierre de día por producto) |

Esta correspondencia es la razón práctica por la que un producto construido aquí se puede presentar como **algo que Embat podría enchufar a sus datos reales sin cambiar el modelo**.

### 5.4 Trampas de datos que hay que esperar [C, H]

- **Multidivisa.** Empresas con moneda distinta dentro del mismo grupo. Consolidar exige un tipo de cambio; si el dataset no lo trae, fijar uno constante y documentarlo [?].
- **Intercompany.** En un holding, cobros y pagos entre filiales inflan volúmenes y no son actividad real. Si `contraparte` permite identificar filiales del mismo grupo, netearlas para el score de grupo.
- **Fecha de alta.** Una empresa dada de alta en 2026 tiene pocos meses de historia. Las señales de tendencia necesitan mínimo de observaciones; hay que decidir qué hacer con historia corta.
- **Estacionalidad.** El brief dice que existe. Comparar cada mes con el mismo mes del año anterior (hay exactamente dos septiembres) y con medias móviles, no solo con el mes anterior.
- **Facturas vs movimientos.** Las facturas dicen qué se debía y cuándo; los movimientos dicen qué pasó de verdad. Las señales de comportamiento de pago salen de **cruzar** las dos: días reales de cobro/pago vs vencimiento.
- **Conciliación.** El estado de conciliación puede ser una señal de calidad operativa (una empresa con mucho sin conciliar está peor gestionada) o simplemente ruido del generador. Verificar antes de usarlo.
- **Test oculto.** Las 60–80 empresas de test estarán (presumiblemente) en los mismos ficheros con todo su rastro pero sin resultado. No hay que entrenar con ellas si hay etiqueta; sí se pueden usar para normalizaciones no supervisadas, con cuidado.

---

## 6. Catálogo de señales candidatas

«De ahí salen las señales. El trabajo está en decidir cuáles importan» [PDF]. Este catálogo enumera lo que el dominio sugiere [C], organizado por fuente. No hay que usarlas todas: hay que elegir pocas, justificarlas y hacerlas explicables. Cada señal se calcula **mes a mes** y se puede derivar en nivel, tendencia y volatilidad.

### 6.1 Liquidez y caja (de `transactions.csv` + `balances.csv` + `banking_products.csv`)

- **Saldo de caja consolidado** por mes (reconstruido) y su tendencia.
- **Runway / cobertura de caja**: saldo ÷ salidas operativas medias mensuales. Cuántos meses aguanta sin cobrar nada.
- **Flujo de caja operativo neto** mensual (cobros − pagos, excluyendo deuda y financiación) y su estabilidad.
- **Volatilidad de caja**: desviación del saldo o del flujo neto sobre ventana móvil. Un mes malo aislado (bache) frente a varios meses de flujo negativo (caída).
- **Mínimo de caja intra-mes** y frecuencia de saldos cercanos a cero o negativos (descubiertos).
- **Uso de tarjeta / plataforma de gastos** vs cuenta corriente (proxy de tensión de circulante si crece).
- **Ahorro e inversión**: existencia y evolución de saldos en productos de ahorro/inversión (señal de solidez).

### 6.2 Comportamiento de cobro (de `invoices.csv` emitidas + `transactions.csv`)

- **DSO** (días de cobro) real: fecha de cobro − fecha de emisión, ponderado por importe. Tendencia.
- **Retraso medio de cobro** respecto a vencimiento (días de mora de los clientes).
- **% de facturas emitidas vencidas y pendientes**, por antigüedad (0–30, 30–60, 60–90, >90).
- **Concentración de clientes**: peso del mayor cliente y de los 5 mayores en la facturación (HHI). Tendencia.
- **Crecimiento de la facturación emitida** (mensual, interanual, suavizado).
- **Tasa de abonos/devoluciones** (`collection_refund`).
- **Churn de contrapartes**: clientes que dejaban de facturar.

### 6.3 Comportamiento de pago (de `invoices.csv` recibidas + `transactions.csv`)

- **DPO** (días de pago a proveedores) real y su tendencia. **Un DPO que se alarga sin que suba el DSO es la señal clásica de que la empresa estira pagos porque le falta caja** [C].
- **Retraso propio** respecto a vencimiento: cuántos días tarde paga la empresa a sus proveedores. Es la señal más directa de «comportamiento de pago».
- **% de facturas recibidas vencidas**, por antigüedad.
- **Pagos a Hacienda y Seguridad Social** (`tax`, `social_security`): regularidad. Retrasos aquí son señal fuerte de tensión [C].
- **Nóminas** (si se identifican por categoría/concepto): regularidad y variación (despidos, crecimiento).
- **Comisiones bancarias** (`fee`): crecimiento como proxy de descubiertos, devoluciones o financiación cara.

### 6.4 Ciclo de conversión de caja

- **CCC = DSO + DIO − DPO**. Sin inventario (DIO) en el dataset, usar **DSO − DPO** como ciclo neto de circulante y su tendencia.
- **Cobertura de pagos por cobros**: cobros del mes ÷ pagos del mes, suavizado.

### 6.5 Deuda y coste de financiación (de `debt_products.csv` + `debt_schedule_config.csv` + `transactions.csv`)

- **Apalancamiento**: deuda pendiente total ÷ cobros anualizados (o ÷ caja).
- **Utilización de líneas de crédito**: dispuesto ÷ concedido. Una línea al 90 % de forma persistente es tensión; una línea que se dispone y se devuelve es normal [C].
- **Servicio de la deuda** futuro (del cuadro de amortización: principal + intereses de los próximos 3/6/12 meses) ÷ flujo de caja operativo → **DSCR**. Cobertura de la deuda con caja generada.
- **Coste medio de financiación**: tipo de interés ponderado por saldo; tipo fijo vs variable. Empeoramiento del coste en nuevas deudas es señal de que los bancos ven más riesgo [C].
- **Dependencia de financiación de circulante**: peso de factoring y confirming sobre la deuda total y sobre la facturación. Crecimiento del factoring es señal ambigua: puede ser gestión activa o necesidad.
- **Cumplimiento de cuotas**: cruzar `nextPaymentDate` y cuotas del cuadro con `debt_repayment` en `transactions.csv`. **Cuotas no pagadas o pagadas tarde** es la señal más dura del dataset [C].
- **Avales** otorgados: exposición contingente.
- **Nueva deuda** contratada en el mes (señal de inversión o de socorro según contexto).
- **Vencimientos concentrados** (muro de vencimientos) en los próximos meses.

### 6.6 Estructura y contexto (de `groups.csv` + `companies.csv`)

- **Tamaño del grupo** y dispersión de países/monedas/ERPs.
- **Antigüedad** (fecha de alta): cuántos meses de historia hay.
- **Dependencia intra-grupo**: peso de flujos intercompany si son identificables.
- **País/moneda** como variables de contexto para normalizar, no como señal de salud por sí mismas.

### 6.7 Derivadas de trayectoria (aplicables a cualquier señal)

- **Tendencia** (pendiente sobre 3, 6 y 12 meses).
- **Aceleración** (cambio de la tendencia).
- **Persistencia**: número de meses consecutivos en la misma dirección.
- **Distancia a la propia media** (z-score sobre la historia de la empresa) frente a **distancia a la media del universo** (percentil entre las 250). Lo primero detecta cambio; lo segundo, nivel.
- **Estacionalidad**: comparación interanual (M13 vs M1, …, M24 vs M12).
- **Detección de cambio de régimen** (*change-point*): el mes en que una señal deja su comportamiento anterior. Es lo que permite medir «cuándo se vio venir».

### 6.8 Cómo elegir [H]

El brief y la rúbrica premian un **modelo sencillo con un producto claro** frente a uno sofisticado. Criterio propuesto: entre 8 y 15 señales, cada una con (a) una lectura de dominio en una frase, (b) dirección conocida (más es mejor / peor), (c) normalización definida, (d) contribución visible al score. Si una señal no se puede explicar en una frase a un CFO, no entra.

---

## 7. Requisitos como criterios verificables

Definición de «terminado» derivada de §2.6 y §2.7. Cada línea es comprobable.

### 7.1 Obligatorios

| # | Requisito | Se cumple cuando… | Evidencia a enseñar |
|---|---|---|---|
| R1 | **Predicción sobre el test oculto** | Existe un fichero de predicciones para las 60–80 empresas de test en el formato que pida el leaderboard [?], generado por el mismo pipeline que el resto. | El fichero, y el comando que lo produce de forma reproducible. |
| R2 | **Señal en las dos direcciones** | El score sube en empresas que mejoran y baja en las que empeoran; hay casos de ejemplo de cada tipo; la métrica de validación se reporta por separado para mejoras y deterioros. | Tabla de métricas por dirección; dos casos tipo Northbrook y Velasco del dataset. |
| R3 | **Trayectoria, no foto** | La salida incluye nivel, dirección y régimen por empresa y mes; dos empresas con el mismo nivel y trayectorias opuestas reciben lecturas distintas. | La pantalla de una empresa mostrando los 24 meses y el veredicto de trayectoria. |
| R4 | **Explicación** | Para cualquier empresa y mes se lista qué señales componen el score con su peso, y qué señal cambió respecto al mes anterior, cuánto y cuándo. Determinista y reproducible. | Panel de explicación en la demo; texto en lenguaje llano generado a partir de esa descomposición. |
| R5 | **Producto encima del score** | Hay una funcionalidad que usa el score para hacer algo que alguien haría de verdad (decidir, ofrecer, alertar, priorizar), no solo mostrarlo. | La demo, recorrida como la usaría el comprador. |
| R6 | **Comprador identificado** | Se puede contestar en dos frases quién paga y por qué le sale a cuenta, con un número de referencia. | Una diapositiva. |
| R7 | **Demo navegable** | Hay una URL pública que el jurado puede abrir y usar sin ayuda. | La URL, probada desde otro dispositivo. |
| R8 | **Entrega en la plataforma** [V, §1.1.1] | El proyecto está enviado con `hackspain submit` al track de Embat, con **repositorio de GitHub público**, URL de demo y **vídeo** (los jueces puntúan viendo el vídeo embebido), antes de que la organización cierre el formulario. | Confirmación del envío final. |

### 7.2 Bonus

| # | Requisito | Se cumple cuando… | Evidencia |
|---|---|---|---|
| B1 | **Anticipación medida** | Para los casos de cambio del dataset se calcula el desfase en meses entre la alerta del sistema y el mes en que el cambio es evidente; se reporta la distribución (mediana, percentiles). | Gráfico o tabla de anticipación; definición explícita de «evidente». |
| B2 | **Monitor que avisa** | Sin que nadie pregunte, el sistema emite una lista de empresas que «se mueven de verdad» con motivo, y no una por cada oscilación. Tasa de alertas razonable. | Bandeja de alertas en la demo; regla de disparo explicada. |

### 7.3 Criterios implícitos del jurado técnico [INF §5.1, §8.3]

- Los números los calcula código determinista. El LLM interpreta y redacta.
- Hay traza: para cada score se puede reconstruir de qué datos salió.
- La calidad se mide con algo honesto (métrica en grupos no vistos, tasa de aceptación de alertas), no con un benchmark de juguete.
- El sistema entiende el dominio (DSO, DPO, utilización, servicio de deuda) y no es «un chatbot con un CSV».

### 7.4 Errores que descalifican [PDF, INF]

- Entregar un detector de quiebras / clasificador binario.
- Un score que solo mira el último mes.
- Una caja negra sin descomposición.
- Un LLM que calcula o inventa el número.
- Un notebook, o una demo que solo funciona en un portátil.
- No saber decir quién paga.
- Decir «tiempo real» o «funciona» sin poder demostrarlo.

---

## 8. Espacio de diseño del motor de score

Opciones razonables, con sus compromisos. No es una decisión: es el mapa para decidir rápido.

### 8.1 Escala y semántica

- Escala **0–100** como en el gráfico del brief [PDF]. Más alto = más sano.
- Definir qué significa cada tramo en una frase (por ejemplo: >80 sólida, 60–80 sana, 40–60 vigilar, <40 tensión) para que el producto lo use.
- Salida mínima por empresa-mes: `score`, `trend_3m`, `trend_6m`, `regime` (stable / improving / deteriorating / blip), `top_drivers` (señal, contribución, cambio vs mes anterior), `alert` (bool + motivo).

### 8.2 Arquitecturas candidatas

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| **A. Score compuesto por reglas** (índice ponderado de señales normalizadas) | Cada señal → percentil o z-score → peso → suma → 0–100. Componente de trayectoria como término aparte. | Explicable por construcción; determinista; se hace en horas; encaja con Embat (§3.4). | Pesos «a ojo»; generalización no se puede demostrar si no hay etiqueta salvo por validez de dominio. |
| **B. Modelo supervisado explicable** (si hay etiqueta) | Señales + regresión regularizada / GBM pequeño / modelo aditivo (GAM/EBM) sobre el resultado del simulador. SHAP o contribuciones aditivas para explicar. | Métrica real en grupos no vistos; pesos aprendidos. | Depende de que exista el resultado (§4.4); riesgo de sobreajuste con ~180 grupos; hay que validar por grupo. |
| **C. Híbrido** | Score compuesto (A) como base; modelo (B) para calibrar pesos y para predecir el resultado del leaderboard; la explicación siempre sale de las señales. | Lo mejor de ambos; robusto si el leaderboard mide algo distinto a lo que el índice captura. | Más trabajo; dos cosas que mantener coherentes. |

Para trayectoria y anticipación, en cualquiera de las tres: ventanas móviles, persistencia, y un detector de cambio de régimen sencillo (CUSUM, cambio de pendiente sostenido, o umbral sobre z-score de la propia historia).

### 8.3 Validación [H]

- **Siempre por grupo**: *group k-fold* con todas las sociedades de un grupo en el mismo fold.
- Reportar por separado: nivel (correlación / error contra el resultado, si existe), dirección (acierto del signo de la tendencia), «las dos caras» (mejoras vs deterioros), estabilidad (falsos positivos en baches), anticipación (meses).
- Tener **tres o cuatro casos narrativos** del dataset: una sólida, una que mejora, una que se tuerce, una con un bache que revierte. Son los que se enseñan al jurado.

### 8.4 Papel del LLM [INF §5.1]

Permitido y deseable: redactar la explicación en lenguaje llano a partir de la descomposición determinista; contestar preguntas sobre una empresa citando las señales; resumir la bandeja de alertas. **No permitido:** producir el score, las contribuciones o cualquier número que luego se presente como dato.

---

## 9. Producto encima del score y comprador

### 9.1 El comprador obvio: Embat [PDF, INF]

El brief lo dice dos veces: «la empresa que os entrega los datos es el comprador más obvio» y «la empresa que genera los datos es el candidato obvio». Por qué le sale a cuenta [H, con base en INF]:

1. **Ya tiene el rastro.** Embat posee movimientos, facturas, deuda y saldos de 400+ grupos. Un score es una capa de valor sobre datos que ya paga por ingerir. «Clean, connected, owned data is what the AI layer runs on» [V, Cathay].
2. **Tiene dónde ponerlo.** El módulo **Risk Management (Counterparty + Debt)** ya calcula DSO, DPO, aging y desviaciones, y ya avisa de contrapartes que se deterioran (§3.2). Un score con trayectoria y explicación es la versión de eso aplicada **a la propia empresa** en lugar de a sus contrapartes, y hoy **no tiene ningún score ni rating** [V]. TellMe Silent/Guided es la superficie natural del «monitor que avisa».
3. **Es coherente con su tesis de inversor.** «Workflow ownership earns transaction ownership» y «from software budgets into corporate banking economics» [V]: el score es lo que permite pasar de mirar el dinero a intermediarlo (financiación, seguro, marketplace). Global Banking (jul 2026) ya apunta en esa dirección. Es inferencia, ver §3.7.
4. **Sus clientes son grupos.** El dataset está organizado por grupos porque los clientes de Embat lo están. Un score consolidado de grupo con drill-down por sociedad es algo que su API hoy no ofrece (todo es por `companyId`).
5. **Tiene un módulo tarifado donde cobrarlo.** Risk Management y TellMe son módulos «Add» en su configurador de precios [V]. Un score es upsell directo del módulo, o motivo de retención.

### 9.1.1 Referentes de mercado: quién vende ya scores de este tipo [V]

Sirven para explicar al jurado que el comprador existe y qué forma toma el producto en el mercado:

| Referente | Qué es | Por qué importa aquí |
|---|---|---|
| **Plaid LendScore** (oct 2025) | Score 1–99 de riesgo de crédito sobre datos de cash flow en tiempo real más *network insights*, con **reason codes**; afirma «25 % lift in predictive performance» frente a datos de crédito tradicionales. | Es el producto más parecido al motor del reto: score por cash flow, explicable por códigos de motivo, vendido a prestamistas. |
| **Codat Lending API** | Categorización automática, ratios, **cash runway**, identificación de deuda y monitorización continua con conexión viva a contabilidad y banca. | Mismas fuentes que el dataset (banco + ERP) y misma idea de monitorización continua. |
| **Kabbage** | Underwriting algorítmico de pymes sobre cash flow en tiempo real; comprado por American Express en 2020. | Prueba de que la financiación de circulante por flujo de caja es un negocio que se compra caro. |
| **Allianz Trade Grade Check** | Escala 1–10, «likelihood of a partner defaulting within the next 12 months», vendido por unidad o paquete, vía portal o API en el ERP. | Cómo una aseguradora de crédito tarifica y vende un score: la «póliza» del brief. |
| **Coface DRA** | Escala 0–10, cada grado con probabilidad de impago a 12 meses. | Ídem. |
| **CIRBE** (Banco de España) | Registro central de riesgos crediticios. | Contexto regulatorio español de información de riesgo. |
| **Taulia** | Plataforma de financiación de circulante (supply chain finance). Su cofundador, Maex Ament, es **mentor en HackSpain 2026**. | Si el producto es una línea de circulante o un marketplace, es la persona a la que consultar en el evento. |

Agicap y Qonto hablan de «financial health» como visibilidad de caja, sin un score con marca propia [V]. Crédito y Caución (Atradius) no publica su escala de buyer rating.

### 9.2 Cuatro familias de producto sugeridas por el brief [PDF] y a quién se venden

| Familia | Qué sería | Quién paga y por qué |
|---|---|---|
| **Agente / monitor** | Un agente (o una tarea de TellMe) que vigila el score de cada empresa del grupo, avisa cuando se mueve de verdad, explica por qué y propone qué mirar. | **Embat**, como feature de Risk Management / TellMe: retención y upsell del módulo. El CFO del cliente, indirectamente, por no enterarse tarde. |
| **Línea de circulante / financiación** | Pre-aprobación o pricing de una línea de circulante, factoring o confirming basada en el score y su trayectoria, ofrecida dentro del flujo de tesorería. | **Embat** (comisión de originación con bancos o financiadores partner) y **el financiador** (menor coste de underwriting: el rastro ya está limpio y actualizado). Encaja con la tesis de Cathay. |
| **Póliza / seguro** | Seguro de crédito o de impago tarificado con el score (de la empresa o de sus contrapartes), con prima que se ajusta a la trayectoria. | **Aseguradora de crédito** (tarifica mejor y monitoriza en continuo) y **Embat** (distribución). Necesita que el score sea explicable: «nadie compra una caja negra para decidir a quién asegura». |
| **Marketplace** | Mercado donde empresas con score y trayectoria conocidos encuentran financiación, seguro o condiciones de pago, y financiadores encuentran riesgo legible. | **Embat** como operador (take rate) y **financiadores** por acceso a demanda cualificada. Es la opción más ambiciosa y la más difícil de demostrar en 36 h. |

Otros compradores posibles, menos obvios: **la propia pyme** (autodiagnóstico y benchmark frente a sus pares, para negociar con su banco), **el proveedor o cliente** de esa pyme (riesgo de contraparte: «¿me va a pagar tarde?»), **bancos** (underwriting de pymes por flujo de caja). Cualquiera vale si se contesta quién paga y por qué.

### 9.3 Qué hace que la respuesta al comprador sea buena [PDF, H]

- Una frase de quién paga. Una de por qué le sale a cuenta. Un número de referencia (coste evitado, ingreso nuevo, tiempo ahorrado).
- Coherencia con el score: el producto debe **usar** la trayectoria y la explicación, no solo el nivel. Si el producto funcionaría igual con un rating estático, no se ha entendido el reto.
- Coherencia con Embat: si el comprador es Embat, el producto tiene que caber en su modelo de datos (§5.3) y en su forma de hacer IA (§3.4).

---

## 10. Contexto técnico para la demo

- **Demo navegable obligatoria** [PDF]: una URL pública. Los sponsors de infraestructura del evento (Vercel, Cloudflare, Convex, Tinybird) son la vía natural. Comprobarla desde un dispositivo ajeno antes de presentar.
- **Vídeo para los jueces** [V]: la plataforma lo marca como opcional, pero el jurado puntúa con el vídeo embebido. Grabar un recorrido corto de la demo (YouTube, Loom o MP4) y reservar tiempo para ello.
- **Repositorio público** [V]: la entrega exige un repo de GitHub público. Este repositorio tiene que estar inicializado en git y publicado antes del envío (a fecha de este documento no es un repositorio git).
- **Stack de Embat**, por si se quiere hablar su idioma [INF §5.2]: Python + FastAPI en backend, React en frontend, BigQuery como almacén analítico. No es obligatorio replicarlo.
- **Volumen de datos**: 1.286 empresas × 24 meses de movimientos y facturas. Cabe en memoria; un pipeline en pandas/polars o DuckDB es suficiente. Precalcular las señales y el score una vez y servir resultados; no recalcular en cada petición.
- **Reproducibilidad**: un único comando que regenere señales, score, validación y el fichero del leaderboard desde los CSV.
- **Mock de la API de Embat**, si se quiere enseñar cómo se enchufaría: `npx @stoplight/prism-cli mock embat-openapi.json` [INF Anexo A].

---

## 11. Preguntas abiertas [?]

Ordenadas por impacto. Las de datos se cierran al descargar el dataset; las de proceso, preguntando a los organizadores el primer día.

### 11.1 Sobre el leaderboard y la entrega

1. **¿Qué métrica usa el leaderboard?** El brief no la dice y **el leaderboard no está en la plataforma de HackSpain** [V]: es cosa de Embat. ¿Error contra un score de referencia? ¿Ranking? ¿Acierto de dirección? ¿A qué mes o meses?
2. **¿Qué formato tiene la predicción?** ¿Un score por grupo y mes? ¿Solo el último mes? ¿Nivel y tendencia? ¿CSV con qué columnas? ¿Dónde se sube?
3. **¿La unidad es el grupo o la empresa?** Ver §4.3.
4. **¿Cuándo se cierra la entrega del track y la del leaderboard?** La plataforma no publica hora de cierre [V]; la marca la organización. ¿Cuántos envíos al leaderboard se permiten? ¿Es público durante el evento?
5. **¿Qué es exactamente «el resultado»** que a 60–80 empresas les falta? ¿Score, clase, trayectoria, evento?
5b. **¿Tamaño máximo de equipo?** No consta en código ni en web [V].
5c. **¿Quién de Embat juzga el track?** No publicado [V]. Ver también pregunta 15.

### 11.2 Sobre el dataset

6. **¿Existe el noveno CSV?** El brief dice nueve y lista ocho. Si existe y es la etiqueta, cambia el enfoque (§4.4). **El dataset no está publicado en ningún sitio indexado** (GitHub, Kaggle, Hugging Face, Drive) [V]: se distribuye por el canal privado del reto; buscarlo en `hackspain.app/tracks/embat`.
7. **¿Cómo se identifican las empresas de test?** ¿Flag en `companies.csv`/`groups.csv`, ausencia en el fichero de resultado, o lista aparte?
8. **¿Vienen saldos históricos** o solo la foto del 1 de septiembre de 2026? Si solo la foto, hay que reconstruir (§5.2).
9. **¿`transactions.csv` trae fecha contable y fecha valor**, y saldo posterior?
10. **¿`invoices.csv` es por factura o por vencimiento?** ¿Cómo se distingue emitida de recibida? ¿La contraparte permite identificar filiales del mismo grupo (intercompany)?
11. **¿Hay tipos de cambio** para consolidar grupos multidivisa?
12. **¿Qué valores toma `categoría`** en transacciones? ¿Coincide con el `TransactionTypeEnum` de Embat?
13. **¿Qué significa «fecha de alta»** y cuántas empresas tienen menos de 24 meses de historia?
14. **¿El estado de conciliación** es informativo o ruido del generador?

### 11.3 Sobre Embat y el producto

15. **¿Quién de Embat está en el jurado del track** y qué perfil tiene (negocio, producto, ingeniería)? Cambia el énfasis del pitch.
16. **¿Embat quiere el score para sus clientes o sobre sus clientes?** Es decir, ¿el usuario es el CFO que se mira a sí mismo, o Embat/un tercero que mira a la empresa? Las dos lecturas son compatibles con el brief; conviene elegir una para la demo.

---

## 12. Glosario mínimo

| Término | Qué es |
|---|---|
| **TMS** | *Treasury Management System*. Software de tesorería: posición de caja, previsión, pagos, deuda. |
| **ERP** | Sistema de gestión donde viven las facturas y la contabilidad (NetSuite, SAP, Sage, Odoo, Holded, A3…). |
| **Score de salud financiera** | Número (aquí 0–100) que resume la solidez y la trayectoria financiera de una empresa a partir de su comportamiento. |
| **Trayectoria** | Dirección y velocidad del cambio del score o de una señal a lo largo de los meses, frente al **nivel** (la foto). |
| **Bache vs caída** | Shock transitorio que revierte, frente a deterioro estructural persistente. |
| **Anticipación** | Meses entre la alerta del sistema y el momento en que el cambio es evidente en los números. |
| **DSO** | *Days Sales Outstanding*: días que tarda la empresa en cobrar. |
| **DPO** | *Days Payables Outstanding*: días que tarda la empresa en pagar. |
| **CCC** | Ciclo de conversión de caja = DSO + DIO − DPO. Sin inventario, DSO − DPO. |
| **Runway** | Meses que la caja aguanta las salidas medias sin nuevos cobros. |
| **DSCR** | *Debt Service Coverage Ratio*: caja generada ÷ servicio de la deuda (principal + intereses) del periodo. |
| **Utilización de línea** | Dispuesto ÷ concedido en una línea de crédito. |
| **Factoring** | Vender facturas de clientes al banco con descuento para cobrar ya. |
| **Confirming** | El banco paga a los proveedores antes de vencimiento; la empresa paga al banco a vencimiento. |
| **Leasing / renting** | Financiación de activos con cuota; leasing con opción de compra. |
| **Aval** | Garantía prestada; exposición contingente. |
| **Cuadro de amortización** | Calendario de cuotas de un préstamo con desglose principal/interés. |
| **Fecha contable vs fecha valor** | Cuándo el banco anota el apunte vs cuándo cuenta para intereses. |
| **Conciliación** | Casar cada movimiento bancario con su factura o apunte contable. |
| **TPV** | Terminal punto de venta; en el dataset, un tipo de producto bancario que liquida cobros con tarjeta. |
| **Contraparte** | Cliente o proveedor al otro lado de una factura o movimiento. |
| **Intercompany** | Flujos entre sociedades del mismo grupo. |
| **Group k-fold** | Validación cruzada que mantiene todas las filas de un mismo grupo en el mismo pliegue, para medir generalización a grupos no vistos. |

---

## 13. Fuentes

- `Embat_Problem.pdf` — brief oficial del reto, 6 páginas, transcrito en §2. (Fuera del repo, en `~/Downloads`.)
- `INFORME-EMBAT.md` — investigación sobre Embat, sector, regulación, competencia, arquitectura y API, del 18/09/2026. (Fuera del repo.)
- `embat-openapi.json` — spec OpenAPI 3.1 de la API pública de Embat v2.120.53, descargada el 18/09/2026. (Fuera del repo.)
- Enlaces clave de Embat: [blog técnico](https://www.embat.io/tech), [TellMe](https://www.embat.io/artificial-intelligence-finance), [changelog](https://www.embat.io/changelog), [docs de la API](https://api.embat.io/docs), [Risk Management](https://www.embat.io/financial-risk-management), [Counterparty Management](https://www.embat.io/financial-risk-management/counterparty), [Debt Management](https://www.embat.io/financial-risk-management/debt-management), [Cashflow](https://www.embat.io/treasury-management/cashflow), [Global Banking](https://www.embat.io/corporate-payments/global-banking), [Pricing](https://www.embat.io/pricing).
- Contexto de inversión: [tesis de Cathay Innovation](https://cathayinnovation.com/behind-the-term-sheet-embats-e30m-series-b/), [nota de prensa de la Serie B](https://www.cathaycapital.com/embat-accelerates-international-expansion-with-eur30-million-series-b-to-expand-its-ai-powered-treasury-management-system/).
- HackSpain: [tracks](https://hackspain.com/tracks), [gran premio y jurado](https://hackspain.com/gran-premio), [infraestructura](https://hackspain.com/infra), [código de conducta](https://hackspain.com/conduct), [repositorio de la plataforma](https://github.com/HackSpain/hackspain26) (ficheros `apps/cli/src/commands/submit.ts`, `apps/app/convex/submissions.ts`, `apps/app/convex/judging.ts`, `apps/app/convex/tracks.ts`, `apps/web/src/data/judges.ts`), [dashboard](https://hackspain.app).
- Referentes de mercado: [Plaid LendScore](https://plaid.com/blog/plaid-lendscore-credit-risk-scoring/), [Codat Lending](https://docs.codat.io/lending/overview), [Kabbage → American Express](https://www.businesswire.com/news/home/20200817005350/en/American-Express-to-Acquire-Kabbage), [Allianz Trade Grade Check](https://www.allianz-trade.com/en_global/our-solutions/trade-credit-insurance/information-product.html), [Coface DRA](https://www.coface.ch/trade-credit-insurance/dra-debtor-risk-assessment), [CIRBE](https://clientebancario.bde.es/pcb/es/menu-horizontal/productosservici/relacionados/cirbe/).
