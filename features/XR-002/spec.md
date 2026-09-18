---
feature: XR-002
depends_on: []
parallel: true
conflicts_with: []
lane: contenido
verify: evals/checks/XR-002.sh
max_attempts: 3
---
# Spec: XR-002

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-002: <item>") y termina la pasada.

## 1. Objetivo

`app/web/src/index.css` define el sistema de tokens de X-Ray en tres capas
(primitivos -> semanticos -> componente) con la marca de Embat sobre la estructura
tonal de Trade Republic, con ruta `/tokens` de playground, documentado en
`docs/design/tokens.md` y validado por tests de resolucion y de contraste.

## 2. Comportamiento (escenarios verificables)

- DADO `app/web/src/index.css` CUANDO se parsea con `parseThemeTokens` ENTONCES cada
  token semantico resuelve a un primitivo (sin hex crudo fuera de la capa primitiva),
  los alias de shadcn (`--background`, `--card`, `--primary`, `--muted-foreground`,
  `--ring`, `--chart-1..5`) apuntan a semanticos, existen y son distintos los tokens de
  regimen y de banda, el contraste de `--content-primary` y `--content-secondary` sobre
  `--bg` y `--surface-primary` es >= 4.5, el de positivo/negativo/alerta sobre
  `--surface-primary` es >= 3.0, no hay hex literal en `src/**/*.tsx` fuera de
  `index.css`, y la ruta `/tokens` renderiza swatches, regimenes, bandas y los ocho
  `--chart-*`.   # -> web_test tokens
- DADO la pantalla de cartera CUANDO se renderiza con los tokens nuevos ENTONCES sigue
  mostrando su contenido sin romper (mismos tests que antes del cambio).   # -> web_test portfolio
- DADO la pantalla de sociedad CUANDO se renderiza con los tokens nuevos ENTONCES sigue
  mostrando su contenido sin romper.   # -> web_test company
- DADO la pantalla de monitor CUANDO se renderiza con los tokens nuevos ENTONCES sigue
  mostrando su contenido sin romper.   # -> web_test monitor

## 3. Fuera de alcance

- Ningun widget nuevo, ninguna rejilla de tablero, ningun cambio de copy.
- No se cambia la estructura ni el layout de `portfolio`, `company` ni `monitor`.
- No se reescriben los componentes `components/ui/*` de shadcn: solo consumen variables.
- No se instala ninguna fuente por CDN ni ninguna dependencia nueva.
- Morado y rosa de Embat no entran en producto; verde/rojo/naranja semanticos no se cambian;
  radios, duraciones, sombras difusas y gradientes decorativos no se tocan.
- `app/api`, `datasets_mocked/` y `evals/` no se tocan.

## 4. Verificacion
- [ ] bash evals/smoke.sh          → exit 0
- [ ] bash evals/checks/XR-002.sh  → exit 0   # nacio en rojo sobre main
- [ ] captura de `/tokens` y de las tres pantallas en plans/XR-002-design-tokens/evidence/

## 5. Prioridades (de arriba abajo)
1. `src/design/tokens.ts` (`parseThemeTokens`, `resolveToken`, `contrastRatio`) y
   `src/design/tokens.test.ts` con los seis casos del plan §5.
2. `index.css` con las tres capas y los alias de shadcn -> `web_test tokens` en verde.
3. Ruta `/tokens` (playground) con swatches, tipografia, regimenes, bandas, sparkline por
   regimen y los ocho `--chart-*`, mas su test.
4. `docs/design/tokens.md` con las tablas por capa, semantica de datos, tipografia, motion
   y la tabla de contrastes medidos.
5. Las tres pantallas en verde con los tokens nuevos (`web_test portfolio|company|monitor`).
