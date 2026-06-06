import {
  type LanguageCode,
  type RuntimeEvent,
  LiveActionSchema,
  ShopeeCreateProductCommandSchema,
  validSellerFreeFormReviewResponse,
  validProductReviewPlan,
  validLiveSessionSpec
} from "@liveseller/contracts";
import {
  buildShopeeCreateProductCommands,
  recordSellerReviewResponse,
  recordProductReviewDecision
} from "../src/approvals";
import {
  buildContextEnvelope,
  decideActions,
  routeRuntimeEvent
} from "../src/runtime";
import { createRuntimeSessionStore } from "../src/sessionStore";
import { createRuntimeServer } from "../src/server";

function viewerEvent(text: string, language?: LanguageCode): RuntimeEvent {
  return {
    eventId: `event-${text.slice(0, 12).replaceAll(/\W+/g, "-")}`,
    sessionId: validLiveSessionSpec.sessionId,
    timestamp: "2026-06-06T02:00:00.000Z",
    source: "viewer",
    type: "viewer_chat",
    payload: {
      viewerId: "viewer-test",
      viewerName: "Test Viewer",
      text,
      language: language as "en" | "zh" | "ms" | "ta" | undefined
    }
  };
}

describe("live brain policy runtime", () => {
  it("sends low-risk factual replies in English, Chinese, Malay, and Tamil", () => {
    const messages = [
      viewerEvent("How much is the Bamboo Cooling Tee?", "en"),
      viewerEvent("这件透气T恤多少钱？", "zh"),
      viewerEvent("berapa harga cable organizer?", "ms"),
      viewerEvent("இந்த tumbler விலை என்ன?", "ta")
    ];

    for (const event of messages) {
      const actions = decideActions(buildContextEnvelope(event, validLiveSessionSpec));
      const publicReply = actions.find((action) => action.type === "send_reply");
      expect(publicReply).toBeDefined();
      expect(publicReply?.risk).toBe("low");
      expect(publicReply?.requiresApproval).toBe(false);
      expect(() => LiveActionSchema.parse(publicReply)).not.toThrow();
    }
  });

  it("never auto-sends refund, fake, legal, fraud, or discount negotiation cases", () => {
    const riskyMessages = [
      "I want a refund right now",
      "This looks fake and counterfeit",
      "My lawyer will sue you",
      "This is a scam and fraud",
      "Give me extra discount cheaper best price"
    ];

    for (const text of riskyMessages) {
      const actions = decideActions(buildContextEnvelope(viewerEvent(text, "en"), validLiveSessionSpec));
      expect(actions.some((action) => action.type === "send_reply")).toBe(false);
      expect(actions.every((action) => action.requiresApproval)).toBe(true);
      expect(actions.map((action) => action.type)).toEqual(
        expect.arrayContaining([expect.stringMatching(/draft_reply|escalate|request_approval/)])
      );
    }
  });

  it("emits source and translated captions for Chinese host speech", () => {
    const event: RuntimeEvent = {
      eventId: "event-host-caption",
      sessionId: validLiveSessionSpec.sessionId,
      timestamp: "2026-06-06T02:00:00.000Z",
      source: "host",
      type: "host_transcript",
      payload: {
        text: "这件竹纤维T恤今天直播很适合新加坡天气",
        language: "zh",
        confidence: 0.95
      }
    };

    const result = routeRuntimeEvent(event, validLiveSessionSpec);
    expect(result.actions.map((action) => action.type)).toContain("update_caption");
    expect(result.actions.map((action) => action.type)).toContain("emit_translation");
    expect(result.overlayState.caption.language).toBe("zh");
    expect(result.overlayState.translatedCaptions.some((caption) => caption.language === "en")).toBe(true);
  });

  it("marks host flash-promo announcements as overlay-only unless Shopee-backed", () => {
    const event: RuntimeEvent = {
      eventId: "event-host-promo",
      sessionId: validLiveSessionSpec.sessionId,
      timestamp: "2026-06-06T02:00:00.000Z",
      source: "host",
      type: "host_transcript",
      payload: {
        text: "限时直播优惠，flash promo is live now",
        language: "zh",
        confidence: 0.95
      }
    };

    const result = routeRuntimeEvent(event, validLiveSessionSpec);
    const promoAction = result.actions.find((action) => action.type === "show_promo_banner");
    expect(promoAction?.payload).toMatchObject({
      kind: "show_promo_banner",
      backing: "overlay_only"
    });
  });

  it("records context, actions, tool results, and audit events for the fake vertical slice", () => {
    const result = routeRuntimeEvent(
      viewerEvent("How much stock for Bamboo Cooling Tee?", "en"),
      validLiveSessionSpec
    );

    expect(result.context.structuredFacts.canonicalFields).toContain("price");
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.toolResults.some((resultRow) => resultRow.adapter === "fake-extension")).toBe(true);
    expect(result.auditEvents.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["input", "context", "model_action", "tool_result"])
    );
  });

  it("generates create-product commands only after seller approval", () => {
    expect(buildShopeeCreateProductCommands(validProductReviewPlan)).toEqual([]);

    const approvedPlan = recordProductReviewDecision(validProductReviewPlan, {
      decisionId: "decision-prod-cooling-tee-approved",
      productId: "prod-cooling-tee",
      status: "approved",
      decidedBy: "seller",
      decidedAt: "2026-06-06T02:15:00.000Z",
      reason: "Seller approved structured listing draft.",
      citations: validProductReviewPlan.items[0]!.product.evidence
    });

    const commands = buildShopeeCreateProductCommands(approvedPlan);

    expect(commands).toHaveLength(1);
    expect(() => ShopeeCreateProductCommandSchema.parse(commands[0])).not.toThrow();
    expect(commands[0]).toMatchObject({
      kind: "create_product",
      approvalDecisionId: "decision-prod-cooling-tee-approved",
      approvalStatus: "approved",
      productId: "prod-cooling-tee"
    });
    expect(commands[0]?.payload.product.price).toBe(validProductReviewPlan.items[0]!.product.price);
    expect(commands[0]?.payload.product.stock).toBe(validProductReviewPlan.items[0]!.product.stock);
  });

  it("keeps rejected and pending product review items out of publish commands", () => {
    const rejectedPlan = recordProductReviewDecision(validProductReviewPlan, {
      decisionId: "decision-prod-cooling-tee-rejected",
      productId: "prod-cooling-tee",
      status: "rejected",
      decidedBy: "seller",
      decidedAt: "2026-06-06T02:15:00.000Z",
      reason: "Seller rejected the listing draft.",
      citations: validProductReviewPlan.items[0]!.product.evidence
    });

    expect(buildShopeeCreateProductCommands(rejectedPlan)).toEqual([]);
  });

  it("records free-form seller review feedback and proposes another option round", () => {
    const updatedPlan = recordSellerReviewResponse(validProductReviewPlan, {
      ...validSellerFreeFormReviewResponse,
      text: "Make the title shorter and show me another image prompt option.",
      interpretedIntent: "edit_request"
    });
    const firstItem = updatedPlan.items[0]!;

    expect(firstItem.reviewRounds[0]?.response?.text).toContain("title shorter");
    expect(firstItem.reviewRounds).toHaveLength(2);
    expect(firstItem.reviewRounds[1]).toMatchObject({
      freeFormResponseMode: "enabled",
      options: expect.arrayContaining([
        expect.objectContaining({ intent: "approve_as_is" }),
        expect.objectContaining({ intent: "request_edit" })
      ])
    });
    expect(buildShopeeCreateProductCommands(updatedPlan)).toEqual([]);
  });

  it("seeds product DB and updates viewer, session memory, and rolling summary", () => {
    const store = createRuntimeSessionStore(validLiveSessionSpec);
    const productId = validLiveSessionSpec.products[0]!.id;

    expect(store.getProduct(productId)?.title).toBe(validLiveSessionSpec.products[0]!.title);

    const result = store.route(viewerEvent("How much is the Bamboo Cooling Tee?", "en"));
    expect(result.context.sessionMemory.productInterest[productId]).toBe(0);

    const snapshot = store.snapshot();
    expect(snapshot.sessionMemory.topQuestions).toContain("How much is the Bamboo Cooling Tee?");
    expect(snapshot.sessionMemory.languageCounts.en).toBe(1);
    expect(snapshot.sessionMemory.productInterest[productId]).toBeGreaterThan(0);
    expect(snapshot.viewerMemory[0]).toMatchObject({
      viewerId: "viewer-test",
      displayName: "Test Viewer",
      preferredLanguage: "en"
    });
    expect(snapshot.viewerMemory[0]?.knownQuestions).toContain("How much is the Bamboo Cooling Tee?");
    expect(snapshot.auditEvents.length).toBeGreaterThan(0);

    const closed = store.route({
      eventId: "event-stream-closed",
      sessionId: validLiveSessionSpec.sessionId,
      timestamp: "2026-06-06T02:10:00.000Z",
      source: "runtime",
      type: "stream_lifecycle",
      payload: {
        status: "closed",
        reason: "demo complete"
      }
    });

    expect(closed.rollingSummary).toMatchObject({
      sessionId: validLiveSessionSpec.sessionId,
      status: "closed",
      eventCount: 2
    });
    expect(store.summary().status).toBe("closed");
  });

  it("keeps a stateful overlay snapshot across realtime session events", () => {
    const store = createRuntimeSessionStore(validLiveSessionSpec);
    const secondProductId = validLiveSessionSpec.products[1]!.id;

    store.route({
      eventId: "event-product-switch",
      sessionId: validLiveSessionSpec.sessionId,
      timestamp: "2026-06-06T02:01:00.000Z",
      source: "seller",
      type: "product_switch",
      payload: {
        productId: secondProductId
      }
    });
    store.route({
      eventId: "event-host-caption-stateful",
      sessionId: validLiveSessionSpec.sessionId,
      timestamp: "2026-06-06T02:02:00.000Z",
      source: "host",
      type: "host_transcript",
      payload: {
        text: "这款收纳包适合旅行用",
        language: "zh",
        confidence: 0.95
      }
    });

    const overlay = store.overlay();
    expect(overlay.currentProductId).toBe(secondProductId);
    expect(overlay.productCard?.title).toBe(validLiveSessionSpec.products[1]!.title);
    expect(overlay.caption).toMatchObject({
      text: "这款收纳包适合旅行用",
      language: "zh",
      visible: true
    });
    expect(overlay.translatedCaptions.some((caption) => caption.language === "en")).toBe(true);
  });

  it("serves the current overlay snapshot over HTTP", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime server TCP address");
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/overlay/${validLiveSessionSpec.sessionId}`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.sessionId).toBe(validLiveSessionSpec.sessionId);
      expect(body.productCard.productId).toBe(validLiveSessionSpec.products[0]!.id);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("routes livestream tab events over HTTP into product context, viewer memory, overlay, and audit", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime server TCP address");
    }

    const origin = `http://127.0.0.1:${address.port}`;
    const secondProduct = validLiveSessionSpec.products[1]!;

    async function postEvent(event: RuntimeEvent) {
      const response = await fetch(`${origin}/api/runtime/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event)
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      return body;
    }

    try {
      await postEvent({
        eventId: "event-http-product-switch",
        sessionId: validLiveSessionSpec.sessionId,
        timestamp: "2026-06-06T02:20:00.000Z",
        source: "seller",
        type: "product_switch",
        payload: {
          productId: secondProduct.id
        }
      });
      await postEvent({
        eventId: "event-http-video-transcript",
        sessionId: validLiveSessionSpec.sessionId,
        timestamp: "2026-06-06T02:21:00.000Z",
        source: "host",
        type: "host_transcript",
        payload: {
          text: "这款收纳包适合旅行用，线材和耳机都可以放",
          language: "zh",
          confidence: 0.96
        }
      });
      const viewerResult = await postEvent({
        eventId: "event-http-viewer-memory",
        sessionId: validLiveSessionSpec.sessionId,
        timestamp: "2026-06-06T02:22:00.000Z",
        source: "viewer",
        type: "viewer_chat",
        payload: {
          viewerId: "viewer-live-ctx",
          viewerName: "Live Buyer",
          text: "How much stock for travel pouch?",
          language: "en"
        }
      });

      expect(viewerResult.context.currentProductId).toBe(secondProduct.id);
      expect(viewerResult.context.structuredFacts).toMatchObject({
        productIds: [secondProduct.id],
        canonicalFields: expect.arrayContaining(["price", "stock", "sku", "variants"])
      });
      expect(viewerResult.actions.some((action: { type: string }) => action.type === "send_reply")).toBe(true);
      expect(viewerResult.actions.every((action: { requiresApproval: boolean }) => !action.requiresApproval)).toBe(true);

      const [memoryResponse, overlayResponse, auditResponse, summaryResponse] = await Promise.all([
        fetch(`${origin}/api/live-sessions/${validLiveSessionSpec.sessionId}/memory`),
        fetch(`${origin}/api/overlay/${validLiveSessionSpec.sessionId}`),
        fetch(`${origin}/api/audit/${validLiveSessionSpec.sessionId}`),
        fetch(`${origin}/api/live-sessions/${validLiveSessionSpec.sessionId}/summary`)
      ]);
      const memory = await memoryResponse.json();
      const overlay = await overlayResponse.json();
      const audit = await auditResponse.json();
      const summary = await summaryResponse.json();

      expect(memory.currentProductId).toBe(secondProduct.id);
      expect(memory.sessionMemory.productInterest[secondProduct.id]).toBeGreaterThan(0);
      expect(memory.viewerMemory[0]).toMatchObject({
        viewerId: "viewer-live-ctx",
        displayName: "Live Buyer",
        preferredLanguage: "en",
        productAffinity: {
          [secondProduct.id]: 1
        }
      });
      expect(overlay.currentProductId).toBe(secondProduct.id);
      expect(overlay.productCard).toMatchObject({
        productId: secondProduct.id,
        title: secondProduct.title,
        stock: secondProduct.stock
      });
      expect(overlay.caption).toMatchObject({
        text: "这款收纳包适合旅行用，线材和耳机都可以放",
        language: "zh",
        visible: true
      });
      expect(audit.map((event: { kind: string }) => event.kind)).toEqual(
        expect.arrayContaining(["input", "context", "model_action", "tool_result"])
      );
      expect(summary).toMatchObject({
        eventCount: 3,
        currentProductId: secondProduct.id,
        publicReplies: 1
      });
      expect(summary.moments.map((moment: { kind: string }) => moment.kind)).toEqual(
        expect.arrayContaining(["product_switch", "host_caption", "viewer_question"])
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("rejects runtime events from the wrong live session before mutating state", async () => {
    const store = createRuntimeSessionStore(validLiveSessionSpec);

    expect(() =>
      store.route({
        eventId: "event-wrong-session",
        sessionId: "other-live-session",
        timestamp: "2026-06-06T02:20:00.000Z",
        source: "viewer",
        type: "viewer_chat",
        payload: {
          viewerId: "viewer-wrong-session",
          viewerName: "Wrong Session",
          text: "How much is it?",
          language: "en"
        }
      })
    ).toThrow("does not match");

    expect(store.snapshot().auditEvents).toHaveLength(0);
    expect(store.snapshot().viewerMemory).toHaveLength(0);
  });

  it("rejects unstructured product and promo runtime events before mutating state", () => {
    const store = createRuntimeSessionStore(validLiveSessionSpec);

    expect(() =>
      store.route({
        eventId: "event-unknown-product",
        sessionId: validLiveSessionSpec.sessionId,
        timestamp: "2026-06-06T02:23:00.000Z",
        source: "seller",
        type: "product_switch",
        payload: {
          productId: "prod-unstructured"
        }
      })
    ).toThrow("unknown productId");

    expect(() =>
      store.route({
        eventId: "event-unknown-promo",
        sessionId: validLiveSessionSpec.sessionId,
        timestamp: "2026-06-06T02:24:00.000Z",
        source: "seller",
        type: "promo_update",
        payload: {
          promoId: "promo-unstructured",
          remainingQuantity: 12
        }
      })
    ).toThrow("unknown promoId");

    expect(store.snapshot().currentProductId).toBe(validLiveSessionSpec.products[0]!.id);
    expect(store.snapshot().currentPromoId).toBe(validLiveSessionSpec.promos[0]!.id);
    expect(store.snapshot().auditEvents).toHaveLength(0);
  });

  it("finalizes prep review decisions over HTTP and returns create-product commands", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime server TCP address");
    }

    try {
      const decision = {
        decisionId: "decision-prod-cooling-tee-approved-http",
        productId: "prod-cooling-tee",
        status: "approved" as const,
        decidedBy: "seller" as const,
        decidedAt: "2026-06-06T02:35:00.000Z",
        reason: "Seller approved from extension side panel.",
        citations: validProductReviewPlan.items[0]!.product.evidence
      };
      const response = await fetch(`http://127.0.0.1:${address.port}/api/prep/review-decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewPlan: validProductReviewPlan,
          decision
        })
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.reviewPlan.status).toBe("partially_approved");
      expect(body.createProductCommands).toHaveLength(1);
      expect(body.createProductCommands[0]).toMatchObject({
        kind: "create_product",
        productId: "prod-cooling-tee",
        approvalDecisionId: "decision-prod-cooling-tee-approved-http"
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
