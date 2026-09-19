/**
 * Picker flotante del arnés de prototipos. Markup y CSS son los de la spec de
 * XR-030 (`picker.css`); aquí vive solo el contrato de comportamiento: un item
 * activo, highlight que se desliza midiendo `offsetWidth`/`offsetLeft`, teclas
 * `1–N`, `←`/`→` y `R`, y `data-ready` tras el primer paint para que la carga
 * no anime.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./picker.css";

export type PickerProps = {
  labels: readonly string[];
  active: number;
  onSelect: (index: number) => void;
  onReplay: () => void;
};

/** Con el foco en un control de texto, las teclas son suyas. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function Picker({ labels, active, onSelect, onReplay }: PickerProps) {
  const highlightRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [ready, setReady] = useState(false);

  // Dos frames tras el montaje: el highlight ya está colocado y a partir de aquí sí transiciona.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  useLayoutEffect(() => {
    const item = itemRefs.current[active];
    const highlight = highlightRef.current;
    if (!item || !highlight) return;
    highlight.style.width = `${item.offsetWidth}px`;
    highlight.style.transform = `translateX(${item.offsetLeft}px)`;
  }, [active, labels]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const count = labels.length;
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= count) {
        onSelect(digit - 1);
      } else if (event.key === "ArrowLeft") {
        onSelect((active - 1 + count) % count);
      } else if (event.key === "ArrowRight") {
        onSelect((active + 1) % count);
      } else if (event.key === "r" || event.key === "R") {
        onReplay();
      } else {
        return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [labels.length, active, onSelect, onReplay]);

  return (
    <nav
      className="proto-picker"
      aria-label="Prototype variants"
      data-ready={ready ? "" : undefined}
    >
      <span ref={highlightRef} className="proto-picker-highlight" aria-hidden="true" />
      {labels.map((label, index) => {
        const isActive = index === active;
        return (
          <button
            key={label}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            type="button"
            className="proto-picker-item"
            data-active={isActive ? "" : undefined}
            aria-current={isActive ? "true" : undefined}
            onClick={() => onSelect(index)}
          >
            {label}
          </button>
        );
      })}
      <span className="proto-picker-divider" aria-hidden="true" />
      <button
        type="button"
        className="proto-picker-item proto-picker-replay"
        aria-label="Replay animation (R)"
        onClick={onReplay}
      >
        ↻
      </button>
    </nav>
  );
}
