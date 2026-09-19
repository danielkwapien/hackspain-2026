/**
 * Escenario común del prototipo: la página objetivo de X-Ray a tamaño real
 * (1440×900) con topbar y tres paneles glass. Es el mismo para las tres
 * variantes; lo que cambia detrás es la capa de fondo.
 *
 * Contenido real del dataset (`universe.ts`): nombres, ids, scores, deltas,
 * regímenes y sparklines. Ningún control está muerto: las pills filtran, los
 * rangos cambian la comparativa, las filas y el buscador global eligen la empresa
 * de la investigación.
 */
import { useState, type KeyboardEvent } from "react";
import {
  LineNoAxes,
  PillarBar,
  Sparkline,
  fmtDelta,
  fmtPoints,
  fmtU,
  regimeToken,
  type LineForecast,
  type LinePoint,
  type LineSeries,
} from "@/charts";
import type { Band, Regime, UniverseItem } from "@/lib/api-v2";
import { AS_OF, MONTHS, groupUniverseFixture, universeFixture } from "@/test/fixtures/v2/universe";
import "./prototype.css";

/** Régimen en palabras: el color nunca viaja solo. */
const REGIME_LABELS: Record<Regime, string> = {
  improving: "Mejora",
  deteriorating: "Deterioro",
  blip: "Bache",
  shock_pending: "Bache sin confirmar",
  stable: "Estable",
  recovering: "Recuperación",
  warmup: "Calentamiento",
};

const BANDS: Band[] = ["A", "B", "C", "D"];

const RANGES = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1A", months: 12 },
  { label: "Máx", months: 12 },
] as const;

/** Pilares del score con un sesgo fijo sobre el score: mock determinista, sin API de pilares. */
const PILLARS = [
  { label: "Liquidez", offset: -8 },
  { label: "Pagos", offset: 5 },
  { label: "Cobros", offset: -3 },
  { label: "Deuda", offset: 10 },
  { label: "Actividad", offset: 0 },
];

/** Meses de proyección tras el corte. */
const OUTLOOK_MONTHS = 3;

/** La comparativa es el único contenido de su panel: más alta que `--size-chart-large`. */
const COMPARE_HEIGHT = 240;

const ALL = "";

type Filters = { group: string; regime: string; band: string };
type MenuKey = keyof Filters;

/** Filas del universo de mayor a menor score. */
const ROWS: UniverseItem[] = [...universeFixture.items].sort((a, b) => b.score - a.score);

const GROUP_NAMES = new Map(groupUniverseFixture.items.map((group) => [group.id, group.name]));

/** «Grupo Arga» → «Arga»: en la tabla la cabecera ya dice «Grupo». */
const GROUP_SHORT = new Map(
  groupUniverseFixture.items.map((group) => [group.id, group.name.replace(/^Grupo\s+/u, "")]),
);

function addMonths(month: string, count: number): string {
  const year = Number(month.slice(0, 4));
  const offset = Number(month.slice(5, 7)) - 1 + count;
  return `${year + Math.floor(offset / 12)}-${String((offset % 12) + 1).padStart(2, "0")}`;
}

/** Una decimal con signo explícito: la columna Δ no tiene sitio para glifo ni unidad. */
const SIGNED_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** Delta compacto para la tabla: cifra con signo en el texto y el tono de `fmtDelta`. */
function deltaCell(value: number) {
  return { text: SIGNED_FORMAT.format(value).replaceAll("-", "−"), tone: fmtDelta(value).tone };
}

/** Score con una decimal y sin unidad: la cabecera ya dice qué es. */
function scoreCell(value: number): string {
  return fmtPoints(value).replace(/\spts$/u, "");
}

function toPoints(values: readonly number[], months: number): LinePoint[] {
  const tail = values.slice(-months);
  const axis = MONTHS.slice(-months);
  return tail.map((value, index) => ({ month: axis[index], value }));
}

function outlookOf(item: UniverseItem): LineForecast {
  const step = item.delta_3m / 3;
  const points = [];
  const low = [];
  const high = [];
  for (let k = 0; k <= OUTLOOK_MONTHS; k += 1) {
    const value = item.score + step * k;
    const spread = 2.5 * k;
    points.push({ month: addMonths(AS_OF, k), value });
    low.push(value - spread);
    high.push(value + spread);
  }
  return { from: AS_OF, points, low, high };
}

function pillarValue(score: number, offset: number): number {
  return Math.min(1, Math.max(0.05, (score + offset) / 100));
}

function matches(item: UniverseItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return item.name.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle);
}

type PillProps = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  open: boolean;
  onToggle: () => void;
  onPick: (value: string) => void;
};

