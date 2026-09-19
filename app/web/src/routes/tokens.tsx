/**
 * Playground del sistema de tokens (solo desarrollo).
 *
 * Todo lo que se pinta sale de `src/index.css`: la hoja se lee en crudo y se
 * parsea con `parseThemeTokens`, así que aquí no vive ningún color. Los swatches
 * usan `var(--x)` y los contrastes se miden con `contrastRatio`, nunca se
 * estiman a mano.
 */
import type { ReactNode } from "react";
import css from "@/index.css?raw";
import {
  contrastRatio,
  expandToken,
  parseThemeTokens,
  tokenLayer,
  type TokenLayer,
} from "@/design/tokens";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAmount } from "@/lib/format";
import {
  ChartTooltip,
  LineNoAxes,
  PillarBar,
  RangeBar,
  Sparkline,
  Treemap,
  fmtDelta,
  fmtPoints,
  fmtU,
  type Regime,
} from "@/charts";
import {
  CONTRIBUTION_CASES,
  CONTRIBUTION_MAX_ABS,
  NORMALIZED_LEGEND,
  NORMALIZED_SERIES,
  OUTLOOK_BASELINE,
  OUTLOOK_FORECAST,
  OUTLOOK_MARKERS,
  OUTLOOK_SERIES,
  PILLAR_CASES,
  RANGE_CASE,
  REGIME_LINES,
  SPARK_CASES,
  TOOLTIP_MONTH,
  TOOLTIP_ROWS,
  TREEMAP_GROUPS,
  TREEMAP_SIZE,
} from "@/routes/tokens.charts-data";

const tokens = parseThemeTokens(css);
const tokenNames = Object.keys(tokens);

/** Escala tipográfica: los cinco tamaños de la capa de componente. */
const TYPE_SCALE = [
  { token: "--text-micro", use: "Etiquetas, unidades y notas al pie" },
  { token: "--text-control", use: "Controles, tablas y leyendas" },
  { token: "--text-body", use: "Texto corrido del tablero" },
  { token: "--text-widget-title", use: "Título de widget" },
  { token: "--text-figure", use: "Cifra destacada de un widget" },
];

const WEIGHTS = [
  { weight: 400, use: "Texto corrido" },
  { weight: 500, use: "Etiquetas y controles" },
  { weight: 600, use: "Títulos y cifras" },
];

/**
 * Régimen del motor con su serie de ejemplo (valores 0..1, de abajo a arriba).
 * Los puntos son datos fijos: la sparkline tiene que contar siempre lo mismo.
 * El color sale del régimen, no del signo del Δ: por eso `Sparkline` recibe
 * `regime` aquí y no en el catálogo de gráficas.
 */
const REGIMES: { token: string; label: string; regime: Regime; points: number[] }[] = [
  {
    token: "--regime-improving",
    regime: "improving",
    label: "Mejorando",
    points: [0.2, 0.26, 0.34, 0.42, 0.55, 0.64, 0.78, 0.9],
  },
  {
    token: "--regime-deteriorating",
    regime: "deteriorating",
    label: "Deteriorándose",
    points: [0.9, 0.82, 0.7, 0.62, 0.48, 0.36, 0.22, 0.1],
  },
  {
    token: "--regime-blip",
    regime: "blip",
    label: "Bache",
    points: [0.7, 0.68, 0.6, 0.22, 0.3, 0.52, 0.66, 0.7],
  },
  {
    token: "--regime-stable",
    regime: "stable",
    label: "Estable",
    points: [0.5, 0.52, 0.49, 0.51, 0.5, 0.48, 0.51, 0.5],
  },
  {
    token: "--regime-recovering",
    regime: "recovering",
    label: "Recuperando",
    points: [0.42, 0.24, 0.16, 0.2, 0.34, 0.48, 0.58, 0.66],
  },
  {
    token: "--regime-warmup",
    regime: "warmup",
    label: "Calentamiento",
    points: [0.36, 0.74, 0.28, 0.62, 0.34, 0.54, 0.46, 0.5],
  },
];

const BANDS = [
  { token: "--band-solid", label: "Sólida" },
  { token: "--band-healthy", label: "Sana" },
  { token: "--band-watch", label: "Vigilancia" },
  { token: "--band-stress", label: "Tensión" },
];

