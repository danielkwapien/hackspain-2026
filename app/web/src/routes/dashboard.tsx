/**
 * La ruta `/`: una sola página con tres paneles glass a la vista.
 *
 * A partir de 1280 px (`xl:`) dos columnas iguales `12fr 12fr` (a 1440 px, 700 px
 * por panel): Empresas a la izquierda a toda altura, y a la derecha Comparativa
 * (≈ 40 % del alto) sobre Investigación.
 * Por debajo, una columna con los tres apilados a 360 px como mínimo. La rejilla
 * llena el `main` y cada panel recorta su propio contenido; el scroll vive dentro
 * de cada uno, nunca en la página.
 */

import type { ReactElement } from "react";
import { CompaniesPanel } from "@/panels/companies/CompaniesPanel";
import { ComparePanel } from "@/panels/compare/ComparePanel";
import { Panel } from "@/panels/Panel";
import { ResearchPanel } from "@/panels/research/ResearchPanel";

export function DashboardPage(): ReactElement {
  return (
    <div
      className="grid h-full grid-cols-1 auto-rows-[minmax(360px,auto)] p-4 xl:grid-cols-[12fr_12fr] xl:grid-rows-[minmax(280px,2fr)_3fr]"
      style={{ gap: "var(--grid-gap)" }}
    >
      <Panel id="companies" title="Empresas" index={0} className="xl:row-span-2">
        <CompaniesPanel />
      </Panel>
      <Panel id="compare" title="Comparativa" index={1}>
        <ComparePanel />
      </Panel>
      <Panel id="research" title="Investigación" index={2}>
        <ResearchPanel />
      </Panel>
    </div>
  );
}
