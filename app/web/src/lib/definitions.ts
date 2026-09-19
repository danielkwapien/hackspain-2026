/**
 * Definiciones de una frase para las burbujas ⓘ y etiquetas cortas para las celdas
 * de KPI y de señal. Fuente: `docs/alfonso/ENGINE-EMBAT.md` §4 (señales: definición,
 * ventana y orientación), §5 (score, base, penalización, techo, banda, confianza) y
 * §6 (régimen, outlook). Sin cifras de la empresa: eso lo dice `value_fmt`.
 */

import type { Pillar } from "@/lib/api-v2";

/** Nombre corto de cada familia; `panels/research/FamilyStats` lo re-exporta. */
export const FAMILY_LABEL: Record<Pillar, string> = {
  L: "Liquidez",
  P: "Pago",
  C: "Cobros",
  D: "Deuda",
  A: "Actividad",
};

/** Ids del catálogo: 28 señales que puntúan más `A6`, que solo marca calidad. */
export type SignalId =
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5"
  | "P1"
  | "P2"
  | "P3"
  | "P4"
  | "P5"
  | "P6"
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "C6"
  | "D1"
  | "D2"
  | "D3"
  | "D4"
  | "D5"
  | "D6"
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "A5"
  | "A6";

/** Ids de `drivers.csv`: las señales más las dos filas del motor (penalización y techo). */
export type DriverId = SignalId | "PENALTY" | "CAP";

/** Etiqueta de celda (≤ 18 caracteres): cabe en `KpiRow` a cinco columnas. */
export const SHORT_LABEL: Record<DriverId, string> = {
  L1: "Colchón de caja",
  L2: "Mínimo de caja",
  L3: "Días en negativo",
  L4: "Runway",
  L5: "Inversión",
  P1: "Pagos tarde",
  P2: "Retraso propio",
  P3: "Vencido a pagar",
  P4: "Seg. Social",
  P5: "Impuestos",
  P6: "Nóminas",
  C1: "Cobros tarde",
  C2: "Mora clientes",
  C3: "Vencido a cobrar",
  C4: "Ratio de cobro",
  C5: "Cartera clientes",
  C6: "Rotación clientes",
  D1: "Uso de líneas",
  D2: "Cuotas regulares",
  D3: "Servicio deuda",
  D4: "Comisiones e int.",
  D5: "Deuda no bancaria",
  D6: "Apalancamiento",
  A1: "Crecimiento",
  A2: "Volatilidad",
  A3: "Caja operativa",
  A4: "Actividad",
  A5: "Dep. intragrupo",
  A6: "Sin clasificar",
  PENALTY: "Penalización",
  CAP: "Techo",
};

/** Definición + ventana + orientación (≤ 160 caracteres), de ENGINE §4.1–4.5. */
export const SIGNAL_DEFINITION: Record<DriverId, string> = {
  L1: "Días de salidas operativas que cubre la caja a fin de mes, sobre la media de 3 meses. Más días, más sano.",
  L2: "Mínimo diario de caja del mes sobre las salidas medias de 3 meses. Más alto, más sano.",
  L3: "Días del mes con la caja agregada por debajo de cero, media de 3 meses. Menos días, más sano.",
  L4: "Meses que caja e inversiones cubren las salidas medias de 3 meses, entre −3 y 24. Más meses, más sano.",
  L5: "Saldo invertido sobre las salidas medias de 12 meses; sin inversión es neutral. Más peso, más sano.",
  P1: "Parte del importe de facturas recibidas pagadas con retraso en 3 meses. Menos retraso, más sano.",
  P2: "Retraso propio en días, ponderado por importe, de las recibidas pagadas en 3 meses. Menos días, más sano.",
  P3: "Importe recibido vivo y vencido a cierre sobre lo recibido en 3 meses. Menos vencido, más sano.",
  P4: "Meses con pago de Seguridad Social sobre meses activos en 6 meses. Más regular, más sano.",
  P5: "Trimestres con pago de impuestos en su primer mes sobre los observados en 12 meses. Más regular, más sano.",
  P6: "Meses con pago de nóminas sobre meses activos en 6 meses. Más regular, más sano.",
  C1: "Parte del importe de facturas emitidas cobradas con retraso en 3 meses. Menos retraso, más sano.",
  C2: "Mora de clientes en días, ponderada por importe, de las emitidas cobradas en 3 meses. Menos días, más sano.",
  C3: "Importe emitido vivo y vencido a cierre sobre lo emitido en 3 meses. Menos vencido, más sano.",
  C4: "Cobrado sobre emitido en 3 meses, recortado entre 0 y 3. Más cerca de 1 o por encima, más sano.",
  C5: "Número de clientes en 12 meses y su concentración. Más clientes y menos concentración, más sano.",
  C6: "Rotación de clientes de 12 meses frente a los 12 previos, relativa al universo. Menos rotación, más sano.",
  D1: "Dispuesto sobre concedido en líneas de crédito, confirming y factoring, últimos 3 meses. Menos uso, más sano.",
  D2: "Meses con cuota de deuda pagada en 6 meses frente a la regularidad propia de 12. Más regular, más sano.",
  D3: "Cuotas más intereses de 3 meses sobre los cobros operativos de 3 meses. Menos carga, más sano.",
  D4: "Comisiones e intereses de 3 meses sobre las salidas operativas de 3 meses. Menos peso, más sano.",
  D5: "Dispuesto en financiación no bancaria (socios, in-house) sobre el dispuesto total. Menos peso, más sano.",
  D6: "Deuda dispuesta total sobre los cobros operativos de 12 meses. Menos apalancamiento, más sano.",
  A1: "Cobros operativos de 3 meses frente a los 3 previos (y 12 frente a 12), netos de intragrupo. Más crecimiento, más sano.",
  A2: "Volatilidad de los cobros mensuales (desviación sobre media) en 3 meses. Menos volatilidad, más sano.",
  A3: "Cobros menos pagos operativos de 3 meses sobre los pagos de 3 meses. Más caja generada, más sano.",
  A4: "Transacciones de 3 meses frente al ritmo de 12 meses. Más actividad, más sano.",
  A5: "Entradas intragrupo sobre el total de entradas en 6 meses. Menos dependencia de la matriz, más sano.",
  A6: "Movimientos sin clasificar sobre el bruto total en 3 meses. Solo marca calidad del dato: no puntúa.",
  PENALTY:
    "Puntos restados cuando el pilar más débil queda por debajo de τ (0,45): la mitad de la distancia. Ver «Cómo se calcula».",
  CAP: "Techo del score por un evento duro (caja negativa, cuotas o Seguridad Social ausentes, líneas al límite) mientras persiste.",
};

