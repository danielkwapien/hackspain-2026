/**
 * Fixtures locales con la forma exacta del contrato v2 (`/api/v2/universe`,
 * `/api/v2/companies/:id`, `/companies/:id/signals`, `/groups/:id`,
 * `/catalog/signals`, `/alerts`, `/treemap`, `/companies/:id/report` y `/api/v2/meta`).
 *
 * Tienen la forma de `docs/api/examples/*.json`: `lib/api-v2.test.ts` las contrasta
 * clave a clave con los ejemplos para que la deriva no vuelva en silencio.
 */

export { AS_OF, MONTHS, bandForScore, groupUniverseFixture, universeFixture } from "./universe";
export { BASE_MEDIAN, companyFixture, companyFixtureFor } from "./company";
export { metaFixture, realMetaFixture } from "./meta";
export { UNAVAILABLE_SIGNALS, companySignalsFixture } from "./signals";
export { groupFixture } from "./group";
export { PILLAR_NAMES, PILLAR_WEIGHTS, catalogFixture } from "./catalog";
export { alertsFixture } from "./alerts";
export { TREEMAP_WITHOUT_METRIC, treemapFixture } from "./treemap";
export { reportFixture } from "./report";