function Pill({ label, value, options, open, onToggle, onPick }: PillProps) {
  const current = options.find((option) => option.value === value)?.label ?? label;
  return (
    <div
      className="proto-pill-wrap"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) onToggle();
      }}
    >
      <button
        type="button"
        className="proto-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        data-set={value === ALL ? undefined : ""}
        onClick={onToggle}
      >
        {value === ALL ? label : current} ▾
      </button>
      {open ? (
        <div role="menu" className="proto-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className="proto-menu-item"
              onClick={() => onPick(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Stage() {
  const [globalQuery, setGlobalQuery] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({ group: ALL, regime: ALL, band: ALL });
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [selectedId, setSelectedId] = useState(ROWS[0].id);
  const [range, setRange] = useState<(typeof RANGES)[number]["label"]>("1A");

  const selected = ROWS.find((item) => item.id === selectedId) ?? ROWS[0];
  const group = groupUniverseFixture.items.find((item) => item.id === selected.group_id);

  const visible = ROWS.filter(
    (item) =>
      matches(item, query) &&
      (filters.group === ALL || item.group_id === filters.group) &&
      (filters.regime === ALL || item.regime === filters.regime) &&
      (filters.band === ALL || item.band === filters.band),
  );

  const rangeMonths = RANGES.find((option) => option.label === range)?.months ?? 12;
  const companyPoints = toPoints(selected.sparkline_12, rangeMonths);
  const groupPoints = group ? toPoints(group.sparkline_12, rangeMonths) : [];
  const compareSeries: LineSeries[] = [
    { id: selected.id, points: companyPoints, color: "var(--chart-score)" },
    ...(group ? [{ id: group.id, points: groupPoints, color: "var(--chart-neutral)" }] : []),
  ];
  const legend = [
    { name: selected.name, color: "var(--chart-score)", points: companyPoints },
    ...(group ? [{ name: group.name, color: "var(--chart-neutral)", points: groupPoints }] : []),
  ].map((entry) => ({
    ...entry,
    delta: fmtDelta((entry.points.at(-1)?.value ?? 0) - (entry.points[0]?.value ?? 0)),
  }));

  const researchSeries: LineSeries[] = [
    {
      id: selected.id,
      points: toPoints(selected.sparkline_12, 12).map((point) => ({
        ...point,
        regime: selected.regime,
      })),
    },
  ];
  const selectedDelta = fmtDelta(selected.delta_1m);

  function pick(key: MenuKey, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setOpenMenu(null);
  }

  function toggle(key: MenuKey) {
    setOpenMenu((current) => (current === key ? null : key));
  }

  /** Buscador global: Enter elige la primera empresa que encaja. */
  function onGlobalSearch(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const hit = ROWS.find((item) => matches(item, globalQuery));
    if (!hit) return;
    setSelectedId(hit.id);
    setGlobalQuery("");
  }

  function onRowKey(event: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelectedId(id);
  }

  return (
    <div className="proto-stage">
      <header className="proto-topbar">
        <span className="proto-brand">X-Ray</span>
        <input
          className="proto-field"
          type="search"
          placeholder="Buscar empresa, grupo o id…"
          aria-label="Búsqueda global"
          value={globalQuery}
          onChange={(event) => setGlobalQuery(event.target.value)}
          onKeyDown={onGlobalSearch}
        />
        <span className="proto-topbar-status">Mock v1 · corte 08/2026</span>
        <span className="proto-avatar" aria-label="Perfil">
          X
        </span>
      </header>

      <div className="proto-grid">
        <section className="proto-panel proto-panel-companies" aria-label="Empresas">
          <div className="proto-panel-head">
            <span>Empresas</span>
            <span className="proto-secondary font-mono tabular-nums">
              {visible.length} / {ROWS.length}
            </span>
          </div>
          <div className="proto-toolbar">
            <input
              className="proto-field"
              type="search"
              placeholder="Filtrar por nombre o id"
              aria-label="Filtrar empresas"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Pill
              label="Grupo"
              value={filters.group}
              options={[
                { value: ALL, label: "Todos los grupos" },
                ...groupUniverseFixture.items.map((item) => ({ value: item.id, label: item.name })),
              ]}
              open={openMenu === "group"}
              onToggle={() => toggle("group")}
              onPick={(value) => pick("group", value)}
            />
            <Pill
              label="Régimen"
              value={filters.regime}
              options={[
                { value: ALL, label: "Todos los regímenes" },
                ...[...new Set(ROWS.map((item) => item.regime))].map((regime) => ({
                  value: regime,
                  label: REGIME_LABELS[regime],
                })),
              ]}
              open={openMenu === "regime"}
              onToggle={() => toggle("regime")}
              onPick={(value) => pick("regime", value)}
            />
            <Pill
              label="Banda"
              value={filters.band}
              options={[
                { value: ALL, label: "Todas las bandas" },
                ...BANDS.map((band) => ({ value: band, label: `Banda ${band}` })),
              ]}
              open={openMenu === "band"}
              onToggle={() => toggle("band")}
              onPick={(value) => pick("band", value)}
            />
          </div>
          <div className="proto-table-wrap">
            <table className="proto-table">
              <colgroup>
                <col />
                <col style={{ width: 73 }} />
                <col style={{ width: 52 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 44 }} />
                <col style={{ width: 44 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 68 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Empresa</th>
                  <th scope="col">Id</th>
                  <th scope="col">Grupo</th>
                  <th scope="col" className="proto-col-num">
                    Score
                  </th>
                  <th scope="col" className="proto-col-num">
                    Δ1m
                  </th>
                  <th scope="col" className="proto-col-num">
                    Δ3m
                  </th>
                  <th scope="col">Régimen</th>
                  <th scope="col">12 m</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const d1 = deltaCell(item.delta_1m);
                  const d3 = deltaCell(item.delta_3m);
                  return (
                    <tr
                      key={item.id}
                      className="proto-row"
                      tabIndex={0}
                      aria-selected={item.id === selected.id}
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={(event) => onRowKey(event, item.id)}
                    >
                      <td title={item.name}>{item.name}</td>
                      <td className="proto-secondary font-mono tabular-nums">{item.id}</td>
                      <td className="proto-secondary" title={GROUP_NAMES.get(item.group_id)}>
                        {GROUP_SHORT.get(item.group_id)}
                      </td>
                      <td className="proto-col-num font-mono tabular-nums">{scoreCell(item.score)}</td>
                      <td className="proto-col-num font-mono tabular-nums" style={{ color: d1.tone }}>
                        {d1.text}
                      </td>
                      <td className="proto-col-num font-mono tabular-nums" style={{ color: d3.tone }}>
                        {d3.text}
                      </td>
                      <td
                        title={REGIME_LABELS[item.regime]}
                        style={{ color: regimeToken(item.regime) }}
                      >
                        {REGIME_LABELS[item.regime]}
                      </td>
                      <td className="proto-spark-cell">
                        <Sparkline points={item.sparkline_12} regime={item.regime} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="proto-panel proto-panel-compare" aria-label="Comparativa">
          <div className="proto-panel-head">
            <span>Comparativa</span>
            <div className="proto-ranges" role="group" aria-label="Rango">
              {RANGES.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className="proto-range"
                  aria-pressed={range === option.label}
                  onClick={() => setRange(option.label)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="proto-legend">
            {legend.map((entry) => (
              <span key={entry.name} className="proto-legend-item">
                <span className="proto-swatch" style={{ background: entry.color }} />
                <span>{entry.name}</span>
                <span className="font-mono tabular-nums" style={{ color: entry.delta.tone }}>
                  {entry.delta.text}
                </span>
              </span>
            ))}
          </div>
          <div className="proto-chart">
            <LineNoAxes
              series={compareSeries}
              normalize
              height={COMPARE_HEIGHT}
              label={`Empresa frente a grupo, últimos ${rangeMonths} meses, base 100`}
              unit=""
            />
          </div>
        </section>

        <section className="proto-panel proto-panel-research" aria-label="Investigación">
          <div className="proto-panel-head">
            <span>Investigación</span>
            <span className="proto-secondary font-mono tabular-nums">{selected.id}</span>
          </div>
          <div className="proto-research-head">
            <span className="proto-research-name">{selected.name}</span>
            <span className="proto-figure font-mono tabular-nums">{fmtPoints(selected.score)}</span>
            <span className="font-mono tabular-nums" style={{ color: selectedDelta.tone }}>
              {selectedDelta.text}
            </span>
            <span className="proto-regime">
              <span className="proto-dot" style={{ background: regimeToken(selected.regime) }} />
              <span>{REGIME_LABELS[selected.regime]}</span>
              <span className="proto-secondary">· {selected.outlook_label}</span>
            </span>
            <span className="proto-secondary" style={{ marginLeft: "auto" }}>
              {GROUP_NAMES.get(selected.group_id)}
            </span>
          </div>
          <div className="proto-chart">
            <LineNoAxes
              series={researchSeries}
              forecast={outlookOf(selected)}
              label={`Score de ${selected.name}, últimos 12 meses y proyección a ${OUTLOOK_MONTHS}`}
            />
          </div>
          <div className="proto-pillars">
            {PILLARS.map((pillar) => {
              const value = pillarValue(selected.score, pillar.offset);
              return (
                <div key={pillar.label} className="contents">
                  <span className="proto-secondary">{pillar.label}</span>
                  <PillarBar value={value} label={`${pillar.label}: ${fmtU(value)}`} />
                  <span className="proto-col-num font-mono tabular-nums">{fmtU(value)}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
