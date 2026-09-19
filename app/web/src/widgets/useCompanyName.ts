/**
 * Nombre de la empresa fijada en un widget, desde la ficha `/companies/:id` bajo
 * `companyKey`: la misma clave que usa Investigación, así que si la ficha ya está
 * en caché el marco no vuelve a pedirla. `select` recorta al nombre y el marco no
 * se repinta cuando cambie el resto de la ficha.
 */

import { useQuery } from "@tanstack/react-query";
import { getCompanyV2 } from "@/lib/api-v2";
import { companyKey } from "@/lib/query-keys";

/** `undefined` sin entidad, mientras carga o si la ficha falla. */
export function useCompanyName(id: string | null): string | undefined {
  const query = useQuery({
    queryKey: companyKey(id ?? ""),
    queryFn: () => getCompanyV2(id ?? ""),
    select: (company) => company.company.name,
    enabled: id !== null,
  });
  return id === null ? undefined : query.data;
}
