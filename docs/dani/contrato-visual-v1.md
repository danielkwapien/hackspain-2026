# Contrato visual v1 (dashboard Embat)

Estado: implementado en `app/web` (tema oscuro por defecto). Complementa al
[contrato del dashboard](contrato-dashboard-v1.md): aquí se fija **cómo se ve y cómo se escribe**, no qué datos
se sirven.

## 1. Tokens

Definidos en `app/web/src/index.css` (`@theme` de Tailwind v4, CSS-first, sin `tailwind.config`).
Los mismos valores aplican en `:root` y en `.dark` porque el producto es oscuro por defecto.

| Token | Valor | Uso |
|---|---|---|
| `--background` | `#0A0E13` | Fondo de la aplicación |
| `--card` / `--popover` | `#0F141B` | Superficies: paneles, tablas, menús |
| `--border` / `--input` | `#1D2530` | Bordes, separadores y campos |
| `--foreground` | `#E8ECF2` | Texto principal |
| `--muted-foreground` | `#98A2B3` | Texto secundario, etiquetas, unidades |
| `--primary` | `#5B8DEF` | Acento escaso: acción o dato seleccionado |
| `--positive` | `#35A06B` | Mejora o entrada de caja |
| `--negative` | `#C75450` | Deterioro o salida de caja |
| `--warning` | `#C79A3A` | Aviso: mes parcial, banner de demo, cobertura incompleta |
| `--chart-1..5` | acento, negativo, positivo, aviso, apagado | Series de los gráficos |

Reglas de token: radios de 6 px (`--radius`, con `sm/md/lg/xl` derivados); tipografías self-hosted
Geist Sans (`--font-sans`) y Geist Mono (`--font-mono`) vía `@fontsource-variable/*`, nunca CDN;
todas las cifras se pintan con `font-mono` y `tabular-nums` (clase `.num`), de forma que las columnas
de importes queden alineadas.

## 2. Composición

- Densidad de terminal financiero: filas de tabla de 32-36 px, tipografía base de 14 px, jerarquía por
  peso y color, no por tamaño ni por cajas.
- La unidad de lectura es la **tabla y el panel**, no la tarjeta suelta: cabecera de contexto arriba
  (corte de datos, versión del dataset, `generated_at`, avisos), filtros en una sola línea, contenido
  debajo sin scroll horizontal innecesario.
- Estructura por pantalla: cartera (filtros + tabla densa), detalle de sociedad (panel de score, series,
  tablas de facturas, caja, deuda y cobertura), monitor (bandeja de alertas).
- El color semántico es escaso: positivo/negativo solo en cifras y deltas; el aviso solo en avisos
  reales (mes parcial, modo demostración, cobertura parcial).
- Estados siempre explícitos: carga (skeletons con la forma del contenido), vacío, error (causa +
  reintentar) y datos insuficientes por sección. Nunca se rellena un hueco con un cero.

## 3. Copy

- Español impersonal de CFO/tesorero: «caja», «movimientos», «facturas», «deuda», «cuadro», «cobertura»,
  «corte de datos», «pendiente de cálculo».
- Cifras con separador de millares y 2 decimales; la moneda se etiqueta aparte (`EUR 32.477,26` nunca
  `€32k`). Fechas `DD/MM/YYYY`; meses `MM/YYYY`; periodos `YYYY-MM` solo en datos crudos.
- Prohibido: em dashes, spanglish, promesas («tiempo real», «alertas garantizadas»), adjetivos de
  marketing, y cualquier texto que sugiera monitorización bancaria en vivo.
- Sin motor de score, el estado por defecto de toda entidad se escribe «Pendiente de cálculo» y se
  explica qué mostrará cuando existan resultados. Nunca un número en su lugar.

## 4. Anti-patrones (prohibidos)

- Gradientes decorativos, glassmorphism, sombras difusas, pills en acciones, iconografía decorativa.
- Cuadrículas de tarjetas sin función; KPI hero con cifra gigante; gráficos sin ejes ni unidades.
- Sumar monedas distintas o mostrar una cifra consolidada sin política FX.
- Presentar datos sintéticos (fixtures) sin banner, o como resultado del motor o del dataset.
- Skeleton infinito, estados de error con el texto crudo de la API, o spinners sin contexto.

## 5. Verificación

- `cd app && corepack pnpm --filter web typecheck && corepack pnpm --filter web test && corepack pnpm --filter web build`.
- Consola del navegador sin errores en las tres pantallas y en ambos modos del monitor.
- Comprobación visual por pantalla: corte de datos y avisos visibles, mes parcial distinguido en la
  serie, «Pendiente» donde no hay score, «—» donde no hay dato, banner ámbar solo en modo demo.
- Contraste mínimo 4.5:1 para texto normal sobre `--background` y `--card`; foco visible con `--ring`.
- Las cifras de la UI deben poder rastrearse hasta `app/exports/v1` (misma cifra, misma moneda, misma
  fecha efectiva); si no coincide, es un fallo del dashboard, no del export.
