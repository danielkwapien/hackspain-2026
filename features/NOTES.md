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

### Pasada 1: veredicto del adversary y lecciones

- **FAIL 1 (aceptado, corregido):** `Canvas` montaba `WidgetFrame` sin `children` y el marco solo
  pintaba `{children}`, asi que `definition.component` no se invocaba desde ningun camino de
  produccion: en `/` los dos widgets salian con el cuerpo vacio. Los 7 checks pasaban igual. El
  adversary lo encontro leyendo el diff y la sesion lo encontro en paralelo abriendo el navegador.
  Corregido en `78684dc` con tres tests que lo cubren.
- **FAIL 2 (rechazado, spec aclarado):** el adversary marco como violacion de alcance que el primer
  commit mueva la fila 3 de `TASKQUEUE.md` de `todo` a `building`. La regla de `AGENTS.md` es que la
  cola es single-writer de la **sesion orquestadora** mientras la fila esta en `building`, y el
  protocolo §2.4 lo ordena explicitamente. La seccion 3 del spec decia «intocables para el builder»
  y el adversary lo leyo como absoluto: reescrita para que no vuelva a levantarse.

**Lecciones de operacion (para `compound` al cerrar):**
1. **El builder tiene que commitear su propio trabajo.** La regla «yo commiteo despues de verificar»
   choca con un adversary que restaura ficheros para probar el estado real de la rama: entre su
   restauracion y su vuelta atras, el commit del orquestador capturo el codigo roto y perdio la
   correccion. Un worktree, un escritor con commit propio.
2. **El check verde no prueba que la pantalla funcione.** Los tres defectos de integracion de esta
   pasada (cuerpo de widget vacio, el clic de fila que se traga el `setPointerCapture`, el
   `group-hover` sin nombre que enciende las 12 filas) pasaron los 7 checks y solo aparecieron al
   abrir el navegador. En un ticket de UI, la pasada no esta terminada sin mirar la pantalla.

### Rebase sobre `main` con XR-002 dentro

XR-002 se mergeo en `main` (PR #1) y su fila quedo en `done`, asi que la rama se rebaso siguiendo el
plan §11. Tres conflictos, todos resueltos a favor de `main` mas lo propio encima:

- `TASKQUEUE.md`: se conserva la fila 2 de `main` (XR-002 `done`, con PR y evidencia) y la fila 3
  propia (XR-003 `building`).
- `features/NOTES.md`: union de las dos columnas, sin descartar nada.
- `app/web/src/App.tsx`: solo la linea de `import` de React. `main` trae `Suspense, lazy` para el
  playground de tokens y XR-003 trae `useEffect` para `loadFromStorage`; el resto del fichero lo
  fusiono git solo. La ruta `/tokens` de XR-002 y las de XR-003 (`/`, `/portfolio`,
  `/company/:id`) conviven.

`index.css` y `lib/api.ts` no dieron conflicto. Tras el rebase: 48 tests en 13 ficheros y
`evals/checks/XR-003.sh` en `exit: 0`.

### Desviacion deliberada del plan §3.3: el selector de entidad mide 490 px, no 320

El plan fija un popover de 320 px con seis piezas por fila (nombre, id, grupo, score, regimen,
sparkline 64×16). Medido con las fuentes reales del proyecto, no caben:

- contenido disponible a 320 px: 294 px (310 de listbox menos 16 de `px-2`);
- lo que no puede encogerse: id 58,7 + score 18 + sparkline 64 + 5 gaps de 6 = **171 px**;
- quedan **123 px** para nombre + grupo + regimen, y solo el nombre necesita 119-128;
- peor caso real (fila con «Choque pendiente»): `scrollWidth` 374 sobre `clientWidth` 310.

Los tres repartos posibles a 320 px dejan el nombre entre 17 y 54 px, es decir ilegible. **Alfonso
decidio ensanchar a 490 px y conservar las seis piezas**, frente a las dos alternativas medidas
(acortar el contenido — `0147` en vez de `GROUP_0147` y el regimen como punto de color — o quitar
grupo y etiqueta de regimen). Queda anotado aqui porque el plan manda sobre el protocolo y esta es
una desviacion consciente de una medida que el plan da explicita.

Efecto lateral que el arreglo cubre: a 490 px el popover se sale del marco en un widget estrecho o
pegado al borde derecho, asi que se ancla por la derecha cuando no cabe hacia la derecha.
