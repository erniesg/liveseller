// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type RuntimeEvent, validLiveSessionSpec, validOverlayState, vintageJewelryLiveSessionSpec } from "@liveseller/contracts";
import { App, RuntimeOverlay, fetchOverlayState, formatCountdown } from "../src/App";
import { SellerConsole } from "../src/SellerConsole";

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

  it("renders a seller console that switches product context and sends video captions to runtime", async () => {
    const currentProduct = vintageJewelryLiveSessionSpec.products[0]!;
    const switchedProduct = vintageJewelryLiveSessionSpec.products[1]!;
    const overlayState = {
      ...validOverlayState,
      sessionId: vintageJewelryLiveSessionSpec.sessionId,
      currentProductId: currentProduct.id,
      productCard: {
        productId: currentProduct.id,
        title: currentProduct.title,
        price: currentProduct.price,
        currency: currentProduct.currency,
        stock: currentProduct.stock,
        imageUri: currentProduct.media.images[0]!.uri
      }
    };
    const switchedOverlayState = {
      ...overlayState,
      currentProductId: switchedProduct.id,
      productCard: {
        productId: switchedProduct.id,
        title: switchedProduct.title,
        price: switchedProduct.price,
        currency: switchedProduct.currency,
        stock: switchedProduct.stock,
        imageUri: switchedProduct.media.images[0]!.uri
      }
    };
    const requests: unknown[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/live-sessions/${vintageJewelryLiveSessionSpec.sessionId}/spec`)) {
        return new Response(JSON.stringify(vintageJewelryLiveSessionSpec), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith(`/api/overlay/${vintageJewelryLiveSessionSpec.sessionId}`)) {
        return new Response(JSON.stringify(overlayState), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith("/api/runtime/events")) {
        const event = JSON.parse(String(init?.body));
        requests.push(event);
        return new Response(
          JSON.stringify({
            overlayState: event.type === "product_switch" ? switchedOverlayState : {
              ...switchedOverlayState,
              caption: {
                text: event.payload.text,
                language: event.payload.language,
                visible: true
              }
            },
            actions: []
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    });

    render(
      <SellerConsole
        runtimeOrigin="http://runtime.test"
        sessionId={vintageJewelryLiveSessionSpec.sessionId}
        fetchImpl={fetchImpl as typeof fetch}
      />
    );

    await waitFor(() => expect(screen.getByText(vintageJewelryLiveSessionSpec.title)).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("Show")[1]!);
    await waitFor(() => expect(requests).toEqual([
      expect.objectContaining({
        sessionId: vintageJewelryLiveSessionSpec.sessionId,
        type: "product_switch",
        payload: { productId: switchedProduct.id }
      })
    ]));
    expect(within(screen.getByLabelText("Current overlay state")).getByText(switchedProduct.title)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Send caption"));
    await waitFor(() => expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: vintageJewelryLiveSessionSpec.sessionId,
          type: "host_transcript"
        })
      ])
    ));
  });

  it("starts a three-product run of show without storing stream credentials", async () => {
    const currentProduct = vintageJewelryLiveSessionSpec.products[0]!;
    const overlayState = {
      ...validOverlayState,
      sessionId: vintageJewelryLiveSessionSpec.sessionId,
      currentProductId: currentProduct.id,
      productCard: {
        productId: currentProduct.id,
        title: currentProduct.title,
        price: currentProduct.price,
        currency: currentProduct.currency,
        stock: currentProduct.stock,
        imageUri: currentProduct.media.images[0]!.uri
      }
    };
    const requests: unknown[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/live-sessions/${vintageJewelryLiveSessionSpec.sessionId}/spec`)) {
        return new Response(JSON.stringify(vintageJewelryLiveSessionSpec), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith(`/api/overlay/${vintageJewelryLiveSessionSpec.sessionId}`)) {
        return new Response(JSON.stringify(overlayState), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith("/api/runtime/events")) {
        const event = JSON.parse(String(init?.body));
        requests.push(event);
        const product = event.type === "product_switch"
          ? vintageJewelryLiveSessionSpec.products.find((candidate) => candidate.id === event.payload.productId) ?? currentProduct
          : currentProduct;
        return new Response(
          JSON.stringify({
            overlayState: {
              ...overlayState,
              currentProductId: product.id,
              productCard: {
                productId: product.id,
                title: product.title,
                price: product.price,
                currency: product.currency,
                stock: product.stock,
                imageUri: product.media.images[0]!.uri
              }
            },
            actions: []
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    });

    render(
      <SellerConsole
        runtimeOrigin="http://runtime.test"
        sessionId={vintageJewelryLiveSessionSpec.sessionId}
        fetchImpl={fetchImpl as typeof fetch}
      />
    );

    await waitFor(() => expect(screen.getByText(vintageJewelryLiveSessionSpec.title)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Start show"));

    await waitFor(() => expect(requests.filter((event) => (event as RuntimeEvent).type === "product_switch")).toHaveLength(3));
    expect(requests[0]).toMatchObject({
      sessionId: vintageJewelryLiveSessionSpec.sessionId,
      type: "stream_lifecycle",
      payload: {
        status: "started"
      }
    });
    expect(requests.map((event) => (event as RuntimeEvent).type)).toEqual([
      "stream_lifecycle",
      "product_switch",
      "product_switch",
      "product_switch"
    ]);
    expect(JSON.stringify(requests).toLowerCase()).not.toContain("streamkey");
    expect(JSON.stringify(requests).toLowerCase()).not.toContain("rtmp://");
  });
});