const CHART_TOKENS = [
  { token: "--chart-score", label: "Línea del score" },
  { token: "--chart-band", label: "Banda de referencia" },
  { token: "--chart-positive", label: "Serie positiva" },
  { token: "--chart-negative", label: "Serie negativa" },
  { token: "--chart-neutral", label: "Serie neutra" },
  { token: "--chart-pillar-liquidity", label: "Pilar liquidez" },
  { token: "--chart-pillar-payments", label: "Pilar pagos" },
  { token: "--chart-pillar-collections", label: "Pilar cobros" },
  { token: "--chart-pillar-debt", label: "Pilar deuda" },
  { token: "--chart-pillar-activity", label: "Pilar actividad" },
];

const TREEMAP_TOKENS = [
  "--treemap-pos-1",
  "--treemap-pos-2",
  "--treemap-pos-3",
  "--treemap-pos-4",
  "--treemap-neg-1",
  "--treemap-neg-2",
  "--treemap-neg-3",
  "--treemap-neg-4",
];

/** Pares texto/fondo que el sistema promete legibles. */
const CONTRAST_PAIRS = [
  { content: "--content-primary", surface: "--bg" },
  { content: "--content-secondary", surface: "--bg" },
  { content: "--content-tertiary", surface: "--bg" },
  { content: "--content-primary", surface: "--surface-primary" },
  { content: "--content-secondary", surface: "--surface-primary" },
  { content: "--content-tertiary", surface: "--surface-primary" },
  { content: "--content-positive", surface: "--surface-primary" },
  { content: "--content-negative", surface: "--surface-primary" },
  { content: "--content-alert", surface: "--surface-primary" },
  { content: "--content-warning", surface: "--surface-primary" },
  { content: "--content-accent", surface: "--surface-primary" },
];

const LAYER_DESCRIPTIONS: Record<string, string> = {
  primitive: "Único sitio con valores literales. No se consumen desde componentes.",
  semantic: "Dicen qué significa el color. Solo referencian primitivos.",
  component: "Medidas, tipografía y motion del tablero.",
};

/** Un token es de color si, expandido, acaba en un literal o en un gradiente. */
function isColorToken(name: string): boolean {
  const value = expandToken(tokens, name);
  return value.trimStart().startsWith("#") || value.includes("gradient(");
}

function verdict(ratio: number): string {
  if (ratio >= 4.5) return "AA texto";
  if (ratio >= 3) return "AA grande/gráfico";
  return "insuficiente";
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-2 border-t border-border pt-4">
      <h2 id={`${id}-title`} className="text-sm font-semibold tracking-tight">
        {title}
      </h2>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {children}
    </section>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <div
      className="h-5 w-9 shrink-0"
      style={{
        background: `var(${token})`,
        border: "1px solid var(--border-primary)",
        borderRadius: "var(--radius-control)",
      }}
    />
  );
}

function TokenLine({ token, label }: { token: string; label?: string }) {
  return (
    <li className="flex items-center gap-2">
      {isColorToken(token) ? <Swatch token={token} /> : null}
      <span className="num text-xs">{token}</span>
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
      <span className="num truncate text-xs text-muted-foreground">{tokens[token]}</span>
    </li>
  );
}

function LayerSection({ id, title, layer }: { id: string; title: string; layer: TokenLayer }) {
  const names = tokenNames.filter((name) => tokenLayer(name) === layer);

  return (
    <Section id={id} title={title} description={LAYER_DESCRIPTIONS[layer]}>
      <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
        {names.map((name) => (
          <TokenLine key={name} token={name} />
        ))}
      </ul>
    </Section>
  );
}

const CATALOG_DESCRIPTION =
  "Las seis primitivas de src/charts sobre datos fijos, importadas solo desde @/charts: " +
  "ningún widget del producto dibuja SVG de serie a mano.";

/**
 * Una variante del catálogo: la gráfica, su nombre, las props que la distinguen
 * y el token de color con el que se pinta.
 */
function ChartCase({
  name,
  props,
  token,
  children,
}: {
  name: string;
  props: string;
  token: string;
  children: ReactNode;
}) {
  return (
    <li className="space-y-1">
      {children}
      <div className="text-xs">{name}</div>
      <div className="num text-xs text-muted-foreground">{props}</div>
      <div className="num text-xs text-muted-foreground">{token}</div>
    </li>
  );
}

