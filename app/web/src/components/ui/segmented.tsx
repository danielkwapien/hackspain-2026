/**
 * Control segmentado (rango de la gráfica, familia de KPIs): un `radiogroup` hecho a
 * mano con el indicador deslizante de Trade Republic.
 *
 * Semántica radio: las flechas mueven el foco Y seleccionan, `Home`/`End` saltan a los
 * extremos y solo la opción marcada está en el orden de tabulación (roving tabindex).
 * El indicador es un `span` absoluto que se mide con `offsetLeft`/`offsetWidth` en
 * `useLayoutEffect` (y se vuelve a medir con `ResizeObserver`), así que el
 * desplazamiento anima solo `transform` y `width`.
 */

import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { cn } from "cn";

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedProps<T extends string> = {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Nombre accesible del grupo («Rango», «Familia»). */
  label: string;
  className?: string;
};

const GROUP_CLASS =
  "relative inline-flex h-[var(--size-segment-sm)] shrink-0 items-center rounded-[var(--radius-control)] bg-surface-glass p-0.5 shadow-[inset_0_0_0_1px_var(--border-glass)]";

/* Feedback de pulsación como el resto de controles: encoge un 3 % mientras se mantiene. */
const ITEM_CLASS =
  "relative z-[1] flex h-full items-center rounded-[var(--radius-control)] px-2 text-[length:var(--text-control)] font-semibold whitespace-nowrap transition-[color,transform] duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[.97] [@media(hover:hover)]:hover:scale-[1.02] motion-reduce:transition-none";

const INDICATOR_CLASS =
  "pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[var(--radius-control)] bg-surface-glass-hover backdrop-blur-[var(--blur-glass)] transition-[transform,width] duration-[var(--duration-moderate)] ease-[var(--ease-enter)] motion-reduce:transition-none";

type Indicator = { x: number; width: number };

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: SegmentedProps<T>): ReactElement {
  const groupRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState<Indicator>({ x: 0, width: 0 });

  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  useLayoutEffect(() => {
    function measure() {
      const item = itemRefs.current[activeIndex];
      if (!item) return;
      const next = { x: item.offsetLeft, width: item.offsetWidth };
      setIndicator((previous) =>
        previous.x === next.x && previous.width === next.width ? previous : next,
      );
    }

    measure();
    const group = groupRef.current;
    if (!group) return;
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    return () => observer.disconnect();
  }, [activeIndex, options.length]);

  /** Mueve el foco a la opción y la selecciona (semántica radio). */
  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    itemRefs.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = options.length;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % count;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    choose(next);
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      data-slot="segmented"
      className={cn(GROUP_CLASS, className)}
    >
      <span
        aria-hidden="true"
        data-slot="segmented-indicator"
        className={INDICATOR_CLASS}
        style={{ transform: `translateX(${indicator.x}px)`, width: `${indicator.width}px` }}
      />
      {options.map((option, index) => {
        const checked = index === activeIndex;
        return (
          <button
            key={option.value}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => choose(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              ITEM_CLASS,
              checked ? "text-content-primary" : "text-content-secondary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
