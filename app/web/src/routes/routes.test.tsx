import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { resetSelection } from "@/dashboard/selection";
import { resetStore } from "@/dashboard/store";
import { metaFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi, renderRoute } from "@/test/helpers";

/**
 * Las direcciones de la ficha estática v1: ya no existen. Servían un segundo
 * número por empresa, calculado por el motor antiguo, sin enlace alguno en la
 * navegación.
 */
const RETIRED = ["/portfolio", "/company/COMP_0001", "/companies/COMP_0001"];

describe("enrutador", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    resetSelection();
  });

  it.each(RETIRED)(
    "DADO el enrutador CUANDO se escribe %s ENTONCES no hay pantalla de la ficha estática v1",
    async (route) => {
      mockApi([
        { match: "/api/v2/meta", body: metaFixture },
        { match: "/api/v2/universe", body: universeFixture },
      ]);

      renderRoute(route);

      expect(await screen.findByText("Página no encontrada")).toBeInTheDocument();
    },
  );
});