/** Una fila del catálogo: una primitiva y sus variantes lado a lado. */
function ChartRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 pt-2">
      <h3 className="text-xs font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export function TokensPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Tokens de Kima</h1>
        <p className="text-xs text-muted-foreground">
          Lectura directa de <span className="num">src/index.css</span>. Tres capas, alias de
          shadcn, semántica de datos y contraste medido. Pantalla de desarrollo: no forma parte del
          producto.
        </p>
      </div>

      <LayerSection id="primitivos" title="Primitivos" layer="primitive" />
      <LayerSection id="semanticos" title="Semánticos" layer="semantic" />
      <LayerSection id="componente" title="Componente" layer="component" />

      <Section
        id="tipografia"
        title="Tipografía"
        description="Inter Variable para todo; cifras con .num (tabular-nums)."
      >
        <ul className="space-y-1">
          {TYPE_SCALE.map(({ token, use }) => (
            <li key={token} className="flex flex-wrap items-baseline gap-3">
              <span className="num w-40 shrink-0 text-xs text-muted-foreground">{token}</span>
              <span style={{ fontSize: `var(${token})` }}>Cobertura de tesorería</span>
              <span className="num text-xs text-muted-foreground">{tokens[token]}</span>
              <span className="text-xs text-muted-foreground">{use}</span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-4 pt-2">
          {WEIGHTS.map(({ weight, use }) => (
            <li key={weight} className="flex items-baseline gap-2">
              <span style={{ fontWeight: weight }}>Score de la sociedad</span>
              <span className="num text-xs text-muted-foreground">{weight}</span>
              <span className="text-xs text-muted-foreground">{use}</span>
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap items-baseline gap-3 pt-2">
          <span className="num" style={{ fontSize: "var(--text-figure)" }}>
            12,3 pts
          </span>
          <span className="num" style={{ color: "var(--content-negative)" }}>
            -4,8 %
          </span>
          <span className="text-xs text-muted-foreground">
            Clase <span className="num">.num</span>: misma familia (Inter Variable), tabular-nums; las columnas no bailan.
          </span>
        </p>
      </Section>

      <Section
        id="regimenes"
        title="Regímenes"
        description="Seis estados del motor, seis colores distintos y una forma reconocible."
      >
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {REGIMES.map(({ token, regime, label, points }) => (
            <li key={token} className="flex items-center gap-3">
              <Swatch token={token} />
              <Sparkline points={points} regime={regime} />
              <span className="num text-xs">{token}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="bandas" title="Bandas" description="Bandas de salud del score.">
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {BANDS.map(({ token, label }) => (
            <li key={token} className="flex items-center gap-2">
              <Swatch token={token} />
              <span className="num text-xs">{token}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="graficas"
        title="Gráficas"
        description="Series del tablero y escala de intensidad del treemap."
      >
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {CHART_TOKENS.map(({ token, label }) => (
            <li key={token} className="flex items-center gap-2">
              <Swatch token={token} />
              <span className="num text-xs">{token}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-2 pt-2">
          {TREEMAP_TOKENS.map((token) => (
            <li key={token} className="flex items-center gap-2">
              <Swatch token={token} />
              <span className="num text-xs">{token}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="contraste"
        title="Contraste"
        description="Ratio WCAG 2.1 medido sobre los valores resueltos de la hoja."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Texto</TableHead>
              <TableHead>Fondo</TableHead>
              <TableHead>Ratio</TableHead>
              <TableHead>Veredicto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CONTRAST_PAIRS.map(({ content, surface }) => {
              const ratio = contrastRatio(
                expandToken(tokens, content),
                expandToken(tokens, surface),
              );

              return (
                <TableRow key={`${content}-${surface}`}>
                  <TableCell className="num text-xs">{content}</TableCell>
                  <TableCell className="num text-xs">{surface}</TableCell>
                  <TableCell className="num text-xs">{formatAmount(ratio)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{verdict(ratio)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      <Section id="graficas-xray" title="Gráficas de Kima" description={CATALOG_DESCRIPTION}>
        <ChartRow title="LineNoAxes · un régimen por línea, a 148 px">
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {REGIME_LINES.map((line) => (
              <ChartCase
                key={line.regime}
                name={`LineNoAxes · ${line.label}`}
                props="series, label"
                token={line.token}
              >
                <LineNoAxes series={line.series} label={`Score, régimen ${line.label}`} />
              </ChartCase>
            ))}
          </ul>
        </ChartRow>

        <ChartRow title="LineNoAxes · outlook y normalización">
          <ul className="grid gap-4 xl:grid-cols-2">
            <ChartCase
              name="LineNoAxes · baseline y banda de outlook"
              props="series, baseline, forecast, markers"
              token="--chart-2 (banda y proyección)"
            >
              <LineNoAxes
                series={OUTLOOK_SERIES}
                baseline={OUTLOOK_BASELINE}
                forecast={OUTLOOK_FORECAST}
                markers={OUTLOOK_MARKERS}
                label="Score con baseline y banda de outlook"
              />
            </ChartCase>
            <ChartCase
              name="LineNoAxes · normalize con tres series"
              props="series ×3, normalize"
              token="--chart-score, --chart-positive, --chart-negative"
            >
              <LineNoAxes
                series={NORMALIZED_SERIES}
                normalize
                unit="base"
                label="Tres sociedades rebasadas a 100"
              />
              {/* La leyenda la pone el consumidor: la primitiva no la dibuja. */}
              <ul className="flex flex-wrap gap-3 pt-1">
                {NORMALIZED_LEGEND.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <span
                      className="h-0.5 w-3 shrink-0"
                      style={{ backgroundColor: line.color }}
                    />
                    <span>{line.id}</span>
                    <span className="num">{line.token}</span>
                  </li>
                ))}
              </ul>
            </ChartCase>
          </ul>
        </ChartRow>

        <ChartRow title="Sparkline · 64×16, color por el signo del Δ">
          <ul className="flex flex-wrap gap-6">
            {SPARK_CASES.map((spark) => {
              const delta = fmtDelta(spark.points[spark.points.length - 1] - spark.points[0]);

              return (
                <ChartCase
                  key={spark.id}
                  name={`Sparkline · ${spark.id}`}
                  props={spark.props}
                  token={spark.token}
                >
                  <div className="flex items-center gap-2">
                    <Sparkline points={spark.points} dot={spark.dot} />
                    <span className="num text-xs" style={{ color: delta.tone }}>
                      {delta.text}
                    </span>
                  </div>
                </ChartCase>
              );
            })}
          </ul>
        </ChartRow>

        <ChartRow title="RangeBar · dónde cae el valor dentro de su rango">
          <ul className="flex flex-wrap gap-6">
            <ChartCase
              name="RangeBar · plain"
              props="min 0, max 100, value 62,40"
              token="--content-primary (punto)"
            >
              <div className="w-56">
                <RangeBar {...RANGE_CASE} />
              </div>
            </ChartCase>
            <ChartCase
              name="RangeBar · segmented"
              props='variant "segmented"'
              token="--band-stress, --band-watch, --band-healthy, --band-solid"
            >
              <div className="w-56">
                <RangeBar {...RANGE_CASE} variant="segmented" />
              </div>
            </ChartCase>
          </ul>
        </ChartRow>

        <ChartRow title="PillarBar · los tres tramos de la nota y la barra divergente">
          <ul className="flex flex-wrap gap-6">
            {PILLAR_CASES.map((pillar) => (
              <ChartCase
                key={pillar.label}
                name={`PillarBar · ${pillar.label}`}
                props={`value ${fmtU(pillar.u)}`}
                token={pillar.token}
              >
                <div className="w-40">
                  <PillarBar value={pillar.u} label={`Nota de ${pillar.label}`} />
                </div>
              </ChartCase>
            ))}
            {CONTRIBUTION_CASES.map((contribution) => {
              const delta = fmtDelta(contribution.points);

              return (
                <ChartCase
                  key={contribution.label}
                  name={`PillarBar · ${contribution.label}`}
                  props={`variant "diverging", maxAbs ${fmtPoints(CONTRIBUTION_MAX_ABS)}`}
                  token={contribution.token}
                >
                  <div className="w-40">
                    <PillarBar
                      value={contribution.points}
                      label={`Contribución de ${contribution.label}`}
                      variant="diverging"
                      maxAbs={CONTRIBUTION_MAX_ABS}
                    />
                  </div>
                  <div className="num text-xs" style={{ color: delta.tone }}>
                    {delta.text}
                  </div>
                </ChartCase>
              );
            })}
          </ul>
        </ChartRow>

        <ChartRow title="Treemap · 40 clientes en dos carteras">
          <ul>
            <ChartCase
              name="Treemap · groups"
              props="groups ×2, items ×40, unit «pts», currency EUR"
              token="--treemap-pos-1…4, --treemap-neg-1…4"
            >
              <Treemap
                groups={TREEMAP_GROUPS}
                width={TREEMAP_SIZE.width}
                height={TREEMAP_SIZE.height}
                unit="pts"
                currency="EUR"
                label="Contribución por cliente"
              />
            </ChartCase>
          </ul>
        </ChartRow>

        <ChartRow title="ChartTooltip · abierto y estático, sin pasar el puntero">
          <ul className="pt-20">
            <ChartCase
              name="ChartTooltip · tres series"
              props="month, rows ×3, x 0"
              token="--surface-tooltip"
            >
              {/* El tooltip cuelga por encima de su ancla: el hueco de arriba es su sitio. */}
              <div className="relative h-px">
                <ChartTooltip month={TOOLTIP_MONTH} rows={TOOLTIP_ROWS} x={0} />
              </div>
            </ChartCase>
          </ul>
        </ChartRow>
      </Section>
    </div>
  );
}
