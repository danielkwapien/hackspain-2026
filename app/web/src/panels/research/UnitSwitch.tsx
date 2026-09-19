/**
 * Selector de unidad de la ficha: la misma entidad en grano sociedad o grupo.
 *
 * Reutiliza la selección compartida (`select`/`selectGroup`): ambos ids siguen vivos
 * en el store, así que el cambio es reversible y ningún panel necesita estado nuevo.
 * El grupo no publica «su sociedad», así que al volver a Sociedad se ofrece la filial
 * que el propio consolidado señala como la más fuerte (dato publicado, no inventado).
 */

import type { ReactElement } from "react";
import { Segmented } from "@/components/ui/segmented";
import { select, selectGroup } from "@/dashboard/selection";

export type UnitKind = "company" | "group";

const OPTIONS = [
  { value: "company", label: "Sociedad" },
  { value: "group", label: "Grupo" },
] as const;

export function UnitSwitch({
  kind,
  companyId,
  groupId,
}: {
  kind: UnitKind;
  /** Sociedad a la que volver; sin ella no hay otro grano que ofrecer. */
  companyId: string | null;
  /** Grupo al que saltar; sin él no hay otro grano que ofrecer. */
  groupId: string | null;
}): ReactElement | null {
  if (companyId === null || groupId === null) return null;
  return (
    <Segmented
      label="Unidad"
      value={kind}
      options={OPTIONS}
      onChange={(next) => {
        if (next === "group") selectGroup(groupId);
        else select(companyId);
      }}
    />
  );
}
