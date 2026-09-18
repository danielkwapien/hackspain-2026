# NOTES — heartbeat del loop

Cada pasada de queue-run añade aqui una entrada con timestamp y la tabla actual
de TASKQUEUE.md. Es el latido: si esto no crece, el loop esta parado.

## 2026-09-19 00:43 — XR-002 (sesión XR-002)

Fila XR-002 `building` → `review`. Rama `xr/XR-002-design-tokens`, seis commits sobre `d707076`
(el arnés de XR-000, que todavía no está en `main`: la rama se sacó de ahí, no de `main`, porque
un worktree desde `main` no tiene `evals/` ni `AGENTS.md`).

- `bash evals/checks/XR-002.sh` y `bash evals/smoke.sh` en verde en dos pasadas consecutivas
  (commits `cbe27aa` y `498f636`). Evidencia en `plans/XR-002-design-tokens/evidence/`.
- Desviaciones del protocolo, anotadas como pide §0: los builders trabajaron en el worktree del
  ticket y no en uno propio (son secuenciales y el worktree ya está aislado del directorio
  compartido), y la comparación con Trade Republic se hizo con el navegador integrado de la
  sesión —Chrome con la extensión no estaba conectado—, midiendo con `getComputedStyle` en vez
  de guardar PNG del lado de TR.
- `TASKQUEUE.md` no existe en el worktree (está sin commitear en el directorio principal): la fila
  se actualizó allí.
## 2026-09-19 · XR-003 arranca (arranque anticipado, plan §11)

- Rama `xr/XR-003-widget-shell` en worktree `../hackspain-embat-XR-003`. Fila en `building`.
- XR-001 y XR-002 siguen en `building`: se aplica el plan §11 (pasos 1–3 con fixtures locales).
  XR-002 ya tiene `index.css` y `docs/design/tokens.md` completos en su rama; XR-003 estiliza con
  los alias de shadcn (`bg-card`, `border-border`, `text-muted-foreground`), que XR-002 conserva,
  y concentra las medidas de rejilla en `dashboard/grid.ts` para que el commit
  `XR-003: adopt design tokens` toque un solo fichero.
- **Contradicción plan/código:** el plan §3.6 dice que `/company/:id` "se mantiene", pero la ruta
  que existe hoy en `App.tsx` es `/companies/:companyId`. Se resuelve a favor del plan (y de
  XR-004, que también la nombra `/company/:id`): se añade `/company/:id` como ruta hacia la
  `CompanyPage` existente, sin tocar la página ni retirar la ruta antigua.
- **Decisión de dependencia:** store propio con `useSyncExternalStore` en vez de `zustand`
  (protocolo §7: no se instalan dependencias no listadas sin preguntar).

### Paso 1 (scout): decisión de rejilla y virtualización

- **Rejilla: implementación propia** sobre CSS grid de 24 columnas con pointer events. Cero
  dependencias nuevas.
  - `react-grid-layout` queda **descartado por un crash de runtime en React 19**: arrastra
    `react-draggable`, que llama a `ReactDOM.findDOMNode`, eliminado en React 19
    (react-grid-layout/react-draggable#771, abierta desde 12/2024). No es fricción de tipos.
  - `@dnd-kit/core` (propuesto por el scout) queda descartado por el criterio del plan §3.2
    («la opción que reproduzca eso con menos dependencia»): su `KeyboardSensor` mueve por
    píxeles y habría que sobrescribir `getNextCoordinates` para movernos por celda, el resize
    por esquina hay que escribirlo a mano de todos modos, y la compactación vertical también.
    Lo que aporta sobre un `onKeyDown` propio no compensa una dependencia en modo mantenimiento
    (su autor anunció la reescritura `@dnd-kit/react`).
- **Virtualización: `@tanstack/react-virtual`** solo en el widget Buscador (1.286 filas de 24 px).
  Declara React 19 en sus peer deps y el plan §3.4 la nombra. Se pasa `useFlushSync: false`
  (TanStack/virtual#743). En jsdom no rinde filas si no se mockea `ResizeObserver` para que
  dispare su callback: el mock va en `src/test/setup.ts`.
- **`EntityPicker` NO se virtualiza** (desviación consciente del plan §3.3): renderiza como mucho
  50 coincidencias y cuenta el resto. Un buscador con filtro no necesita pintar 1.286 filas, y
  así los tests de teclado no dependen de medir alturas en jsdom.
