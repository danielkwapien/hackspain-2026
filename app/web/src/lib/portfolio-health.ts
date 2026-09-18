/**
 * Salud de cartera: agregado en cliente sobre el universo para los chips de la
 * topbar. XR-010 lo completa (ambitos distintos de `universe` y calculo servido).
 */

import { useQuery } from "@tanstack/react-query";
import { getUniverse } from "@/lib/api-v2";

/** Una empresa "en movimiento" es la que mueve al menos un punto en el mes. */
const MOVING_THRESHOLD = 1;

export type PortfolioHealth = {
  score: number;
  delta: number;
  moving: number;
  isPending: boolean;
  isError: boolean;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function usePortfolioHealth(scope: "universe"): PortfolioHealth {
  if (scope !== "universe") {
    throw new Error(`usePortfolioHealth solo cubre el ambito "universe"; ${scope} llega en XR-010.`);
  }

  const universe = useQuery({
    queryKey: ["universe", "portfolio-health"],
    queryFn: () => getUniverse({ limit: 2000 }),
  });

  const items = universe.data?.items ?? [];
  return {
    score: mean(items.map((item) => item.score)),
    delta: mean(items.map((item) => item.delta_1m)),
    moving: items.filter((item) => Math.abs(item.delta_1m) >= MOVING_THRESHOLD).length,
    isPending: universe.isPending,
    isError: universe.isError,
  };
}
