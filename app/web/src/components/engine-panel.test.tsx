import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnginePanel } from "./engine-panel";

describe("EnginePanel snapshot", () => {
  it("renders a published score with an unknown structured trajectory", () => {
    render(<EnginePanel engine={{
      status: "partial",
      score: 54.93,
      trajectory: { direction: "unknown", months_in_direction: null, regime: "static_baseline" },
    }} />);
    expect(screen.getByText("54,93")).toBeInTheDocument();
    expect(screen.getByText("Sin trayectoria publicada")).toBeInTheDocument();
  });
});
