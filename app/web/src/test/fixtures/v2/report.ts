import type { HealthReport } from "@/lib/api-v2";
import { companyFixtureFor } from "./company";

const COMPANY_ID = "COMP_0004";

/** Ficha de la misma empresa: cada cifra del informe existe en un `value_fmt` (ENGINE §7.3). */
const sheet = companyFixtureFor(COMPANY_ID);

function driverValue(signalId: string): string {
  const driver = sheet.drivers.find((candidate) => candidate.signal_id === signalId);
  if (!driver?.value_fmt) throw new Error(`La ficha ${COMPANY_ID} no trae el driver ${signalId}.`);
  return driver.value_fmt;
}

const runway = driverValue("L1");
const lateCollections = driverValue("C1");
const utilisation = driverValue("D1");
const growth = driverValue("A1");

/**
 * `/api/v2/companies/COMP_0004/report` (Cerámicas Noval S.A.): informe pregenerado
 * con la forma de `docs/api/examples/company-report.json`.
 */
export const reportFixture: HealthReport = {
  company_id: COMPANY_ID,
  as_of: sheet.as_of,
  generated_at: "2026-09-19T10:00:00Z",
  model: "claude-opus-5",
  risk_level: "medium",
  summary:
    `${sheet.company.name} cierra agosto de 2026 en banda sana con un bache puntual. ` +
    `El colchón de caja (${runway}) sostiene el score; la mora de clientes (${lateCollections}) es el punto a vigilar.`,
  sections: [
    {
      title: "Resumen",
      body: "El score se mantiene en banda sana tras un bache de un mes; el motor no confirma un cambio de régimen.",
    },
    {
      title: "Liquidez y caja",
      body: `La empresa dispone de ${runway}, en la zona media del universo y sin días en negativo en el corte.`,
    },
    {
      title: "Pagos y cobros",
      body: `Registra ${lateCollections}: es la señal que más resta y la que marca el próximo mes.`,
    },
    {
      title: "Deuda",
      body: `Las líneas están al ${utilisation}; no hay techo aplicado en el corte.`,
    },
    {
      title: "Actividad",
      body: `Los cobros se mueven un ${growth}: actividad estable sin señal de deterioro.`,
    },
  ],
  watch_next: [
    "Comprobar que la mora de clientes no crece un segundo mes seguido.",
    "Vigilar que el colchón de caja no baje si el bache se repite.",
  ],
};
