// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { validLiveSessionSpec, validOverlayState } from "@liveseller/contracts";
import { App, RuntimeOverlay, fetchOverlayState, formatCountdown } from "../src/App";

describe("public overlay", () => {
  it("renders product, promo, quantity, countdown, and multilingual captions", () => {
    render(<App state={validOverlayState} now={new Date("2026-06-06T03:55:00.000Z")} />);

    expect(screen.getByLabelText("Overlay runtime status")).toHaveTextContent("Fixture mode");
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

  it("fetches and validates runtime overlay state", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(validOverlayState), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const state = await fetchOverlayState(
      "http://runtime.test",
      validLiveSessionSpec.sessionId,
      fetchImpl as typeof fetch
    );

    expect(fetchImpl).toHaveBeenCalledWith(`http://runtime.test/api/overlay/${validLiveSessionSpec.sessionId}`);
    expect(state.productCard?.title).toBe(validOverlayState.productCard?.title);
  });

  it("syncs overlay state from runtime for livestream video output", async () => {
    const liveState = {
      ...validOverlayState,
      currentProductId: validLiveSessionSpec.products[1]!.id,
      caption: {
        text: "这款收纳包适合旅行用",
        language: "zh" as const,
        visible: true
      },
      productCard: {
        productId: validLiveSessionSpec.products[1]!.id,
        title: "Travel Cable Pouch",
        price: 14.5,
        currency: "SGD" as const,
        stock: 30,
        imageUri: "/assets/products/cable-pouch.svg"
      }
    };
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(liveState), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    render(
      <RuntimeOverlay
        runtimeOrigin="http://runtime.test"
        sessionId={validLiveSessionSpec.sessionId}
        pollMs={0}
        fetchImpl={fetchImpl as typeof fetch}
      />
    );

    await waitFor(() => expect(screen.getByLabelText("Overlay runtime status")).toHaveTextContent("Runtime live"));
    expect(screen.getByText("Travel Cable Pouch")).toBeInTheDocument();
    expect(screen.getByText("这款收纳包适合旅行用")).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledWith(`http://runtime.test/api/overlay/${validLiveSessionSpec.sessionId}`);
  });

  it("keeps fixture overlay visible when runtime sync fails", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      })
    );

    render(
      <RuntimeOverlay
        runtimeOrigin="http://runtime.test"
        sessionId={validLiveSessionSpec.sessionId}
        pollMs={0}
        fetchImpl={fetchImpl as typeof fetch}
      />
    );

    await waitFor(() => expect(screen.getByLabelText("Overlay runtime status")).toHaveTextContent("Runtime offline"));
    expect(screen.getByText("Bamboo Cooling Tee")).toBeInTheDocument();
  });
});
