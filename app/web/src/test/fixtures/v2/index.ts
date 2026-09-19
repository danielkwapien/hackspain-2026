/**
 * Fixtures locales con la forma exacta del contrato v2 (`/api/v2/universe`,
 * `/api/v2/companies/:id` y `/api/v2/meta`).
 *
 * Son provisionales: se sustituyen por `docs/api/examples/*.json` en cuanto XR-001
 * publique los ejemplos del contrato, sin tocar los componentes que las consumen.
 */

export { AS_OF, MONTHS, bandForScore, groupUniverseFixture, universeFixture } from "./universe";
export { companyFixture, companyFixtureFor } from "./company";
export { metaFixture, realMetaFixture } from "./meta";
