/**
 * Registro de tipos de widget: el mecanismo, no el catálogo.
 *
 * Cada widget concreto (`screener`, `score-card`, …) se registra desde su propio
 * módulo llamando a `registerWidget`; aquí solo vive el `Map` y las medidas del
 * marco que todavía no son token.
 */

import type { ComponentType } from "react";
import type { EntityKind, LayoutItem, LinkGroup } from "@/dashboard/types";

/* ------------------------------------------------------------------ */
/* Medidas del marco                                                   */
/* ------------------------------------------------------------------ */

/* Píxeles exactos del marco de Trade Republic. Se consumen por `style` inline
   hasta que XR-002 los publique como token, y entonces solo cambia este fichero. */

export const WIDGET_HEADER_HEIGHT = 32;
export const LINK_DOT_SIZE = 8;
export const ICON_BUTTON_SIZE = 24;
export const ENTITY_PICKER_WIDTH = 320;

/** Color del vínculo como clase de texto; XR-002 traerá `--link-group-*`. */
export const LINK_GROUP_CLASS: Record<LinkGroup, string> = {
  green: "text-positive",
  blue: "text-primary",
  orange: "text-warning",
  gray: "text-muted-foreground",
};

export const LINK_GROUP_LABEL: Record<LinkGroup, string> = {
  green: "Verde",
  blue: "Azul",
  orange: "Naranja",
  gray: "Sin vínculo",
};

/** Orden en que se ofrecen los vínculos en los menús. */
export const LINK_GROUPS: LinkGroup[] = ["green", "blue", "orange", "gray"];

/* ------------------------------------------------------------------ */
/* Definición                                                          */
/* ------------------------------------------------------------------ */

/** Cuántas entidades necesita el widget para tener sentido. */
export type NeedsEntity = "none" | "one" | "many";

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
  needsEntity: NeedsEntity;
  entityKinds: EntityKind[];
  /** 1 cuando `needsEntity === "one"`. */
  maxEntities: number;
  /** Si pinta el título del tipo, de 18 px, bajo la cabecera. */
  showsTypeTitle: boolean;
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
