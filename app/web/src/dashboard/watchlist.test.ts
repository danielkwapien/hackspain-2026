import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  DEFAULT_FAVORITES,
  PORTFOLIO,
  getWatchlist,
  isFavorite,
  loadWatchlist,
  resetWatchlist,
  toggleFavorite,
  useIsFavorite,
  useWatchlist,
} from "@/dashboard/watchlist";

const STORAGE_KEY = "xray.watchlist.v1";

/** Semilla del plan: cinco empresas con informe y un grupo de tres filiales. */
const SEED = ["COMP_0007", "COMP_0001", "COMP_0004", "COMP_0003", "COMP_0002", "GROUP_0147"];

/** Cartera constante del plan, en orden de importe descendente. */
const PORTFOLIO_IDS = ["COMP_0007", "COMP_0001", "COMP_0008", "COMP_0003", "COMP_0004", "COMP_0002"];
const PORTFOLIO_TOTAL = 3_640_000;

function readStorage(): { version: number; favorites: string[] } {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error(`No hay nada persistido en ${STORAGE_KEY}`);
  return JSON.parse(raw) as { version: number; favorites: string[] };
}

describe("watchlist", () => {
  beforeEach(() => {
    localStorage.clear();
    resetWatchlist();
  });

  it("DADO el primer arranque sin clave CUANDO loadWatchlist ENTONCES la lista es la semilla y no escribe localStorage", () => {
    loadWatchlist();

    expect(DEFAULT_FAVORITES).toEqual(SEED);
    expect(getWatchlist()).toEqual(SEED);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("DADO toggleFavorite CUANDO se añade y se quita ENTONCES conserva el orden de inserción, persiste version 1 y los hooks se repintan", () => {
    resetWatchlist([]);
    const { result } = renderHook(() => ({
      list: useWatchlist(),
      arga: useIsFavorite("COMP_0001"),
    }));
    expect(result.current.list).toEqual([]);
    expect(result.current.arga).toBe(false);

    act(() => toggleFavorite("COMP_0001"));
    act(() => toggleFavorite("GROUP_0147"));
    expect(isFavorite("COMP_0001")).toBe(true);
    expect(isFavorite("GROUP_0147")).toBe(true);
    expect(getWatchlist()).toEqual(["COMP_0001", "GROUP_0147"]);
    expect(result.current.list).toEqual(["COMP_0001", "GROUP_0147"]);
    expect(result.current.arga).toBe(true);
    expect(readStorage()).toEqual({ version: 1, favorites: ["COMP_0001", "GROUP_0147"] });

    act(() => toggleFavorite("COMP_0001"));
    expect(isFavorite("COMP_0001")).toBe(false);
    expect(getWatchlist()).toEqual(["GROUP_0147"]);
    expect(result.current.arga).toBe(false);
    expect(readStorage().favorites).toEqual(["GROUP_0147"]);
  });

  it("DADO una lista vacía guardada CUANDO loadWatchlist ENTONCES se respeta y no se resiembra", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, favorites: [] }));

    loadWatchlist();

    expect(getWatchlist()).toEqual([]);
  });

  it("DADO JSON corrupto, versión ajena o ids malformados CUANDO loadWatchlist ENTONCES semilla / semilla / solo los ids válidos, sin duplicados y con tope 50", () => {
    localStorage.setItem(STORAGE_KEY, "{no-soy-json");
    loadWatchlist();
    expect(getWatchlist()).toEqual(SEED);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, favorites: ["COMP_0001"] }));
    loadWatchlist();
    expect(getWatchlist()).toEqual(SEED);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        favorites: ["COMP_0001", "x", "COMP_0001", 3, null, "group_0147", "GROUP_0147", "COMP_1"],
      }),
    );
    loadWatchlist();
    expect(getWatchlist()).toEqual(["COMP_0001", "GROUP_0147"]);

    const many = Array.from({ length: 60 }, (_, index) => `COMP_${String(index + 1).padStart(4, "0")}`);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, favorites: many }));
    loadWatchlist();
    expect(getWatchlist()).toHaveLength(50);
    expect(getWatchlist()[0]).toBe("COMP_0001");
  });

  it("DADO PORTFOLIO ENTONCES seis posiciones COMP_ con importes positivos que suman 3,64 M", () => {
    expect(PORTFOLIO.map((position) => position.id)).toEqual(PORTFOLIO_IDS);
    for (const position of PORTFOLIO) {
      expect(position.id).toMatch(/^COMP_\d{4}$/);
      expect(position.amount).toBeGreaterThan(0);
    }
    expect(PORTFOLIO.reduce((sum, position) => sum + position.amount, 0)).toBe(PORTFOLIO_TOTAL);
  });
});
