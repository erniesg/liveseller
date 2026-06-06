import {
  type LanguageCode,
  type RuntimeEvent,
  LiveActionSchema,
  SessionMemorySchema,
  validLiveSessionSpec
} from "@liveseller/contracts";
import {
  buildContextEnvelope,
  decideActions,
  routeRuntimeEvent
} from "../src/runtime";
import { buildSessionMemoryFromAudit } from "../src/memory";
import { summarizeStream } from "../src/postStream";

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

  it("derives contract-valid session memory from safe viewer questions and record-memory actions", () => {
    const events = [
      viewerEvent("How much is the Bamboo Cooling Tee?", "en"),
      viewerEvent("berapa harga cable organizer?", "ms")
    ];
    const auditEvents = events.flatMap((event) =>
      routeRuntimeEvent(event, validLiveSessionSpec).auditEvents
    );

    const memory = buildSessionMemoryFromAudit(validLiveSessionSpec, auditEvents);

    expect(() => SessionMemorySchema.parse(memory)).not.toThrow();
    expect(memory.languageCounts.en).toBeGreaterThan(0);
    expect(memory.languageCounts.ms).toBeGreaterThan(0);
    expect(memory.productInterest["prod-cooling-tee"]).toBeGreaterThan(0);
    expect(memory.productInterest["prod-cable-pouch"]).toBeGreaterThan(0);
    expect(memory.topQuestions).toEqual(
      expect.arrayContaining([
        "How much is the Bamboo Cooling Tee?",
        "Asked about Bamboo Cooling Tee"
      ])
    );
  });

  it("turns risky cases into post-stream approval recommendations", () => {
    const auditEvents = [
      routeRuntimeEvent(viewerEvent("This looks fake and counterfeit", "en"), validLiveSessionSpec),
      routeRuntimeEvent(viewerEvent("Give me extra discount cheaper best price", "en"), validLiveSessionSpec)
    ].flatMap((result) => result.auditEvents);

    const summary = summarizeStream(validLiveSessionSpec, auditEvents);

    expect(summary.escalations).toBeGreaterThan(0);
    expect(summary.approvalsRequested).toBeGreaterThan(0);
    expect(summary.sessionMemory.escalations.length).toBeGreaterThan(0);
    expect(summary.recommendations).toContain(
      "Keep refund, fake-product, legal, fraud, and discount-negotiation replies behind seller approval."
    );
  });

  it("recommends the most-interested product instead of always using the first catalog item", () => {
    const auditEvents = [
      viewerEvent("How much is the Travel Cable Pouch?", "en"),
      viewerEvent("Is the cable organizer in stock?", "en")
    ].flatMap((event) => routeRuntimeEvent(event, validLiveSessionSpec).auditEvents);

    const summary = summarizeStream(validLiveSessionSpec, auditEvents);

    expect(summary.recommendations[0]).toContain("Travel Cable Pouch");
  });
});
