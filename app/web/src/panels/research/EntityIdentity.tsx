/**
 * Fila de identidad de la ficha: seis burbujas —identificador, industria, país,
 * ERP, grupo e historia—, el régimen escrito con su color y, empujada a la
 * derecha, la operativa de los doce meses (XR-037, E8). Una sola fila con todo
 * lo que describe a la entidad.
 *
 * El nombre lo pinta la cabecera; aquí va lo que no cabe en él. El identificador se
 * queda a la vista porque es la clave que cruza todo el producto, y los campos que
 * no declara la fuente —casi siempre la industria, que se infiere de los
 * movimientos— llevan la burbuja punteada con su explicación: el superíndice `*`
 * funcionaba mal dentro de una burbuja pequeña. Es apariencia: nada de esto entra
 * en el score.
 *
 * Las tres de XR-038 (W1.1) salen de la ficha del corte y del grupo, no de un
 * endpoint nuevo: `companies.erp`, `groups.name` via `group_id` y
 * `company_scores.months_hist`. El grupo, porque es el único salto de navegación
 * que la ficha no ofrecía y el producto entero se organiza por grupos; la
 * historia, porque es lo que hace creíble al score y está al 100 %: una ficha con
 * 24 meses detrás no dice lo mismo que una con 6.
 *
 * **El ERP falta en 541 sociedades de 1.286 (42 %).** Cuando falta, la insignia no
 * se pinta: ni hueco ni «Sin ERP». Esta fila describe a la entidad, no es un
 * formulario, y un hueco dejaría coja cuatro de cada diez fichas.
 *
 * El régimen se escribe aquí porque la línea del score dejó de pintarse por tramos
 * de régimen (E9) y esa era la única lectura visual de «esta empresa se está
 * recuperando». Es la compensación de aquel cambio, no un adorno.
 *
 * Sin perfil publicado (la fuente mock no lo trae) no hay burbujas, pero el régimen
 * y el dinero se siguen pintando: la ficha no depende de la identidad para funcionar.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import type { ProfileMethod, Regime } from "@/lib/api-v2";
import { getCompanyV2, getEntityProfile, getGroupV2 } from "@/lib/api-v2";
import { companyKey, entityProfileKey, groupKey } from "@/lib/query-keys";
import { erpLabel } from "@/lib/definitions";
import { EMPTY_VALUE, formatAmount } from "@/lib/format";
import { REGIME_CLASS, REGIME_LABEL } from "@/lib/regime";

const INFERRED_TITLE =
  "Dato inferido de los movimientos de la entidad; la fuente no lo declara.";

const MONEY_TITLE = "Cobros operativos de los últimos 12 meses";

/**
 * La operativa 12 m con su moneda explícita: la de la entidad cuando la publica y, si
 * no (grano grupo), la consolidada en EUR. `null` cuando no hay cifra.
 *
 * Vivía en `SheetFacts`, que desapareció con E15 al bajar las fortalezas bajo la
 * gráfica; el dinero es de esta fila desde E8.
 */
export function entityMoney({
  opIn12m,
  currency,
  opIn12mEur,
}: {
  opIn12m: number | null | undefined;
  currency: string | null | undefined;
  opIn12mEur?: number | null;
}): string | null {
  const amount = opIn12m ?? opIn12mEur;
  if (amount == null) return null;
  const unit = opIn12m == null ? "EUR" : (currency ?? EMPTY_VALUE);
  return `${formatAmount(amount)} ${unit}`;
}

/** El glass de las burbujas de fortaleza, en píldora. El borde se pinta siempre
 *  para que la burbuja punteada del dato inferido no mida distinto. */
const CHIP_CLASS =
  "inline-flex items-center rounded-[var(--radius-pill)] border bg-surface-glass px-2.5 py-1 text-[length:var(--text-control)] text-content-primary";

/** `servicios profesionales` → `Servicios profesionales`. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Chip({
  children,
  method = null,
  title,
}: {
  children: string;
  /** `inferred` puntea el borde y explica el porqué en el `title`. */
  method?: ProfileMethod | null;
  title?: string;
}): ReactElement {
  const inferred = method === "inferred";
  return (
    <span
      data-testid="identity-chip"
      className={cn(
        CHIP_CLASS,
        inferred
          ? "border-dashed border-content-warning/50"
          : "border-transparent shadow-[inset_0_0_0_1px_var(--border-glass)]",
      )}
      title={inferred ? INFERRED_TITLE : title}
    >
      {children}
      {inferred ? <span className="sr-only"> dato inferido</span> : null}
    </span>
  );
}

export function EntityIdentity({
  id,
  regime = null,
  opIn12m,
  currency,
  opIn12mEur,
}: {
  id: string;
  /** Régimen del corte; solo la ficha de empresa lo tiene a mano. */
  regime?: Regime | null;
  opIn12m?: number | null;
  currency?: string | null;
  opIn12mEur?: number | null;
}): ReactElement | null {
  const profile = useQuery({
    queryKey: entityProfileKey(id),
    queryFn: () => getEntityProfile(id),
  });

  const data = profile.data;
  // La misma clave que ya tiene en caché la ficha (`ResearchPanel`): de aquí
  // salen el ERP, el grupo y los meses de historia sin una consulta más. Un
  // grupo no tiene fila en `companies`, así que ni se pregunta.
  const company = useQuery({
    queryKey: companyKey(id),
    queryFn: () => getCompanyV2(id),
    enabled: data?.entity_kind === "company",
  });

  const row = company.data?.company ?? null;
  const groupId = row?.group_id ?? null;
  const group = useQuery({
    queryKey: groupKey(groupId ?? ""),
    queryFn: () => getGroupV2(groupId ?? ""),
    select: (payload) => payload.group.name,
    enabled: groupId !== null,
  });

  const money = entityMoney({ opIn12m, currency, opIn12mEur });
  if (data === undefined && regime === null && money === null) return null;

  return (
    <p
      data-testid="identity-row"
      className="flex shrink-0 flex-wrap items-center gap-1 text-[length:var(--text-control)]"
    >
      {data === undefined ? null : (
        <>
          <Chip title={`Identificador de ${data.name}`}>{data.entity_id}</Chip>
          {data.industry === null ? null : (
            <Chip method={data.industry_method}>{capitalise(data.industry)}</Chip>
          )}
          {data.country === null ? null : (
            <Chip method={data.country_method}>{capitalise(data.country)}</Chip>
          )}
          {/* Nulo en 541 de 1.286: sin ERP no hay insignia, ni hueco ni «—». */}
          {row?.erp == null ? null : (
            <Chip title="ERP declarado por la sociedad">{erpLabel(row.erp)}</Chip>
          )}
          {group.data == null ? null : (
            <Chip title="Grupo al que pertenece la sociedad">{group.data}</Chip>
          )}
          {row == null ? null : (
            <Chip title="Meses de datos sobre los que se calcula el score">
              {`${row.months_hist} m de historia`}
            </Chip>
          )}
        </>
      )}
      {/* El régimen no es una insignia: va escrito, con su color y separado del
          grupo de seis por un hueco mayor. */}
      {regime === null ? null : (
        <span className={cn("ml-2 font-semibold", REGIME_CLASS[regime])}>
          {REGIME_LABEL[regime]}
        </span>
      )}
      {money === null ? null : (
        <span
          className="num ml-auto text-[length:var(--text-body)] text-content-primary"
          title={MONEY_TITLE}
        >
          {money}
        </span>
      )}
    </p>
  );
}
