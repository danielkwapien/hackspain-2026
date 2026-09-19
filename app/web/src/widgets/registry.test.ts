import { describe, expect, it } from "vitest";
import "@/widgets/register-all";
import { getWidget, listWidgets, registerWidget } from "@/widgets/registry";

/** Los seis del catálogo, en el orden en que `register-all` los registra. */
const CATALOG = [
  { type: "companies", title: "Empresas", size: { w: 12, h: 24 }, min: { w: 8, h: 10 }, entity: false },
  { type: "research", title: "Investigación", size: { w: 12, h: 14 }, min: { w: 8, h: 10 }, entity: true },
  { type: "compare", title: "Comparativa", size: { w: 12, h: 10 }, min: { w: 8, h: 6 }, entity: false },
  { type: "alerts", title: "Alertas", size: { w: 8, h: 12 }, min: { w: 6, h: 6 }, entity: false },
  { type: "treemap", title: "Mapa", size: { w: 12, h: 12 }, min: { w: 8, h: 8 }, entity: false },
  { type: "group", title: "Grupo", size: { w: 12, h: 12 }, min: { w: 8, h: 8 }, entity: true },
];

function Stub() {
  return null;
}

describe("registro de widgets", () => {
  it("register-all leaves exactly six types in catalog order", () => {
    expect(listWidgets().map((definition) => definition.type)).toEqual([
      "companies",
      "research",
      "compare",
      "alerts",
      "treemap",
      "group",
    ]);

    for (const expected of CATALOG) {
      const definition = getWidget(expected.type);
      expect(definition, expected.type).toBeDefined();
      expect(definition).toMatchObject({
        title: expected.title,
        defaultSize: expected.size,
        minSize: expected.min,
        needsEntity: expected.entity,
      });
      expect(definition?.description.length).toBeGreaterThan(0);
      expect(typeof definition?.thumbnail).toBe("function");
      expect(typeof definition?.component).toBe("function");
    }
  });

  it("getWidget of an unknown type is undefined", () => {
    expect(getWidget("no-existe")).toBeUndefined();
    expect(getWidget("")).toBeUndefined();
  });

  it("listWidgets keeps registration order for later registrations", () => {
    registerWidget({
      type: "zz-sonda-b",
      title: "Sonda B",
      description: "Solo para el orden",
      defaultSize: { w: 6, h: 4 },
      minSize: { w: 2, h: 2 },
      needsEntity: false,
      thumbnail: Stub,
      component: Stub,
    });
    registerWidget({
      type: "zz-sonda-a",
      title: "Sonda A",
      description: "Solo para el orden",
      defaultSize: { w: 6, h: 4 },
      minSize: { w: 2, h: 2 },
      needsEntity: false,
      thumbnail: Stub,
      component: Stub,
    });

    // Orden de registro, no alfabético.
    expect(listWidgets().slice(-2).map((definition) => definition.type)).toEqual([
      "zz-sonda-b",
      "zz-sonda-a",
    ]);
    expect(getWidget("zz-sonda-a")?.title).toBe("Sonda A");
  });
});
