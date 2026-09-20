/**
 * Efecto de importación: `App.tsx` importa este módulo una vez y el catálogo queda
 * poblado en el orden en que se ofrece. Los tres de «Principal» reutilizan los
 * paneles de `panels/`; los de catálogo viven en `widgets/<type>/`.
 */

import { createElement } from "react";
import type { ReactElement } from "react";
import { CompaniesPanel } from "@/panels/companies/CompaniesPanel";
import { ComparePanel } from "@/panels/compare/ComparePanel";
import { ResearchPanel } from "@/panels/research/ResearchPanel";
import { AlertsWidget } from "@/widgets/alerts/AlertsWidget";
import { FavoritesWidget } from "@/widgets/favorites/FavoritesWidget";
import { GroupWidget } from "@/widgets/group/GroupWidget";
import { PortfolioWidget } from "@/widgets/portfolio/PortfolioWidget";
import { registerWidget } from "@/widgets/registry";
import type { WidgetContentProps } from "@/widgets/registry";
import { ResearchDeepWidget } from "@/widgets/research-deep/ResearchDeepWidget";
import {
  AlertsThumb,
  CompaniesThumb,
  CompareThumb,
  FavoritesThumb,
  GroupThumb,
  PortfolioThumb,
  ResearchDeepThumb,
  ResearchThumb,
  TradeThumb,
  TreemapThumb,
} from "@/widgets/thumbnails";
import { TradeWidget } from "@/widgets/trade/TradeWidget";
import { TreemapWidget } from "@/widgets/treemap/TreemapWidget";

/** Investigación sigue la selección global salvo que el widget fije una empresa. */
function ResearchWidget({ item }: WidgetContentProps): ReactElement {
  return createElement(ResearchPanel, { entity: item.entity });
}

registerWidget({
  type: "companies",
  title: "Búsquedas",
  description: "Tabla del universo por grupos, con score, Δ y régimen.",
  defaultSize: { w: 12, h: 24 },
  minSize: { w: 8, h: 10 },
  needsEntity: false,
  thumbnail: CompaniesThumb,
  component: CompaniesPanel,
});

registerWidget({
  type: "research",
  title: "Investigación",
  description: "Ficha de la empresa seleccionada o fijada.",
  defaultSize: { w: 12, h: 14 },
  minSize: { w: 8, h: 10 },
  needsEntity: true,
  thumbnail: ResearchThumb,
  component: ResearchWidget,
});

registerWidget({
  type: "research-deep",
  title: "Investigación profunda",
  description: "Estadísticas clave por familia, metodología e informe de Health.",
  defaultSize: { w: 12, h: 24 },
  minSize: { w: 8, h: 12 },
  needsEntity: true,
  thumbnail: ResearchDeepThumb,
  component: ResearchDeepWidget,
});

registerWidget({
  type: "compare",
  title: "Comparativa",
  description: "Dos empresas en una sola gráfica.",
  defaultSize: { w: 12, h: 10 },
  minSize: { w: 8, h: 6 },
  needsEntity: false,
  thumbnail: CompareThumb,
  component: ComparePanel,
});

registerWidget({
  type: "alerts",
  title: "Alertas",
  description: "Bandeja de alertas del motor, la más reciente arriba.",
  defaultSize: { w: 8, h: 12 },
  // 5 desde XR-038 (W4.1): el tablero fijo la coloca a 5 columnas y un mínimo
  // que solo mira el arrastre no puede contradecir al layout que ya se sirve.
  minSize: { w: 5, h: 6 },
  needsEntity: false,
  thumbnail: AlertsThumb,
  component: AlertsWidget,
});

registerWidget({
  type: "treemap",
  title: "Mapa",
  description: "Treemap por grupo: tamaño cobros 12 m, color Δ3m.",
  defaultSize: { w: 12, h: 12 },
  minSize: { w: 8, h: 8 },
  needsEntity: false,
  thumbnail: TreemapThumb,
  component: TreemapWidget,
});

registerWidget({
  type: "group",
  title: "Grupo",
  description: "El grupo de la empresa seleccionada y sus filiales.",
  defaultSize: { w: 12, h: 12 },
  minSize: { w: 8, h: 8 },
  needsEntity: true,
  thumbnail: GroupThumb,
  component: GroupWidget,
});

registerWidget({
  type: "favorites",
  title: "Favoritos",
  description: "Empresas y grupos marcados con estrella.",
  defaultSize: { w: 6, h: 13 },
  // 5 desde XR-038 (W4.1), por lo mismo que Alertas.
  minSize: { w: 5, h: 6 },
  needsEntity: false,
  thumbnail: FavoritesThumb,
  component: FavoritesWidget,
});

registerWidget({
  type: "portfolio",
  title: "Cartera",
  description: "Posiciones simuladas: importe, score y tendencia.",
  defaultSize: { w: 8, h: 11 },
  minSize: { w: 6, h: 6 },
  needsEntity: false,
  thumbnail: PortfolioThumb,
  component: PortfolioWidget,
});

registerWidget({
  type: "trade",
  title: "Operar",
  description: "Simular una oferta o una reclamación de deuda sobre una sociedad.",
  defaultSize: { w: 6, h: 13 },
  minSize: { w: 5, h: 10 },
  needsEntity: false,
  thumbnail: TradeThumb,
  component: TradeWidget,
});
