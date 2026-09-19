import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  clearCompare,
  getSelection,
  resetSelection,
  select,
  selectGroup,
  setCompareSlot,
  setSearch,
  useSelection,
} from "@/dashboard/selection";

const EMPTY = { selected: null, selectedGroup: null, compare: [null, null], search: "" };

describe("store de selección", () => {
  beforeEach(() => {
    resetSelection();
    localStorage.clear();
  });

  it("starts empty", () => {
    expect(getSelection()).toEqual(EMPTY);
  });

  it("select keeps a single id and does not touch compare", () => {
    setCompareSlot(1, "COMP_0009");
    select("COMP_0001");
    select("COMP_0002");

    expect(getSelection().selected).toBe("COMP_0002");
    expect(getSelection().compare).toEqual([null, "COMP_0009"]);

    select(null);
    expect(getSelection().selected).toBeNull();
  });

  it("selectGroup keeps a single group id", () => {
    selectGroup("GROUP_0147");
    selectGroup("GROUP_0288");

    expect(getSelection().selectedGroup).toBe("GROUP_0288");
    expect(getSelection().selected).toBeNull();

    selectGroup(null);
    expect(getSelection().selectedGroup).toBeNull();
  });

  it("setCompareSlot writes A and B independently", () => {
    setCompareSlot(0, "COMP_0001");
    expect(getSelection().compare).toEqual(["COMP_0001", null]);

    setCompareSlot(1, "COMP_0002");
    expect(getSelection().compare).toEqual(["COMP_0001", "COMP_0002"]);

    setCompareSlot(0, "COMP_0003");
    expect(getSelection().compare).toEqual(["COMP_0003", "COMP_0002"]);

    setCompareSlot(0, null);
    expect(getSelection().compare).toEqual([null, "COMP_0002"]);
  });

  it("setCompareSlot with the id already in the other slot empties that slot", () => {
    setCompareSlot(0, "COMP_0001");
    setCompareSlot(1, "COMP_0002");

    // Nunca A = B: el id se muda de slot y el de origen queda vacío.
    setCompareSlot(1, "COMP_0001");
    expect(getSelection().compare).toEqual([null, "COMP_0001"]);

    setCompareSlot(0, "COMP_0001");
    expect(getSelection().compare).toEqual(["COMP_0001", null]);
  });

  it("clearCompare resets both slots", () => {
    select("COMP_0009");
    setCompareSlot(0, "COMP_0001");
    setCompareSlot(1, "COMP_0002");

    clearCompare();
    expect(getSelection().compare).toEqual([null, null]);
    expect(getSelection().selected).toBe("COMP_0009");
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

    act(() => selectGroup("GROUP_0147"));
    expect(result.current.selectedGroup).toBe("GROUP_0147");

    act(() => setCompareSlot(1, "COMP_0002"));
    expect(result.current.compare).toEqual([null, "COMP_0002"]);

    act(() => setSearch("arga"));
    expect(result.current.search).toBe("arga");

    act(() => resetSelection());
    expect(result.current).toEqual(EMPTY);
  });

  it("does not persist anything in localStorage", () => {
    select("COMP_0001");
    selectGroup("GROUP_0147");
    setCompareSlot(0, "COMP_0002");
    setSearch("duero");

    expect(localStorage.length).toBe(0);
  });
});
