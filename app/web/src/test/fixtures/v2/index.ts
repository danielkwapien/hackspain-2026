/**
 * Fixtures locales con la forma exacta del contrato v2 (`/api/v2/universe`,
 * `/api/v2/companies/:id` y `/api/v2/meta`).
 *
 * Tienen la forma de `docs/api/examples/*.json`: `lib/api-v2.test.ts` las contrasta
 * clave a clave con los ejemplos para que la deriva no vuelva en silencio.
 */

export { AS_OF, MONTHS, bandForScore, groupUniverseFixture, universeFixture } from "./universe";
export { companyFixture, companyFixtureFor } from "./company";
export { metaFixture, realMetaFixture } from "./meta";
