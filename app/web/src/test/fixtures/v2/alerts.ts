import type { AlertRow, AlertsResponse } from "@/lib/api-v2";
import { MONTHS, universeFixture } from "./universe";

const POINTS_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type AlertSeed = {
  alertId: string;
  companyId: string;
  cause: string;
  severity: AlertRow["severity"];
  monthDetected: string;
  status: string;
  drop: number;
};

function buildAlert(seed: AlertSeed): AlertRow {
  const entity = universeFixture.items.find((candidate) => candidate.id === seed.companyId)!;
  const scoreAfter = entity.score;
  const scoreBefore = Math.round((scoreAfter + seed.drop) * 10) / 10;
  const monthFrom = MONTHS[MONTHS.indexOf(seed.monthDetected) - 2];
  return {
    alert_id: seed.alertId,
    company_id: entity.id,
    group_id: entity.group_id,
    company_name: entity.name,
    group_name: entity.group_name,
    event: "regime_deteriorating",
    cause: seed.cause,
    severity: seed.severity,
    direction: "down",
    month_detected: seed.monthDetected,
    month_evident: null,
    lead_time_months: null,
    trigger_signal: "L1",
    score_before: scoreBefore,
    score_after: scoreAfter,
    status: seed.status,
    message:
      `deterioro confirmado dos meses seguidos: el score cae ${POINTS_FORMAT.format(seed.drop)} puntos ` +
      `desde ${monthFrom}: de ${POINTS_FORMAT.format(scoreBefore)} a ${POINTS_FORMAT.format(scoreAfter)} (vigilar).`,
  };
}

/**
 * `/api/v2/alerts`: tres alertas de tres severidades, en el orden del fichero
 * (`alerts.csv` va de la mas antigua a la mas reciente; ordenar es cosa del widget).
 */
export const alertsFixture: AlertsResponse = {
  items: [
    buildAlert({
      alertId: "ALERT_00003",
      cause: "buffer_days",
      companyId: "COMP_0012",
      severity: "urgent",
      monthDetected: "2026-04",
      status: "resolved",
      drop: 6.8,
    }),
    buildAlert({
      alertId: "ALERT_00005",
      cause: "band_drop",
      companyId: "COMP_0003",
      severity: "watch",
      monthDetected: "2026-06",
      status: "open",
      drop: 9.4,
    }),
    buildAlert({
      alertId: "ALERT_00007",
      cause: "concentration",
      companyId: "COMP_0005",
      severity: "review",
      monthDetected: "2026-07",
      status: "open",
      drop: 11.2,
    }),
  ],
  total: 3,
  limit: 50,
  offset: 0,
};
