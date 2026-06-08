// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type OverlayState, type RuntimeEvent, validLiveSessionSpec, validOverlayState, vintageJewelryLiveSessionSpec } from "@liveseller/contracts";
import { App, RuntimeOverlay, fetchOverlayState, formatCountdown } from "../src/App";
import { SellerConsole } from "../src/SellerConsole";

describe("public overlay", () => {
  it("renders product, promo, quantity, countdown, and multilingual captions", () => {
    render(<App state={validOverlayState} now={new Date("2026-06-06T03:55:00.000Z")} />);

    expect(screen.queryByLabelText("Overlay runtime status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Livestream display stage")).toBeInTheDocument();
    expect(screen.queryByLabelText("Current product and promotion")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Seller camera feed")).toBeInTheDocument();
    expect(screen.getByLabelText("LiveSeller livestream overlay")).toHaveClass("overlay-has-captions", "overlay-has-product");
    expect(screen.getByText("Bamboo Cooling Tee")).toBeInTheDocument();
    expect(screen.getByText(/SGD 19.90/)).toBeInTheDocument();
    expect(screen.getByText(/42 left/)).toBeInTheDocument();
    expect(screen.getByText("Live Flash 10% Off")).toBeInTheDocument();
    expect(screen.getByText("50 claims left")).toBeInTheDocument();
    expect(screen.queryByText("Overlay-only")).not.toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText(validOverlayState.caption.text)).toBeInTheDocument();
    expect(screen.getByText(validOverlayState.translatedCaptions[0]!.text)).toBeInTheDocument();
    expect(screen.getByLabelText("Current product overlay")).toHaveClass("overlay-panel", "overlay-panel-lower-third");
    expect(screen.getByLabelText("Live promotion")).toHaveClass("overlay-panel", "overlay-panel-promo");
  });

  it("renders camera-only display chrome before runtime generates overlays", () => {
    render(
      <App
        state={{
          ...validOverlayState,
          caption: {
            text: "",
            language: "zh",
            visible: false
          },
          translatedCaptions: [],
          productCard: {
            ...validOverlayState.productCard!,
            visible: false
          },
          promoBanner: undefined,
          background: {
            mode: "off",
            value: "off",
            label: "Camera only"
          }
        }}
      />
    );

    expect(screen.getByLabelText("Livestream display stage")).toBeInTheDocument();
    expect(screen.getByLabelText("Seller camera feed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Live promotion")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current product overlay")).not.toBeInTheDocument();
    expect(screen.queryByText("Bamboo Cooling Tee")).not.toBeInTheDocument();
    expect(screen.queryByText("FLASH SALE")).not.toBeInTheDocument();
    expect(screen.queryByText(validOverlayState.caption.text)).not.toBeInTheDocument();
    expect(screen.queryByText(validOverlayState.translatedCaptions[0]!.text)).not.toBeInTheDocument();
    expect(screen.getByLabelText("LiveSeller livestream overlay")).not.toHaveClass("overlay-has-captions", "overlay-has-product");
  });

  it("renders transparent overlay-only layers for camera compositing", () => {
    render(
      <App
        cameraEnabled={false}
        transparent
        state={{
          ...validOverlayState,
          caption: {
            text: "",
            language: "zh",
            visible: false
          },
          translatedCaptions: [],
          productCard: {
            ...validOverlayState.productCard!,
            visible: false
          },
          promoBanner: undefined,
          background: {
            mode: "off",
            value: "off",
            label: "Camera only"
          }
        }}
      />
    );

    expect(screen.getByLabelText("LiveSeller livestream overlay")).toHaveClass("overlay-shell-transparent", "overlay-bg-off");
    expect(screen.queryByLabelText("Seller camera feed")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Live promotion")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current product overlay")).not.toBeInTheDocument();
    expect(screen.queryByText("FLASH SALE")).not.toBeInTheDocument();
  });

  it("polls runtime and renders dynamically generated realtime overlay state", async () => {
    let liveState: OverlayState = {
      ...validOverlayState,
      caption: {
        text: "",
        language: "zh" as const,
        visible: false
      },
      translatedCaptions: [],
      productCard: {
        ...validOverlayState.productCard!,
        visible: false
      },
      promoBanner: undefined,
      background: {
        mode: "off" as const,
        value: "off",
        label: "Camera only"
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
        pollMs={25}
        fetchImpl={fetchImpl as typeof fetch}
        transparent
        cameraEnabled={false}
      />
    );

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(screen.queryByLabelText("Seller camera feed")).not.toBeInTheDocument();
    expect(screen.queryByText("Bamboo Cooling Tee")).not.toBeInTheDocument();

    liveState = {
      ...liveState,
      caption: {
        text: "这枚胸针今天只有一枚",
        language: "zh",
        visible: true
      },
      translatedCaptions: [
        {
          language: "en" as const,
          text: "There is only one brooch available today."
        }
      ],
      productCard: {
        ...liveState.productCard!,
        visible: true
      },
      background: {
        mode: "solid" as const,
        value: "#ee4d2d",
        label: "Realtime generated background"
      }
    };

    await waitFor(() => expect(screen.getByText("Bamboo Cooling Tee")).toBeInTheDocument());
    expect(screen.getByText("这枚胸针今天只有一枚")).toBeInTheDocument();
    expect(screen.getByText("There is only one brooch available today.")).toBeInTheDocument();
    expect(screen.getByLabelText("LiveSeller livestream overlay")).toHaveClass("overlay-has-captions", "overlay-has-product", "overlay-bg-solid");
  });

  it("maps background presets to display classes without showing control chrome", () => {
    render(
      <App
        state={{
          ...validOverlayState,
          background: {
            mode: "kinetic",
            value: "kinetic",
            label: "Kinetic live background"
          }
        }}
      />
    );

    expect(screen.getByLabelText("LiveSeller livestream overlay")).toHaveClass("overlay-bg-kinetic");
    expect(screen.getByLabelText("Livestream display stage")).toHaveClass("overlay-stage");
    expect(screen.getByText("FLASH SALE")).toBeInTheDocument();
    expect(screen.queryByLabelText("Overlay runtime status")).not.toBeInTheDocument();
  });

  it("keeps long captions in caption containers without warning in the valid fixture", () => {
    render(<App state={validOverlayState} />);
    expect(validOverlayState.layoutWarnings).toEqual([]);
    expect(screen.getByLabelText("Live captions")).toHaveClass("caption-band");
  });

  it("hides the public product card while preserving overlay state context", () => {
    render(
      <App
        state={{
          ...validOverlayState,
          productCard: {
            ...validOverlayState.productCard!,
            visible: false
          }
        }}
      />
    );

    expect(screen.queryByText("Bamboo Cooling Tee")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Live promotion")).toBeInTheDocument();
    expect(screen.queryByLabelText("Current product overlay")).not.toBeInTheDocument();
    expect(screen.getByLabelText("LiveSeller livestream overlay")).not.toHaveClass("overlay-has-product");
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

    await waitFor(() => expect(screen.getByText("Travel Cable Pouch")).toBeInTheDocument());
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

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith(`http://runtime.test/api/overlay/${validLiveSessionSpec.sessionId}`));
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
      if (url.endsWith(`/api/overlay/${vintageJewelryLiveSessionSpec.sessionId}/product-card-visibility`)) {
        const body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          ...overlayState,
          productCard: {
            ...overlayState.productCard,
            visible: body.visible
          }
        }), {
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

    fireEvent.click(screen.getByText("Hide card"));
    await waitFor(() => expect(screen.getByText("Hidden on public overlay")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Show card"));
    await waitFor(() => expect(screen.getByText("Visible on public overlay")).toBeInTheDocument());

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

  it("renders seller-only live guidance from runtime actions, memory, and rolling summary", async () => {
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
      if (url.endsWith(`/api/live-sessions/${vintageJewelryLiveSessionSpec.sessionId}/memory`)) {
        return new Response(
          JSON.stringify({
            sessionMemory: {
              topQuestions: ["Can you confirm the blue stone material?"],
              productInterest: {
                [currentProduct.id]: 2
              },
              escalations: ["Discount needs Shopee-backed confirmation."],
              recommendations: ["Move to the cameo brooch after the blue brooch close-up."]
            },
            viewerMemory: [
              {
                viewerId: "seller-console-viewer",
                displayName: "Test Buyer",
                knownQuestions: ["Any discount for the brooch?"],
                productAffinity: {
                  [currentProduct.id]: 1
                },
                riskFlags: [],
                lastSeenAt: "2026-06-06T02:50:00.000Z"
              }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      if (url.endsWith(`/api/live-sessions/${vintageJewelryLiveSessionSpec.sessionId}/summary`)) {
        return new Response(
          JSON.stringify({
            eventCount: 4,
            publicReplies: 1,
            escalations: 1,
            approvalsRequested: 1,
            orders: 0,
            viewerPeak: 8,
            recommendations: ["Summarize material questions and voucher blockers after stream."]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      if (url.endsWith("/api/runtime/events")) {
        const event = JSON.parse(String(init?.body));
        const actions = event.payload.text.includes("discount")
          ? [
              {
                actionId: "action-approval-discount",
                type: "request_approval",
                risk: "medium",
                requiresApproval: true,
                reason: "Discount negotiation requires seller confirmation.",
                payload: {
                  kind: "request_approval",
                  prompt: "Confirm whether this voucher is Shopee-backed before posting.",
                  proposedPublicText: "Seller will confirm voucher eligibility."
                }
              }
            ]
          : [
              {
                actionId: "action-safe-price",
                type: "send_reply",
                risk: "low",
                requiresApproval: false,
                reason: "Low-risk factual price answer from ProductRecord.",
                payload: {
                  kind: "send_reply",
                  text: "The brooch is SGD 88.00.",
                  viewerId: "seller-console-viewer",
                  language: "en",
                  productId: currentProduct.id
                }
              }
            ];
        return new Response(
          JSON.stringify({
            overlayState,
            actions
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
    await waitFor(() => expect(screen.getByText("Can you confirm the blue stone material?")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "How much is the gold grape brooch?" }
    });
    fireEvent.click(screen.getByText("Send to runtime"));
    await waitFor(() => expect(screen.getByText("Say this")).toBeInTheDocument());
    expect(screen.getByText("The brooch is SGD 88.00.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Any discount for the brooch?" }
    });
    fireEvent.click(screen.getByText("Send to runtime"));
    await waitFor(() => expect(screen.getByText("Needs approval")).toBeInTheDocument());
    expect(screen.getByText("Confirm whether this voucher is Shopee-backed before posting.")).toBeInTheDocument();
    expect(screen.getByText("Summarize material questions and voucher blockers after stream.")).toBeInTheDocument();
  });

  it("drives public overlay state through realtime agent tools from the seller console", async () => {
    const currentProduct = vintageJewelryLiveSessionSpec.products[0]!;
    const secondProduct = vintageJewelryLiveSessionSpec.products[1]!;
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
    const toolCalls: unknown[] = [];
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
      if (url.endsWith(`/api/live-sessions/${vintageJewelryLiveSessionSpec.sessionId}/memory`)) {
        return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith(`/api/live-sessions/${vintageJewelryLiveSessionSpec.sessionId}/summary`)) {
        return new Response(JSON.stringify({ eventCount: 0 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/api/runtime/realtime/agent-session")) {
        return new Response(
          JSON.stringify({
            client_secret: { value: "ephemeral-test-secret" },
            agent: {
              name: "LiveSeller Realtime Copilot",
              toolExecutionEndpoint: "/api/runtime/realtime/tool-call"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.endsWith("/api/runtime/realtime/translation-session")) {
        return new Response(
          JSON.stringify({
            client_secret: { value: "ephemeral-translation-secret" },
            translation: {
              callsEndpoint: "https://api.openai.com/v1/realtime/translations/calls",
              overlayTool: "emit_realtime_translation"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.endsWith("/api/runtime/realtime/tool-call")) {
        const body = JSON.parse(String(init?.body));
        toolCalls.push(body);
        const nextProduct = body.name === "show_product_card" ? secondProduct : currentProduct;
        return new Response(
          JSON.stringify({
            status: "applied",
            tool: body.name,
            scriptSuggestion: body.name === "prompt_seller_script"
              ? {
                  productId: secondProduct.id,
                  title: secondProduct.title,
                  script: `Show ${secondProduct.title}. Mention SGD 88.00 and one piece available.`
                }
              : undefined,
            overlayState: {
              ...overlayState,
              currentProductId: nextProduct.id,
              productCard: {
                productId: nextProduct.id,
                title: nextProduct.title,
                price: nextProduct.price,
                currency: nextProduct.currency,
                stock: nextProduct.stock,
                imageUri: nextProduct.media.images[0]!.uri
              },
              background: body.name === "show_overlay_background"
                ? {
                    mode: "solid",
                    value: "#ee4d2d",
                    label: "AI generated live background"
                  }
                : overlayState.background
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
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
    expect(screen.getByLabelText("Public overlay source")).toHaveTextContent(
      `/display?runtimeOrigin=http%3A%2F%2Fruntime.test&sessionId=${vintageJewelryLiveSessionSpec.sessionId}&transparent=1&camera=0`
    );

    expect(screen.queryByText("Seller test console")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Start realtime translation"));
    await waitFor(() => expect(screen.getByText("Realtime translation ready")).toBeInTheDocument());

    fireEvent.click(screen.getAllByText("Show with AI")[1]!);
    await waitFor(() => expect(toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "show_product_card",
          arguments: { productId: secondProduct.id }
        })
      ])
    ));

    fireEvent.click(screen.getByText("Generate AI background"));
    fireEvent.click(screen.getAllByText("Seller script")[1]!);
    await waitFor(() => expect(toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "show_overlay_background" }),
        expect.objectContaining({ name: "prompt_seller_script" })
      ])
    ));
    expect(screen.getByText(`Show ${secondProduct.title}. Mention SGD 88.00 and one piece available.`)).toBeInTheDocument();
  });
});
