/**
 * Prototipo de fondo (XR-030, solo desarrollo): tres personalidades del orbe
 * difuminado detrás del mismo stage. Cambiar de variante o pulsar replay
 * re-monta stage y fondo con `key`; la selección persiste en `?v=N`.
 */
import { useCallback, useEffect, useState } from "react";
import { Aurora } from "./Aurora";
import { Foco } from "./Foco";
import { Marino } from "./Marino";
import { Picker } from "./Picker";
import { Stage } from "./Stage";

const VARIANTS = [
  { label: "Marino", Background: Marino },
  { label: "Aurora", Background: Aurora },
  { label: "Foco", Background: Foco },
] as const;

const LABELS = VARIANTS.map((variant) => variant.label);

const PARAM = "v";

/** `?v=N` (1-based) → índice, o 0 si falta o no es válido. */
function readParam(): number {
  const raw = Number(new URLSearchParams(window.location.search).get(PARAM));
  return Number.isInteger(raw) && raw >= 1 && raw <= VARIANTS.length ? raw - 1 : 0;
}

export function BackgroundPrototypePage() {
  const [active, setActive] = useState(readParam);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set(PARAM, String(active + 1));
    window.history.replaceState(null, "", url);
  }, [active]);

  const onReplay = useCallback(() => setReplay((count) => count + 1), []);

  const { Background } = VARIANTS[active];

  return (
    <div className="proto-root">
      <div key={`${active}-${replay}`} className="contents">
        <Background />
        <Stage />
      </div>
      <Picker labels={LABELS} active={active} onSelect={setActive} onReplay={onReplay} />
    </div>
  );
}
