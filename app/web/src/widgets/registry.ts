/**
 * Registro de tipos de widget: el mecanismo, no el catálogo.
 *
 * Cada widget concreto (`screener`, `score-card`, …) se registra desde su propio
 * módulo llamando a `registerWidget`; aquí solo vive el `Map`, el color del
 * vínculo y las tres medidas del marco que el sistema de tokens no nombra.
 */

import type { ComponentType } from "react";
import type { EntityKind, LayoutItem, LinkGroup } from "@/dashboard/types";

/* ------------------------------------------------------------------ */
/* Medidas del marco                                                   */
/* ------------------------------------------------------------------ */

/* La cabecera (`--size-row`), el relleno (`--widget-padding`) y el radio
   (`--radius-card`) del marco son token y se consumen con `var()` desde el
   componente. Estas tres no tienen token propio y siguen en píxeles. */

export const LINK_DOT_SIZE = 8;
export const ICON_BUTTON_SIZE = 24;
export const ENTITY_PICKER_WIDTH = 320;

/**
 * Color del vínculo como clase de texto. No hay tokens `--link-group-*`: el
 * vínculo es un canal de agrupación, así que se apoya en la capa semántica.
 */
export const LINK_GROUP_CLASS: Record<LinkGroup, string> = {
  green: "text-content-positive",
  blue: "text-content-accent",
  orange: "text-content-alert",
  gray: "text-content-disabled",
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
