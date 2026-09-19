import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  getSelection,
  removeCompare,
  resetSelection,
  select,
  setSearch,
  toggleCompare,
  useSelection,
} from "@/dashboard/selection";

const IDS = ["COMP_0001", "COMP_0002", "COMP_0003", "COMP_0004", "COMP_0005", "COMP_0006"];

describe("store de selección", () => {
  beforeEach(() => {
    resetSelection();
    localStorage.clear();
  });

  it("starts empty", () => {
    expect(getSelection()).toEqual({ selected: null, compare: [], search: "" });
  });

  it("select keeps a single id and does not touch compare", () => {
    select("COMP_0001");
    select("COMP_0002");

    expect(getSelection().selected).toBe("COMP_0002");
    expect(getSelection().compare).toEqual([]);
  });

  it("toggleCompare adds once, removes on repeat and keeps insertion order", () => {
    toggleCompare("COMP_0002");
    toggleCompare("COMP_0001");
    toggleCompare("COMP_0002");
    toggleCompare("COMP_0003");

    expect(getSelection().compare).toEqual(["COMP_0001", "COMP_0003"]);

    toggleCompare("COMP_0001");
    expect(getSelection().compare).toEqual(["COMP_0003"]);
  });

  it("compare never exceeds 5 ids and keeps insertion order", () => {
    for (const id of IDS) toggleCompare(id);

    const { compare } = getSelection();
    expect(compare).toHaveLength(5);
    expect(new Set(compare).size).toBe(5);
    const positions = compare.map((id: string) => IDS.indexOf(id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("removeCompare drops the id and leaves the rest in order", () => {
    toggleCompare("COMP_0001");
    toggleCompare("COMP_0002");
    toggleCompare("COMP_0003");

    removeCompare("COMP_0002");
    expect(getSelection().compare).toEqual(["COMP_0001", "COMP_0003"]);

    removeCompare("COMP_0009");
    expect(getSelection().compare).toEqual(["COMP_0001", "COMP_0003"]);
  });

  it("setSearch writes the global search", () => {
    setSearch("duero");
    expect(getSelection().search).toBe("duero");
  });

  it("useSelection re-renders with every change", () => {
    const { result } = renderHook(() => useSelection());
    expect(result.current.selected).toBeNull();

    act(() => select("COMP_0001"));
    expect(result.current.selected).toBe("COMP_0001");

    act(() => toggleCompare("COMP_0002"));
    expect(result.current.compare).toEqual(["COMP_0002"]);

    act(() => setSearch("arga"));
    expect(result.current.search).toBe("arga");

    act(() => resetSelection());
    expect(result.current).toEqual({ selected: null, compare: [], search: "" });
  });

  it("does not persist anything in localStorage", () => {
    select("COMP_0001");
    toggleCompare("COMP_0002");
    setSearch("duero");

    expect(localStorage.length).toBe(0);
  });
});
