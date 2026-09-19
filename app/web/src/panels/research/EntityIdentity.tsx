/**
 * Línea de identidad de la ficha: identificador, industria y país de la entidad.
 *
 * El nombre lo pinta la cabecera; aquí va lo que no cabe en él. El identificador
 * se queda a la vista porque es la clave que cruza todo el producto, y los campos
 * que no declara la fuente —casi siempre la industria, que se infiere de los
 * movimientos— llevan un asterisco con su explicación. Es apariencia: nada de
 * esto entra en el score.
 *
 * Sin perfil publicado (la fuente mock no lo trae) no se pinta nada: la ficha no
 * depende de la identidad para funcionar.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProfileMethod } from "@/lib/api-v2";
import { getEntityProfile } from "@/lib/api-v2";
import { entityProfileKey } from "@/lib/query-keys";

const INFERRED_TITLE =
  "Dato inferido de los movimientos de la entidad; la fuente no lo declara.";

/** `servicios profesionales` → `Servicios profesionales`. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Field({
  value,
  method,
}: {
  value: string;
  method: ProfileMethod | null;
}): ReactElement {
  return (
    <span>
      <span aria-hidden="true">· </span>
      {capitalise(value)}
      {method === "inferred" ? (
        <sup className="ml-0.5 text-content-warning" title={INFERRED_TITLE}>
          *<span className="sr-only"> dato inferido</span>
        </sup>
      ) : null}
    </span>
  );
}

export function EntityIdentity({ id }: { id: string }): ReactElement | null {
  const profile = useQuery({
    queryKey: entityProfileKey(id),
    queryFn: () => getEntityProfile(id),
  });

  const data = profile.data;
  if (data === undefined) return null;

  return (
    <p className="flex shrink-0 flex-wrap items-baseline gap-x-1 text-[length:var(--text-micro)] text-content-secondary">
      <span className="num" title={`Identificador de ${data.name}`}>
        {data.entity_id}
      </span>
      {data.industry === null ? null : (
        <Field value={data.industry} method={data.industry_method} />
      )}
      {data.country === null ? null : (
        <Field value={data.country} method={data.country_method} />
      )}
    </p>
  );
}