/** Rama de cobertura de la empresa (ENGINE §4.7): qué pilares puntúan según los datos que tiene. */
export const BRANCH_LABEL: Record<string, string> = {
  full: "Completa",
  no_debt: "Sin deuda",
  no_invoices: "Sin facturas",
  no_invoices_no_debt: "Sin facturas ni deuda",
};

/**
 * Perspectivas del motor que se pintan en «Contexto», en este orden (XR-037, E14).
 *
 * `current_health` NO está: su valor es el nivel del score y su evidencia son los
 * cinco pilares, que la fila de KPIs ya enseña cuarenta píxeles más arriba.
 *
 * Las etiquetas se escriben aquí porque el motor publica `label: null` y el
 * producto está en español. Una perspectiva que no esté en esta tabla no se pinta:
 * el bloque es un catálogo curado, no un volcado de la capa estratégica.
 *
 * `evidence` fija las DOS claves que dicen algo de cada perspectiva; sin ella la
 * tarjeta cogía las cuatro primeras del JSON por orden de aparición.
 */
export const PERSPECTIVE: Record<
  string,
  { label: string; evidence: readonly [string, string] }
> = {
  trajectory_pressure: {
    label: "Trayectoria y presión",
    evidence: ["momentum", "obligation_coverage"],
  },
  network_counterparty_health: {
    label: "Salud de la red de cobro",
    evidence: ["customer_late_rate", "customer_overdue_rate"],
  },
  sector_benchmark_rank: {
    label: "Posición en su sector",
    evidence: ["health_percentile", "cohort_size"],
  },
  data_driven_peer_learning: {
    label: "Empresas parecidas",
    evidence: ["expected_health_3m", "neighbour_count"],
  },
};

/**
 * Claves de evidencia de las perspectivas, en español. Lo que no esté aquí NO se
 * pinta: `humanizeCode` dejaba «mean similarity» y «health change 3m» en inglés y
 * en minúsculas dentro de una tarjeta en español.
 */
export const EVIDENCE_LABEL: Record<string, string> = {
  momentum: "Momento",
  pressure: "Presión",
  obligation_coverage: "Obligaciones",
  health_change_3m: "Cambio 3 m",
  expected_health_3m: "Salud esperada",
  health_percentile: "Percentil",
  cohort_size: "Cohorte",
  mean_similarity: "Similitud",
  neighbour_count: "Parecidas",
  collection_continuity: "Continuidad",
  customer_late_rate: "Pagan tarde",
  customer_overdue_rate: "Vencido",
};

/** Cómo se lee el número de cada clave: 0-100, proporción 0-1 o recuento. */
export type EvidenceUnit = "points" | "share" | "count";

export const EVIDENCE_UNIT: Record<string, EvidenceUnit> = {
  momentum: "points",
  pressure: "points",
  obligation_coverage: "share",
  health_change_3m: "points",
  expected_health_3m: "points",
  health_percentile: "points",
  cohort_size: "count",
  mean_similarity: "share",
  neighbour_count: "count",
  collection_continuity: "share",
  customer_late_rate: "share",
  customer_overdue_rate: "share",
};

/** Señales de fortaleza explícitas (ENGINE §4.6, a–e), tal como las emite `strength_flags`. */
export const STRENGTH_LABEL: Record<string, string> = {
  GROWTH_NO_DSO: "Crece sin mora",
  PAYS_ON_TIME: "Paga a tiempo",
  BUFFER_LOW_UTIL: "Colchón sin líneas",
  DELEVERAGING: "Desapalancando",
  SAVINGS: "Con inversiones",
};

