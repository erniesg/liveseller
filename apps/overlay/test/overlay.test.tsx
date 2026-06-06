// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { validOverlayState } from "@liveseller/contracts";
import { App, formatCountdown } from "../src/App";

describe("public overlay", () => {
  it("renders product, promo, quantity, countdown, and multilingual captions", () => {
    render(<App state={validOverlayState} now={new Date("2026-06-06T03:55:00.000Z")} />);

    expect(screen.getByText("Bamboo Cooling Tee")).toBeInTheDocument();
    expect(screen.getByText(/SGD 19.90/)).toBeInTheDocument();
    expect(screen.getByText(/42 left/)).toBeInTheDocument();
    expect(screen.getByText("Live Flash 10% Off")).toBeInTheDocument();
    expect(screen.getByText("50 claims left")).toBeInTheDocument();
    expect(screen.getByText("Overlay-only")).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText(validOverlayState.caption.text)).toBeInTheDocument();
    expect(screen.getByText(validOverlayState.translatedCaptions[0]!.text)).toBeInTheDocument();
  });

  it("keeps long captions in caption containers without warning in the valid fixture", () => {
    render(<App state={validOverlayState} />);
    expect(validOverlayState.layoutWarnings).toEqual([]);
    expect(screen.getByLabelText("Live captions")).toHaveClass("caption-band");
  });

  it("formats promo countdowns deterministically", () => {
    expect(
      formatCountdown("2026-06-06T04:00:00.000Z", new Date("2026-06-06T03:58:30.000Z"))
    ).toBe("01:30");
  });
});
