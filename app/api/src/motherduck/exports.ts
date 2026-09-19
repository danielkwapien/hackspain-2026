import type { CompanyListItem, ExportsStore, GroupRecord } from "../exports.js";
import type { V2Store } from "../v2/store.js";
import { MotherDuckClient, MotherDuckUnavailableError } from "./client.js";
import { readDetail } from "./detail.js";

export function motherDuckExports(client: MotherDuckClient, store: V2Store): ExportsStore {
  const window = store.manifest.window;
  if (!window) throw new MotherDuckUnavailableError();
  const companies: CompanyListItem[] = store.companies.map((company) => {
    const coverage = store.coverageAt?.(company.company_id);
    if (!coverage) throw new MotherDuckUnavailableError();
    return {
      company_id: company.company_id, group_id: company.group_id, country: company.country,
      currency: company.currency ?? "UNKNOWN", erp: company.erp, created_at: company.created_at, coverage,
    };
  });
  const companiesByGroup = new Map<string, CompanyListItem[]>();
  for (const company of companies) companiesByGroup.set(company.group_id, [...(companiesByGroup.get(company.group_id) ?? []), company]);
  const groups: GroupRecord[] = store.groups.map((group) => {
    const members = companiesByGroup.get(group.group_id) ?? [];
    const months = members.map((member) => member.coverage.months_with_activity);
    return { group_id: group.group_id, erp: group.erp, n_companies_in_sample: members.length, n_companies_present: members.length,
      currencies: group.currencies.map((code) => ({ code, n: members.filter((member) => member.currency === code).length })),
      countries: group.countries.map((code) => ({ code, n: members.filter((member) => member.country === code).length })),
      coverage: { months_with_activity_min: months.length ? Math.min(...months) : null, months_with_activity_max: months.length ? Math.max(...months) : null }, snapshot_dates: [...new Set(members.flatMap((member) => member.coverage.snapshot.dates))] };
  });
  return {
    dir: store.dir,
    manifest: { contract_version: "dashboard-v1", dataset_version: store.manifest.data_version ?? "embat-v2",
      cutoff_date: store.manifest.cutoff_date ?? "", generated_at: store.manifest.generated_at ?? "",
      window,
      source: { data_dir: "motherduck", files: [] }, counts: store.manifest.counts ?? {}, quality_notes: store.manifest.notes ?? [] },
    groups, groupsById: new Map(groups.map((group) => [group.group_id, group])), companies,
    companiesById: new Map(companies.map((company) => [company.company_id, company])), companiesByGroup,
    readCompanyDetail: async (id) => { const company = companies.find((entry) => entry.company_id === id); return company ? readDetail(client, company) : null; },
    // La ficha estática del motor viejo ya no se sirve: el resultado del motor vive en /api/v2.
    readEngineResult: async () => null,
  };
}