/**
 * Etiqueta de un driver: el nombre publicado por el motor cuando existe
 * (catálogo, techo o perspectiva) y, si no, la del vocabulario propio del motor
 * (`PENALTY`, `PILLAR_L`…) o el código humanizado. Nunca se inventa un ID de v2.
 */
export function driverLabel(driver: {
  signal_id: string;
  name?: string | null;
  kind?: string | null;
  pillar?: Pillar | null;
}): string {
  if (driver.name) return driver.name;
  if (driver.kind === "pillar" && driver.pillar) return `Pilar · ${FAMILY_LABEL[driver.pillar]}`;
  if (driver.kind === "penalty") return "Penalización";
  if (driver.kind === "override") return "Techo aplicado";
  return SHORT_LABEL[driver.signal_id as DriverId] ?? humanizeCode(driver.signal_id);
}

/** Etiqueta de un código sin traducción: minúsculas con espacios, nunca el código en mayúsculas. */
export function humanizeCode(code: string): string {
  return code.replace(/_/g, " ").toLocaleLowerCase("es-ES");
}

/** Qué mide cada pilar y con qué peso base (ENGINE §4, §4.7). */
export const PILLAR_DEFINITION: Record<Pillar, string> = {
  L: "Liquidez: colchón, mínimo y runway de caja. Peso base 25 sobre 100; se reparte si otro pilar no aplica.",
  P: "Disciplina de pago propia: retrasos a proveedores y regularidad de Seguridad Social, impuestos y nóminas. Peso base 20.",
  C: "Cobros y clientes: mora, cartera vencida, ratio de cobro y concentración. Peso base 15; no aplica sin facturas.",
  D: "Deuda y coste de financiación: uso de líneas, cuotas, servicio y comisiones. Peso base 20; sin deuda solo cuentan las comisiones.",
  A: "Actividad y estabilidad: crecimiento y volatilidad de cobros, caja operativa y dependencia intragrupo. Peso base 20.",
};

export type KpiKey =
  | "score"
  | "delta"
  | "confidence"
  | "outlook"
  | "base"
  | "penalty"
  | "cap"
  | "band"
  | "regime";

/** KPIs de cabecera y de motor (ENGINE §5–§6). */
export const KPI_DEFINITION: Record<KpiKey, string> = {
  score:
    "Salud de tesorería de 0 a 100 en el mes de corte: pilares ponderados, menos la penalización del pilar más débil y bajo el techo si lo hay.",
  delta: "Puntos que el score ha ganado o perdido entre el primer mes del rango elegido y el mes activo.",
  confidence:
    "Cuánto fiarse del score este mes: meses de historia, cobertura de pilares y calidad de caja, de 0 a 1. Por debajo de 0,5 no dispara alertas.",
  outlook:
    "Score esperado a seis meses: prolonga la pendiente de 6 meses amortiguada y las señales de adelanto; la banda es su incertidumbre al 90 %.",
  base: "Parte del score que explica la empresa mediana del universo: score = base + contribuciones − penalización.",
  penalty:
    "Puntos que resta el pilar más débil cuando cae por debajo de 0,45: la mitad de la distancia, en puntos de score.",
  cap: "Techo del score por un evento duro (caja negativa, Seguridad Social o cuotas ausentes, líneas al límite) mientras persiste.",
  band: "Tramo del score: ≥ 80 sólida, 60–79 sana, 40–59 vigilar, < 40 tensión. Cambiar de banda exige dos o tres meses.",
  regime:
    "Cómo se mueve la serie, no su nivel: estable, mejora, deterioro, bache, shock pendiente o recuperación; warm-up con menos de 7 meses.",
};

/** Color de gráfica de cada pilar: el token de `index.css`, nunca un literal. */
export const PILLAR_TOKEN: Record<Pillar, string> = {
  L: "var(--chart-pillar-liquidity)",
  P: "var(--chart-pillar-payments)",
  C: "var(--chart-pillar-collections)",
  D: "var(--chart-pillar-debt)",
  A: "var(--chart-pillar-activity)",
};

export type Metric = "score" | Pillar;

export type MetricOption = { value: Metric; label: string };

/**
 * Las cinco familias, sin el score: el `Segmented` de Investigación profunda
 * (XR-037, E16) dejó de ofrecer «Health score», que repetía la cabecera de la
 * ficha de al lado y el bloque «Motor», que es metadato de ingeniería.
 */
export const FAMILY_OPTIONS: readonly { value: Pillar; label: string }[] = (
  Object.keys(FAMILY_LABEL) as Pillar[]
).map((pillar) => ({ value: pillar, label: FAMILY_LABEL[pillar] }));

/** Menú de métrica de la gráfica de Investigación: el score y las cinco familias. */
export const METRIC_OPTIONS: readonly MetricOption[] = [
  { value: "score", label: "Health score" },
  ...FAMILY_OPTIONS,
];
