import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  type LanguageCode,
  type RuntimeEvent,
  LiveActionSchema,
  SellerTimelineResponseSchema,
  ShopeeCreateProductCommandSchema,
  validSellerFreeFormReviewResponse,
  validProductReviewPlan,
  validLiveSessionSpec,
  vintageJewelryLiveSessionSpec
} from "@liveseller/contracts";
import {
  buildShopeeCreateProductCommands,
  buildShopeeStartLivestreamCommands,
  recordSellerReviewResponse,
  recordProductReviewDecision
} from "../src/approvals";
import {
  buildContextEnvelope,
  decideActions,
  routeRuntimeEvent
} from "../src/runtime";
import { createRuntimeSessionStore } from "../src/sessionStore";
import {
  createRealtimeClientSecret,
  createRealtimeAgentSession,
  loadRuntimeEnvFile,
  getRuntimeCameraCompositorStatus,
  createRuntimeServer,
  startOverlayStreamSmoke,
  startRuntimeCameraCompositor,
  stopRuntimeCameraCompositor
} from "../src/server";

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
  it("loads local .env values for server-only OpenAI runtime configuration", () => {
    const dir = mkdtempSync(join(tmpdir(), "liveseller-env-test-"));
    const previous = process.env.OPENAI_API_KEY;
    const previousModel = process.env.OPENAI_REALTIME_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_REALTIME_MODEL;
    try {
      writeFileSync(join(dir, ".env"), "OPENAI_API_KEY=env-test-key\nOPENAI_REALTIME_MODEL=gpt-realtime-2\n");
      const loaded = loadRuntimeEnvFile(dir);

      expect(loaded).toMatchObject({
        path: join(dir, ".env"),
        loadedKeys: expect.arrayContaining(["OPENAI_API_KEY", "OPENAI_REALTIME_MODEL"])
      });
      expect(process.env.OPENAI_API_KEY).toBe("env-test-key");
      expect(JSON.stringify(loaded)).not.toContain("env-test-key");
    } finally {
      if (previous) {
        process.env.OPENAI_API_KEY = previous;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
      if (previousModel) {
        process.env.OPENAI_REALTIME_MODEL = previousModel;
      } else {
        delete process.env.OPENAI_REALTIME_MODEL;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

  it("audits policy flags and approval requests for risky viewer messages", () => {
    const result = routeRuntimeEvent(
      viewerEvent("Can you give me extra discount cheaper best price?", "en"),
      validLiveSessionSpec
    );

    expect(result.actions.some((action) => action.type === "send_reply")).toBe(false);
    expect(result.actions.every((action) => action.requiresApproval)).toBe(true);
    expect(result.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "policy",
          actor: "runtime",
          reason: "Discount negotiation may create unauthorized pricing commitments."
        }),
        expect.objectContaining({
          kind: "approval",
          actor: "runtime",
          approval: expect.objectContaining({
            status: "pending",
            sessionId: validLiveSessionSpec.sessionId
          })
        })
      ])
    );
  });

  it("keeps realtime voice translation client secrets server-owned", async () => {
    const missing = await createRealtimeClientSecret({
      apiKey: "",
      fetchImpl: vi.fn() as unknown as typeof fetch
    });

    expect(missing).toMatchObject({
      status: 503,
      body: {
        error: "openai_api_key_missing"
      }
    });

    const requests: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ input, init });
      return new Response(
        JSON.stringify({
          client_secret: {
            value: "ephemeral-redacted-for-test"
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    });
    const session = await createRealtimeClientSecret({
      apiKey: "server-test-key",
      fetchImpl: fetchImpl as typeof fetch,
      model: "gpt-realtime",
      voice: "marin"
    });

    expect(session.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({ method: "POST" })
    );
    expect(requests[0]?.init?.headers).toMatchObject({
      authorization: "Bearer server-test-key"
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      session: {
        type: "realtime",
        model: "gpt-realtime",
        reasoning: {
          effort: "low"
        },
        audio: {
          output: {
            voice: "marin"
          }
        }
      }
    });
    expect(JSON.stringify(requests[0]?.init?.body)).not.toContain("server-test-key");
  });

  it("creates an OpenAI Realtime Agent session for seller prompts and voice translation", async () => {
    const requests: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ input, init });
      return new Response(
        JSON.stringify({
          client_secret: {
            value: "ephemeral-agent-secret"
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    });

    const session = await createRealtimeAgentSession({
      apiKey: "server-test-key",
      fetchImpl: fetchImpl as typeof fetch,
      sessionId: validLiveSessionSpec.sessionId,
      voice: "marin"
    });

    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({
      client_secret: {
        value: "ephemeral-agent-secret"
      },
      agent: {
        name: "LiveSeller Realtime Copilot",
        sessionId: validLiveSessionSpec.sessionId
      }
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(String(requests[0]?.init?.body));
    expect(body.session.model).toBe("gpt-realtime-2");
    expect(body.session.reasoning).toEqual({ effort: "low" });
    expect(body.session.instructions).toContain("RealtimeAgent");
    expect(body.session.instructions).toContain("translate host speech to English audio");
    expect(body.session.instructions).toContain("prompt the seller what to say next");
    expect(body.session.tools.map((tool: { name: string }) => tool.name)).toEqual(
      expect.arrayContaining(["show_overlay_background", "send_policy_checked_reply"])
    );
    expect(JSON.stringify(session)).not.toMatch(/server-test-key|sk-/i);
  });

  it("rejects realtime agent sessions when the server OpenAI key is missing", async () => {
    const session = await createRealtimeAgentSession({
      apiKey: "",
      sessionId: validLiveSessionSpec.sessionId,
      fetchImpl: vi.fn() as unknown as typeof fetch
    });

    expect(session).toMatchObject({
      status: 503,
      body: {
        error: "openai_api_key_missing"
      }
    });
  });

  it("serves product script suggestions for the seller-only UI", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime server TCP address");
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/live-sessions/${validLiveSessionSpec.sessionId}/script-suggestions`
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.suggestions[0]).toMatchObject({
        productId: validLiveSessionSpec.products[0]!.id,
        title: validLiveSessionSpec.products[0]!.title
      });
      expect(body.suggestions[0].script).toContain("SGD 19.90");
      expect(body.suggestions[0].script).toContain("42 left");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
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

  it("generates dry-run livestream setup commands only after every product is publishable", () => {
    const partiallyApproved = recordProductReviewDecision(validProductReviewPlan, {
      decisionId: "decision-prod-cooling-tee-approved-live-setup",
      productId: validProductReviewPlan.items[0]!.productId,
      status: "approved",
      decidedBy: "seller",
      decidedAt: "2026-06-06T02:35:00.000Z",
      reason: "Seller approved one product.",
      citations: validProductReviewPlan.items[0]!.product.evidence
    });

    expect(buildShopeeStartLivestreamCommands(partiallyApproved, validLiveSessionSpec)).toEqual([]);

    const readyPlan = validProductReviewPlan.items.reduce((plan, item, index) =>
      recordProductReviewDecision(plan, {
        decisionId: `decision-${item.productId}-approved-live-setup-${index}`,
        productId: item.productId,
        status: "approved",
        decidedBy: "seller",
        decidedAt: `2026-06-06T02:4${index}:00.000Z`,
        reason: "Seller approved product for livestream setup.",
        citations: item.product.evidence
      }), validProductReviewPlan);
    const commands = buildShopeeStartLivestreamCommands(
      readyPlan,
      validLiveSessionSpec,
      "2026-06-06T02:45:00.000Z"
    );

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      kind: "prepare_livestream",
      sessionId: validLiveSessionSpec.sessionId,
      safetyMode: "create_session_capture_credentials",
      payload: {
        productIds: validProductReviewPlan.items.map((item) => item.productId),
        streamCredentialHandling: "transient_capture_redacted_evidence",
        credentialEvidence: "redacted_presence_only",
        goLive: false
      }
    });
    expect(JSON.stringify(commands).toLowerCase()).not.toContain("streamkey");
    expect(JSON.stringify(commands).toLowerCase()).not.toContain("rtmp://");
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

  it("records livestream start lifecycle without RTMP secrets", () => {
    const store = createRuntimeSessionStore(validLiveSessionSpec);
    const result = store.route({
      eventId: "event-livestream-started",
      sessionId: validLiveSessionSpec.sessionId,
      timestamp: "2026-06-06T02:10:00.000Z",
      source: "extension",
      type: "stream_lifecycle",
      payload: {
        status: "started",
        reason: "Seller approved dry-run livestream setup; OBS/Shopee credentials remain manual."
      }
    });

    expect(result.auditEvents.map((event) => event.kind)).toEqual(expect.arrayContaining(["input", "context"]));
    expect(store.summary()).toMatchObject({
      status: "active",
      eventCount: 1
    });
    expect(store.summary().moments.map((moment) => moment.kind)).toContain("lifecycle");
    expect(JSON.stringify(store.snapshot()).toLowerCase()).not.toContain("streamkey");
    expect(JSON.stringify(store.snapshot()).toLowerCase()).not.toContain("rtmp://");
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

  it("updates the public overlay background through the runtime server", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime server TCP address");
    }

    try {
      const origin = `http://127.0.0.1:${address.port}`;
      const update = await fetch(`${origin}/api/overlay/${validLiveSessionSpec.sessionId}/background`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          background: {
            mode: "solid",
            value: "#0f766e",
            label: "Camera test teal"
          }
        })
      });
      const updated = await update.json();

      expect(update.status).toBe(200);
      expect(updated.background).toMatchObject({
        mode: "solid",
        value: "#0f766e",
        label: "Camera test teal"
      });

      const overlayResponse = await fetch(`${origin}/api/overlay/${validLiveSessionSpec.sessionId}`);
      const overlay = await overlayResponse.json();
      expect(overlay.background).toMatchObject({
        mode: "solid",
        value: "#0f766e"
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("tracks runtime camera compositor status and rejects a second publisher for the same stream key", async () => {
    const children: EventEmitter[] = [];
    const spawnImpl = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stderr: PassThrough;
        kill: ReturnType<typeof vi.fn>;
        killed: boolean;
      };
      child.stderr = new PassThrough();
      child.killed = false;
      child.kill = vi.fn(() => {
        child.killed = true;
        child.emit("close", 0);
        return true;
      });
      children.push(child);
      return child;
    }) as unknown as typeof import("node:child_process").spawn;

    const first = await startRuntimeCameraCompositor({
      rtmpUrl: "rtmp://test.example/live",
      rtmpKey: "secret-one",
      overlayUrl: "http://127.0.0.1:5180",
      sellerPreviewUrl: "http://127.0.0.1:8787/camera-compositor/preview",
      waitForCompletion: false,
      spawnImpl
    });

    expect(first.status).toBe("started_runtime_compositor_stream");
    expect(getRuntimeCameraCompositorStatus()).toMatchObject({
      state: "running",
      rtmpUrl: "present_redacted",
      rtmpKey: "present_redacted"
    });

    await expect(startRuntimeCameraCompositor({
      rtmpUrl: "rtmp://test.example/live",
      rtmpKey: "secret-one",
      overlayUrl: "http://127.0.0.1:5180",
      sellerPreviewUrl: "http://127.0.0.1:8787/camera-compositor/preview",
      waitForCompletion: false,
      spawnImpl
    })).rejects.toThrow("already running");
    expect(spawnImpl).toHaveBeenCalledTimes(1);

    const stopped = stopRuntimeCameraCompositor();
    expect(stopped).toMatchObject({ state: "stopped" });
    expect(children[0]).toMatchObject({ killed: true });
  });

  it("serves the vintage jewelry session for seller UI and overlay testing", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime server TCP address");
    }

    try {
      const origin = `http://127.0.0.1:${address.port}`;
      const specResponse = await fetch(`${origin}/api/live-sessions/${vintageJewelryLiveSessionSpec.sessionId}/spec`);
      const spec = await specResponse.json();
      expect(specResponse.status).toBe(200);
      expect(spec.sessionId).toBe(vintageJewelryLiveSessionSpec.sessionId);

      const productId = vintageJewelryLiveSessionSpec.products[0]!.id;
      const eventResponse = await fetch(`${origin}/api/runtime/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId: "event-vintage-console-product",
          sessionId: vintageJewelryLiveSessionSpec.sessionId,
          timestamp: "2026-06-06T02:40:00.000Z",
          source: "seller",
          type: "product_switch",
          payload: { productId }
        })
      });
      const eventBody = await eventResponse.json();
      expect(eventResponse.status).toBe(200);
      expect(eventBody.overlayState.currentProductId).toBe(productId);

      const overlayResponse = await fetch(`${origin}/api/overlay/${vintageJewelryLiveSessionSpec.sessionId}`);
      const overlay = await overlayResponse.json();
      expect(overlay.productCard.productId).toBe(productId);
      expect(overlay.productCard.imageUri).toContain("vintage-jewelry");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("serves a product review plan for the Chrome side panel", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime server TCP address");
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/prep/review-plan/${validProductReviewPlan.sessionId}`
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.reviewPlanId).toBe(validProductReviewPlan.reviewPlanId);
      expect(body.items).toHaveLength(validProductReviewPlan.items.length);
      expect(body.status).toBe("seller_review_required");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("sets CORS headers for local seller UI and overlay clients", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime server TCP address");
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/overlay/${validLiveSessionSpec.sessionId}`);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");

      const options = await fetch(`http://127.0.0.1:${address.port}/api/runtime/events`, {
        method: "OPTIONS"
      });
      expect(options.status).toBe(204);
      expect(options.headers.get("access-control-allow-methods")).toContain("POST");
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
        currentProductId: secondProduct.id,
        publicReplies: 1
      });
      expect(summary.eventCount).toBeGreaterThanOrEqual(3);
      expect(summary.moments.map((moment: { kind: string }) => moment.kind)).toEqual(
        expect.arrayContaining(["product_switch", "host_caption", "viewer_question"])
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("records seller timeline events for runtime routing and approval progress", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime server TCP address");
    }

    try {
      const origin = `http://127.0.0.1:${address.port}`;
      const event = viewerEvent("How much is the Bamboo Cooling Tee?", "en");
      const routed = await fetch(`${origin}/api/runtime/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event)
      });
      expect(routed.status).toBe(200);

      const timelineResponse = await fetch(
        `${origin}/api/seller-timeline/events?sessionId=${validLiveSessionSpec.sessionId}`
      );
      expect(timelineResponse.status).toBe(200);
      const timeline = SellerTimelineResponseSchema.parse(await timelineResponse.json());
      expect(timeline.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            service: "runtime",
            kind: "viewer_message",
            title: "Viewer message from Test Viewer",
            sourceEventId: event.eventId,
            redacted: false
          }),
          expect.objectContaining({
            service: "runtime",
            kind: "runtime_action",
            status: "success",
            approvalState: "none"
          })
        ])
      );
      expect(JSON.stringify(timeline)).not.toContain("sk-");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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
      expect(body.startLivestreamCommands).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("returns a redacted prepare-livestream command over HTTP for fully approved review plans", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime server TCP address");
    }

    try {
      const baseReadyPlan = validProductReviewPlan.items.slice(1).reduce((plan, item, index) =>
        recordProductReviewDecision(plan, {
          decisionId: `decision-${item.productId}-approved-http-live-${index}`,
          productId: item.productId,
          status: "approved",
          decidedBy: "seller",
          decidedAt: `2026-06-06T02:4${index}:00.000Z`,
          reason: "Seller approved product for HTTP livestream setup.",
          citations: item.product.evidence
        }), validProductReviewPlan);
      const finalItem = validProductReviewPlan.items[0]!;
      const finalDecision = {
        decisionId: "decision-prod-cooling-tee-approved-http-live-final",
        productId: finalItem.productId,
        status: "approved" as const,
        decidedBy: "seller" as const,
        decidedAt: "2026-06-06T02:45:00.000Z",
        reason: "Seller approved final product from extension side panel.",
        citations: finalItem.product.evidence
      };
      const response = await fetch(`http://127.0.0.1:${address.port}/api/prep/review-decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewPlan: baseReadyPlan,
          decision: finalDecision
        })
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.reviewPlan.status).toBe("ready_for_publish");
      expect(body.createProductCommands).toHaveLength(validProductReviewPlan.items.length);
      expect(body.startLivestreamCommands).toHaveLength(1);
      expect(body.startLivestreamCommands[0]).toMatchObject({
        kind: "prepare_livestream",
        sessionId: validLiveSessionSpec.sessionId,
        payload: {
          streamCredentialHandling: "transient_capture_redacted_evidence",
          credentialEvidence: "redacted_presence_only",
          goLive: false
        }
      });
      expect(JSON.stringify(body).toLowerCase()).not.toContain("streamkey");
      expect(JSON.stringify(body).toLowerCase()).not.toContain("rtmp://");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("starts the overlay stream smoke with redacted result evidence", async () => {
    const stderr = new PassThrough();
    const child = new EventEmitter() as ReturnType<typeof import("node:child_process").spawn>;
    Object.assign(child, { stderr });
    const spawnImpl = vi.fn((_command, _args, _options) => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    }) as unknown as typeof import("node:child_process").spawn;

    const result = await startOverlayStreamSmoke({
      rtmpUrl: "rtmp-url-value",
      rtmpKey: "stream-key-value",
      overlayUrl: "http://127.0.0.1:5180/?sessionId=live-seed-001",
      durationSeconds: 12,
      spawnImpl
    });

    expect(result).toEqual({
      status: "sent_overlay_stream_smoke",
      overlayUrl: "http://127.0.0.1:5180/?sessionId=live-seed-001",
      rtmpUrl: "present_redacted",
      rtmpKey: "present_redacted",
      durationSeconds: 12
    });
    expect(spawnImpl).toHaveBeenCalledWith(
      "npm",
      ["run", "live:stream:overlay-smoke"],
      expect.objectContaining({
        env: expect.objectContaining({
          SHOPEE_RTMP_URL: "rtmp-url-value",
          SHOPEE_RTMP_KEY: "stream-key-value",
          LIVESELLER_STREAM_SECONDS: "12"
        })
      })
    );
    expect(JSON.stringify(result)).not.toContain("stream-key-value");
  });

  it("starts the runtime camera compositor with server-owned RTMP credentials", async () => {
    const stderr = new PassThrough();
    const child = new EventEmitter() as ReturnType<typeof import("node:child_process").spawn>;
    Object.assign(child, { stderr });
    const spawnImpl = vi.fn((_command, _args, _options) => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    }) as unknown as typeof import("node:child_process").spawn;

    const result = await startRuntimeCameraCompositor({
      rtmpUrl: "rtmp-url-value",
      rtmpKey: "stream-key-value",
      overlayUrl: "http://127.0.0.1:5180/?sessionId=live-seed-001",
      sellerPreviewUrl: "http://127.0.0.1:8787/camera-compositor/preview",
      durationSeconds: 12,
      cameraInputKind: "avfoundation",
      cameraInput: "0",
      spawnImpl
    });

    expect(result).toEqual({
      status: "sent_runtime_compositor_stream",
      overlayUrl: "http://127.0.0.1:5180/?sessionId=live-seed-001",
      sellerPreviewUrl: "http://127.0.0.1:8787/camera-compositor/preview",
      cameraInputKind: "avfoundation",
      cameraInput: "present_redacted",
      rtmpUrl: "present_redacted",
      rtmpKey: "present_redacted",
      durationSeconds: 12,
      outputOrientation: "vertical",
      outputSize: "720x1280"
    });
    expect(spawnImpl).toHaveBeenCalledWith(
      "npm",
      ["run", "live:stream:runtime-compositor"],
      expect.objectContaining({
        env: expect.objectContaining({
          LIVESELLER_CAMERA_INPUT: "0",
          LIVESELLER_CAMERA_INPUT_KIND: "avfoundation",
          LIVESELLER_STREAM_HEIGHT: "1280",
          LIVESELLER_STREAM_ORIENTATION: "vertical",
          LIVESELLER_STREAM_WIDTH: "720",
          SHOPEE_RTMP_URL: "rtmp-url-value",
          SHOPEE_RTMP_KEY: "stream-key-value",
          LIVESELLER_STREAM_SECONDS: "12"
        })
      })
    );
    expect(JSON.stringify(result)).not.toContain("stream-key-value");
    expect(JSON.stringify(result)).not.toContain("rtmp-url-value");
  });

  it("defaults the runtime camera compositor source to Mac camera device 0", async () => {
    const stderr = new PassThrough();
    const child = new EventEmitter() as ReturnType<typeof import("node:child_process").spawn>;
    Object.assign(child, { stderr });
    const spawnImpl = vi.fn((_command, _args, _options) => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    }) as unknown as typeof import("node:child_process").spawn;

    const result = await startRuntimeCameraCompositor({
      rtmpUrl: "rtmp-url-value",
      rtmpKey: "stream-key-value",
      overlayUrl: "http://127.0.0.1:5180/?sessionId=live-seed-001",
      sellerPreviewUrl: "http://127.0.0.1:8787/camera-compositor/preview",
      spawnImpl
    });

    expect(result).toMatchObject({
      cameraInputKind: "avfoundation",
      cameraInput: "present_redacted"
    });
    expect(spawnImpl).toHaveBeenCalledWith(
      "npm",
      ["run", "live:stream:runtime-compositor"],
      expect.objectContaining({
        env: expect.objectContaining({
          LIVESELLER_CAMERA_INPUT: "0",
          LIVESELLER_CAMERA_INPUT_KIND: "avfoundation"
        })
      })
    );
    expect(JSON.stringify(result)).not.toContain("\"cameraInput\":\"0\"");
    expect(JSON.stringify(result)).not.toContain("stream-key-value");
  });

  it("returns immediately from the runtime camera compositor endpoint so the Shopee preview stays inspectable", async () => {
    const stderr = new PassThrough();
    const child = new EventEmitter() as ReturnType<typeof import("node:child_process").spawn>;
    Object.assign(child, { stderr });
    const spawnImpl = vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;

    const result = await startRuntimeCameraCompositor({
      rtmpUrl: "rtmp-url-value",
      rtmpKey: "stream-key-value",
      overlayUrl: "http://127.0.0.1:5180/?sessionId=live-seed-001",
      sellerPreviewUrl: "http://127.0.0.1:8787/camera-compositor/preview",
      durationSeconds: 600,
      spawnImpl,
      waitForCompletion: false
    });

    expect(result.status).toBe("started_runtime_compositor_stream");
    expect(result.durationSeconds).toBe(600);
    expect(JSON.stringify(result)).not.toContain("stream-key-value");
  });

  it("serves a human-inspectable local camera compositor preview page", async () => {
    const server = createRuntimeServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected runtime test server port");
    }

    try {
      const overlayUrl = "http://127.0.0.1:5180/?sessionId=live-seed-001";
      const response = await fetch(
        `http://127.0.0.1:${address.port}/camera-compositor/preview?overlayUrl=${encodeURIComponent(overlayUrl)}`
      );
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(html).toContain("Runtime camera + public overlay preview");
      expect(html).toContain("navigator.mediaDevices.getUserMedia");
      expect(html).toContain("data-layer=\"camera-primary\"");
      expect(html).toContain("loadedmetadata");
      expect(html).toContain("video.videoWidth");
      expect(html).toContain("prefix + \" \" + width + \"x\" + height + \" (live)\"");
      expect(html).toContain(overlayUrl.replaceAll("&", "&amp;"));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
