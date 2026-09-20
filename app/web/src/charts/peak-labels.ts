/**
 * Qué puntos de una serie merecen una burbuja con su cifra, sin React.
 *
 * `LineNoAxes` no tiene ejes ni rejilla: en reposo la gráfica no dice ni un número,
 * y el valor solo aparece al pasar el ratón. Etiquetar unos pocos puntos devuelve la
 * escala sin devolver los ejes; etiquetarlos todos la convierte en una tabla.
 *
 * El criterio: el último punto entra siempre y aparte del presupuesto, porque es el
 * valor de hoy y no enseñarlo sería raro; el resto son extremos locales en una
 * ventana de ±2 meses que además destaquen de esa ventana, ordenados por prominencia
 * (distancia a la media de lo visible), recortados al presupuesto del rango y
 * descartando los que se pisarían con una burbuja ya elegida.
 *
 * Recibe SOLO los puntos visibles: el rango lo decide quien llama.
 */

import type { LinePoint } from "@/charts/LineNoAxes";

/** Media ventana del extremo local, en meses. */
const WINDOW = 2;
/** Separación mínima entre dos burbujas, en fracción del ancho visible. */
const MIN_GAP = 0.12;
/**
 * Relieve mínimo de un pico sobre su ventana, en fracción del recorrido visible. Sin
 * este suelo, un tramo plano se llena de burbujas: cada micro-vaivén de 0,2 pts es
 * extremo local de su ventana, y si el tramo está lejos de la media de lo visible sus
 * puntos salen además muy prominentes. Medido en la ficha de COMP_0169: la Liquidez
 * llana de 7 pts se llevaba tres burbujas seguidas que decían lo mismo.
 */
const MIN_RELIEF = 0.04;

/** `true` si el punto es máximo o mínimo de su ventana de ±`WINDOW` meses. */
function isLocalExtreme(points: readonly LinePoint[], index: number): boolean {
  const window = points.slice(Math.max(0, index - WINDOW), index + WINDOW + 1);
  const value = points[index].value;
  return (
    window.every((other) => other.value <= value) || window.every((other) => other.value >= value)
  );
}

/** Cuánto se separa el punto de la media de su propia ventana: la altura del pico. */
function relief(points: readonly LinePoint[], index: number): number {
  const window = points.slice(Math.max(0, index - WINDOW), index + WINDOW + 1);
  const mean = window.reduce((total, point) => total + point.value, 0) / window.length;
  return Math.abs(points[index].value - mean);
}

/**
 * El último punto de `points` más los `max` picos más prominentes que no lo pisen,
 * en orden de mes. Con `max <= 0` no devuelve nada, ni siquiera el último: las
 * gráficas que superponen series (la Comparativa) no piden burbujas y no deben
 * recibirlas.
 */
export function peakLabels(points: readonly LinePoint[], max: number): LinePoint[] {
  if (max <= 0 || points.length === 0) return [];

  const values = points.map((point) => point.value);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const amplitude = Math.max(...values) - Math.min(...values);
  // Con un solo punto no hay ancho que repartir: cualquier separación vale.
  const span = Math.max(points.length - 1, 1);

  const ranked = points
    .map((point, index) => ({ point, index, prominence: Math.abs(point.value - mean) }))
    .filter(
      (candidate) =>
        isLocalExtreme(points, candidate.index) &&
        relief(points, candidate.index) > amplitude * MIN_RELIEF,
    )
    .sort((a, b) => b.prominence - a.prominence);

  // El valor de hoy manda: se elige primero, así que quien colisiona es el otro.
  const last = points.length - 1;
  const chosen = [{ index: last, point: points[last] }];

  for (const candidate of ranked) {
    if (chosen.length > max) break;
    const collides = chosen.some(
      (other) => Math.abs(other.index - candidate.index) / span < MIN_GAP,
    );
    // Ordenados de mayor a menor prominencia: al pisarse, el que sobra es este.
    if (collides) continue;
    chosen.push({ index: candidate.index, point: candidate.point });
  }

  return chosen.sort((a, b) => a.index - b.index).map((candidate) => candidate.point);
}
