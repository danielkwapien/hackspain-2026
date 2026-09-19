/**
 * Fila de identidad de la ficha: identificador, industria y país en burbujas, el
 * régimen escrito con su color y, empujada a la derecha, la operativa de los doce
 * meses (XR-037, E8). Una sola fila con todo lo que describe a la entidad.
 *
 * El nombre lo pinta la cabecera; aquí va lo que no cabe en él. El identificador se
 * queda a la vista porque es la clave que cruza todo el producto, y los campos que
 * no declara la fuente —casi siempre la industria, que se infiere de los
 * movimientos— llevan la burbuja punteada con su explicación: el superíndice `*`
 * funcionaba mal dentro de una burbuja pequeña. Es apariencia: nada de esto entra
 * en el score.
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
import { getEntityProfile } from "@/lib/api-v2";
import { entityProfileKey } from "@/lib/query-keys";
import { REGIME_CLASS, REGIME_LABEL } from "@/lib/regime";
import { entityMoney } from "@/panels/research/SheetFacts";

const INFERRED_TITLE =
  "Dato inferido de los movimientos de la entidad; la fuente no lo declara.";

const MONEY_TITLE = "Cobros operativos de los últimos 12 meses";

/** El glass de las burbujas de fortaleza, en píldora. El borde se pinta siempre
 *  para que la burbuja punteada del dato inferido no mida distinto. */
const CHIP_CLASS =
  "inline-flex items-center rounded-[var(--radius-pill)] border bg-surface-glass px-2 py-0.5 text-content-primary";

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
  const money = entityMoney({ opIn12m, currency, opIn12mEur });
  if (data === undefined && regime === null && money === null) return null;

  return (
    <p className="flex shrink-0 flex-wrap items-center gap-2 text-[length:var(--text-micro)]">
      {data === undefined ? null : (
        <>
          <Chip title={`Identificador de ${data.name}`}>{data.entity_id}</Chip>
          {data.industry === null ? null : (
            <Chip method={data.industry_method}>{capitalise(data.industry)}</Chip>
          )}
          {data.country === null ? null : (
            <Chip method={data.country_method}>{capitalise(data.country)}</Chip>
          )}
        </>
      )}
      {regime === null ? null : (
        <span className={cn("font-semibold", REGIME_CLASS[regime])}>{REGIME_LABEL[regime]}</span>
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
