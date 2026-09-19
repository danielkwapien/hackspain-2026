import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Segmented } from "@/components/ui/segmented";

type Range = "3M" | "6M" | "1A" | "Máx";

const OPTIONS: { value: Range; label: string }[] = [
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1A", label: "1A" },
  { value: "Máx", label: "Máx" },
];

/** Controlado como lo usa un panel: el valor vive en el padre. */
function Harness({ onChange, initial = "1A" }: { onChange?: (value: Range) => void; initial?: Range }) {
  const [value, setValue] = useState<Range>(initial);
  return (
    <Segmented
      value={value}
      options={OPTIONS}
      label="Rango"
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

function radios(): HTMLElement[] {
  return screen.getAllByRole("radio");
}

function checkedValues(): string[] {
  return radios()
    .filter((radio) => radio.getAttribute("aria-checked") === "true")
    .map((radio) => radio.textContent ?? "");
}

describe("Segmented", () => {
  it("renders a radiogroup with one checked radio", () => {
    render(<Harness />);

    const group = screen.getByRole("radiogroup", { name: "Rango" });
    expect(group).toBeInTheDocument();
    expect(radios()).toHaveLength(4);
    expect(checkedValues()).toEqual(["1A"]);
    for (const radio of radios()) {
      expect(radio.tagName).toBe("BUTTON");
      expect(radio).toHaveAttribute("type", "button");
    }
  });

  it("click checks the option and calls onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "3M" }));

    expect(onChange).toHaveBeenCalledWith("3M");
    expect(checkedValues()).toEqual(["3M"]);
  });

  it("ArrowRight/ArrowLeft rotate and wrap, Home/End jump", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} initial="1A" />);

    screen.getByRole("radio", { name: "1A" }).focus();

    // Moverse selecciona (semántica radio) y el foco sigue al elegido.
    await user.keyboard("{ArrowRight}");
    expect(checkedValues()).toEqual(["Máx"]);
    expect(screen.getByRole("radio", { name: "Máx" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(checkedValues()).toEqual(["3M"]);
    expect(screen.getByRole("radio", { name: "3M" })).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(checkedValues()).toEqual(["Máx"]);

    await user.keyboard("{Home}");
    expect(checkedValues()).toEqual(["3M"]);
    expect(screen.getByRole("radio", { name: "3M" })).toHaveFocus();

    await user.keyboard("{End}");
    expect(checkedValues()).toEqual(["Máx"]);
    expect(screen.getByRole("radio", { name: "Máx" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(checkedValues()).toEqual(["3M"]);
    await user.keyboard("{ArrowUp}");
    expect(checkedValues()).toEqual(["Máx"]);

    expect(onChange.mock.calls.map(([value]) => value)).toEqual([
      "Máx",
      "3M",
      "Máx",
      "3M",
      "Máx",
      "3M",
      "Máx",
    ]);
  });

  it("only the checked radio is in the tab order", async () => {
    const user = userEvent.setup();
    render(<Harness initial="6M" />);

    for (const radio of radios()) {
      expect(radio).toHaveAttribute(
        "tabindex",
        radio.getAttribute("aria-checked") === "true" ? "0" : "-1",
      );
    }

    await user.tab();
    expect(screen.getByRole("radio", { name: "6M" })).toHaveFocus();

    await user.click(screen.getByRole("radio", { name: "Máx" }));
    expect(screen.getByRole("radio", { name: "Máx" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "6M" })).toHaveAttribute("tabindex", "-1");
  });

  it("the indicator has transform and width inline styles and the motion-reduce class", () => {
    const { container } = render(<Harness />);

    const indicator = container.querySelector<HTMLElement>('[data-slot="segmented-indicator"]')!;
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute("aria-hidden", "true");
    expect(indicator.style.transform).toMatch(/translate/);
    expect(indicator.style.width).toMatch(/px$/);
    expect(indicator.className).toContain("motion-reduce:transition-none");
    expect(indicator.className).toContain("duration-[var(--duration-moderate)]");
  });
});
