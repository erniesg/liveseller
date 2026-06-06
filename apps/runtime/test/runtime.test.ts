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
});
