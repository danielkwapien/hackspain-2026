/** Registro del widget Score: importar este módulo lo mete en el catálogo. */

import { registerWidget } from "../registry";
import { ScoreCard } from "./ScoreCard";

registerWidget({
  type: "score-card",
  title: "Score",
  description: "Score, variación, régimen y banda de una empresa.",
  defaultSize: { w: 8, h: 8 },
  minSize: { w: 4, h: 6 },
  needsEntity: "one",
  entityKinds: ["company"],
  maxEntities: 1,
  showsTypeTitle: true,
  component: ScoreCard,
});

export { ScoreCard };
