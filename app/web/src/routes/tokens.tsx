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
 */
const REGIMES = [
  {
    token: "--regime-improving",
    label: "Mejorando",
    points: [0.2, 0.26, 0.34, 0.42, 0.55, 0.64, 0.78, 0.9],
  },
  {
    token: "--regime-deteriorating",
    label: "Deteriorándose",
    points: [0.9, 0.82, 0.7, 0.62, 0.48, 0.36, 0.22, 0.1],
  },
  {
    token: "--regime-blip",
    label: "Bache",
    points: [0.7, 0.68, 0.6, 0.22, 0.3, 0.52, 0.66, 0.7],
  },
  {
    token: "--regime-stable",
    label: "Estable",
    points: [0.5, 0.52, 0.49, 0.51, 0.5, 0.48, 0.51, 0.5],
  },
  {
    token: "--regime-recovering",
    label: "Recuperando",
    points: [0.42, 0.24, 0.16, 0.2, 0.34, 0.48, 0.58, 0.66],
  },
  {
    token: "--regime-warmup",
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

function Sparkline({ token, label, points }: { token: string; label: string; points: number[] }) {
  const coordinates = points
    .map((value, index) => {
      const x = 1 + (index * 62) / (points.length - 1);
      const y = 15 - value * 14;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      role="img"
      aria-label={`Sparkline del régimen ${label}`}
      viewBox="0 0 64 16"
      preserveAspectRatio="none"
      style={{ width: "var(--size-sparkline-w)", height: "var(--size-sparkline-h)" }}
    >
      <polyline
        points={coordinates}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: `var(${token})` }}
      />
    </svg>
  );
}

export function TokensPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Tokens de X-Ray</h1>
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
        description="Geist Variable para texto, Geist Mono con cifras tabulares para números."
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
            Clase <span className="num">.num</span>: monoespaciada y tabular, las columnas no bailan.
          </span>
        </p>
      </Section>

      <Section
        id="regimenes"
        title="Regímenes"
        description="Seis estados del motor, seis colores distintos y una forma reconocible."
      >
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {REGIMES.map(({ token, label, points }) => (
            <li key={token} className="flex items-center gap-3">
              <Swatch token={token} />
              <Sparkline token={token} label={label} points={points} />
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
    </div>
  );
}
