/**
 * Registro de tipos de widget: el mecanismo, no el catálogo.
 *
 * Cada tipo se registra desde `register-all.ts` llamando a `registerWidget`; aquí
 * solo vive el `Map`. El orden de registro es el orden del catálogo.
 */

import type { ComponentType } from "react";
import type { LayoutItem } from "@/dashboard/types";

export type WidgetSize = { w: number; h: number };

export type WidgetContentProps = { item: LayoutItem };

export type WidgetDefinition = {
  type: string;
  /** Nombre del tipo, en español. */
  title: string;
  /** Una línea para el catálogo de widgets. */
  description: string;
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  /** Si el marco ofrece «Elegir empresa» para fijar `item.entity`. */
  needsEntity: boolean;
  /** Miniatura 60 × 30 para el catálogo. */
  thumbnail: ComponentType;
  component: ComponentType<WidgetContentProps>;
};

const registry = new Map<string, WidgetDefinition>();

export function registerWidget(definition: WidgetDefinition): void {
  registry.set(definition.type, definition);
}

export function getWidget(type: string): WidgetDefinition | undefined {
  return registry.get(type);
}

/** En orden de registro (`Map` conserva el orden de inserción). */
export function listWidgets(): WidgetDefinition[] {
  return [...registry.values()];
}
