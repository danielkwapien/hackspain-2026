/** Registro del widget Buscador: importar este módulo lo mete en el catálogo. */

import { registerWidget } from "../registry";
import { Screener } from "./Screener";

registerWidget({
  type: "screener",
  title: "Buscador de empresas",
  description: "Todas las empresas con score, variación, régimen y banda.",
  defaultSize: { w: 16, h: 14 },
  minSize: { w: 8, h: 10 },
  needsEntity: "none",
  entityKinds: ["company"],
  maxEntities: 0,
  showsTypeTitle: true,
  component: Screener,
});

export { Screener };
