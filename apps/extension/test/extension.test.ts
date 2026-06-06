// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validAuditEvent,
  validLiveAction,
  validLiveSessionSpec,
  validProductReviewPlan,
  validShopeeCreateProductCommand,
  validShopeeStartLivestreamCommand
} from "@liveseller/contracts";
import {
  executeSellerCommand,
  executeConfirmedShopeeGoLive,
  executeQueuedShopeeCreateProductCommand,
  executeQueuedSellerReply,
  executeShopeeCreateProductCommand,
  executeShopeeStartLivestreamCommand
} from "../src/commandExecutor";
import {
  buildProductReviewDecision,
  handleProductReviewDecision,
  extractViewerMessage,
  handleReceiveNormalUserMessage,
  installReceiveNormalUserMessageHook,
  renderCodexOperatorEvents,
  renderProductReviewPlan,
  renderSellerUiPolicy,
  toViewerChatEvent
} from "../src/contentScript";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Shopee extension command safety", () => {
  it("does not overwrite seller typing when drafting", () => {
    const draftAction = {
      ...validLiveAction,
      actionId: "action-draft",
      type: "draft_reply" as const,
      risk: "medium" as const,
      requiresApproval: true,
      payload: {
        kind: "draft_reply" as const,
        viewerId: "viewer-001",
        text: "Seller will review this privately.",
        language: "en" as const
      }
    };

    const result = executeSellerCommand(draftAction, {
      value: "seller is typing",
      isSellerTyping: true
    });

    expect(result.toolResult.status).toBe("skipped");
    expect(result.nextComposerValue).toBe("seller is typing");
    expect(result.publicSend).toBe(false);
  });

  it("sends only low-risk public replies with no approval required", () => {
    const result = executeSellerCommand(validLiveAction, {
      value: "",
      isSellerTyping: false
    });

    expect(result.toolResult.status).toBe("applied");
    expect(result.publicSend).toBe(true);
  });

  it("executes create-product commands only when backed by approved review state", () => {
    const approved = executeShopeeCreateProductCommand(validShopeeCreateProductCommand);

    expect(approved.toolResult.status).toBe("applied");
    expect(approved.command).toBeDefined();
    expect(approved.command?.kind).toBe("create_product");
    expect(approved.command?.payload.product.price).toBe(validShopeeCreateProductCommand.payload.product.price);

    const pending = executeShopeeCreateProductCommand({
      ...validShopeeCreateProductCommand,
      approvalStatus: "pending"
    });

    expect(pending.toolResult.status).toBe("rejected");
    expect(pending.command).toBeUndefined();
  });

  it("fills authenticated Shopee product form fields from approved create-product commands", () => {
    document.body.innerHTML = `
      <input placeholder="Brand Name + Product Type + Key Features (Materials, Colors, Size, Model)" />
      <textarea name="description"></textarea>
      <input name="price" />
      <input name="stock" />
      <input name="sku" />
      <button type="button">Save and Publish</button>
    `;

    const result = executeQueuedShopeeCreateProductCommand(validShopeeCreateProductCommand, document);

    expect(result.toolResult.status).toBe("applied");
    expect((document.querySelector("input[placeholder*='Brand Name']") as HTMLInputElement).value)
      .toBe(validShopeeCreateProductCommand.payload.product.title);
    expect((document.querySelector("textarea[name='description']") as HTMLTextAreaElement).value)
      .toBe(validShopeeCreateProductCommand.payload.product.description);
    expect((document.querySelector("input[name='price']") as HTMLInputElement).value)
      .toBe(String(validShopeeCreateProductCommand.payload.product.price));
    expect((document.querySelector("input[name='stock']") as HTMLInputElement).value)
      .toBe(String(validShopeeCreateProductCommand.payload.product.stock));
    expect(result.submitted).toBe(false);
  });

  it("submits Shopee product forms only after explicit seller confirmation", () => {
    let clicked = 0;
    document.body.innerHTML = `
      <input placeholder="Brand Name + Product Type + Key Features (Materials, Colors, Size, Model)" />
      <textarea name="description"></textarea>
      <input name="price" />
      <input name="stock" />
      <input name="sku" />
      <button type="button">Save and Publish</button>
    `;
    document.querySelector("button")?.addEventListener("click", () => {
      clicked += 1;
    });

    const fillOnly = executeQueuedShopeeCreateProductCommand(validShopeeCreateProductCommand, document);
    expect(fillOnly.toolResult.status).toBe("applied");
    expect(fillOnly.submitted).toBe(false);
    expect(clicked).toBe(0);

    const submitted = executeQueuedShopeeCreateProductCommand(validShopeeCreateProductCommand, document, {
      submit: true
    });
    expect(submitted.toolResult.status).toBe("applied");
    expect(submitted.submitted).toBe(true);
    expect(clicked).toBe(1);
  });

  it("clicks Go Live only through explicit confirmed livestream execution", () => {
    let clicked = 0;
    document.body.innerHTML = '<button type="button">Go Live</button>';
    document.querySelector("button")?.addEventListener("click", () => {
      clicked += 1;
    });

    const result = executeConfirmedShopeeGoLive(document);

    expect(result.toolResult.status).toBe("applied");
    expect(result.goLivePressed).toBe(true);
    expect(clicked).toBe(1);
    expect(JSON.stringify(result).toLowerCase()).not.toContain("rtmp://");
  });

  it("queues low-risk replies into the Shopee composer without overwriting seller typing", () => {
    document.body.innerHTML = `
      <textarea data-liveseller-composer></textarea>
      <button data-liveseller-send>Send</button>
    `;

    const applied = executeQueuedSellerReply(validLiveAction, document);

    expect(applied.toolResult.status).toBe("applied");
    expect((document.querySelector("[data-liveseller-composer]") as HTMLTextAreaElement).value)
      .toBe(validLiveAction.payload.kind === "send_reply" ? validLiveAction.payload.text : "");
    expect(applied.publicSend).toBe(true);

    const composer = document.querySelector("[data-liveseller-composer]") as HTMLTextAreaElement;
    composer.value = "seller is typing";
    const skipped = executeQueuedSellerReply(validLiveAction, document);
    expect(skipped.toolResult.status).toBe("skipped");
  });

  it("prepares Shopee livestream creation with redacted stream credential evidence", () => {
    const prepared = executeShopeeStartLivestreamCommand(validShopeeStartLivestreamCommand);

    expect(prepared.toolResult.status).toBe("applied");
    expect(prepared.command?.safetyMode).toBe("create_session_capture_credentials");
    expect(prepared.command?.payload.shopeeSetupSteps).toContain("capture_stream_credentials");
    expect(prepared.command?.payload.goLive).toBe(false);
    expect(prepared.setupEvidence).toMatchObject({
      liveSessionCreated: true,
      credentialEvidence: {
        serverUrl: "present_redacted",
        secretToken: "present_redacted"
      },
      publicOverlayReady: true,
      goLivePressed: false
    });
    expect(JSON.stringify(prepared).toLowerCase()).not.toContain("streamkey");
    expect(JSON.stringify(prepared).toLowerCase()).not.toContain("rtmp://");

    const withSecret = executeShopeeStartLivestreamCommand({
      ...validShopeeStartLivestreamCommand,
      payload: {
        ...validShopeeStartLivestreamCommand.payload,
        streamKey: "raw-secret-key"
      }
    });
    expect(withSecret.toolResult.status).toBe("rejected");
    expect(withSecret.command).toBeUndefined();
  });

  it("captures viewer messages from audited DOM rows", () => {
    const row = document.createElement("div");
    row.setAttribute("data-viewer-id", "viewer-real");
    row.setAttribute("data-viewer-name", "Real Buyer");
    row.textContent = "How much is the tumbler?";

    const message = extractViewerMessage(row);
    expect(message).toEqual({
      viewerId: "viewer-real",
      viewerName: "Real Buyer",
      text: "How much is the tumbler?"
    });

    const event = toViewerChatEvent(message!, "live-seed-001", "2026-06-06T02:00:00.000Z");
    expect(event.type).toBe("viewer_chat");
    if (event.type !== "viewer_chat") {
      throw new Error("Expected viewer_chat event");
    }
    expect(event.payload.text).toContain("tumbler");
  });

  it("hooks receiveNormalUserMessage without blocking the Shopee page handler", () => {
    const originalCalls: unknown[] = [];
    const capturedPayloads: unknown[] = [];
    const page = {
      receiveNormalUserMessage(payload: unknown) {
        originalCalls.push(payload);
        return "shopee-result";
      }
    };

    const uninstall = installReceiveNormalUserMessageHook(page, (payload) => {
      capturedPayloads.push(payload);
    });

    const payload = { uid: "viewer-real", nickname: "Real Buyer", content: "How much?" };
    expect(page.receiveNormalUserMessage(payload)).toBe("shopee-result");
    expect(originalCalls).toEqual([payload]);
    expect(capturedPayloads).toEqual([payload]);

    uninstall();
    page.receiveNormalUserMessage(payload);
    expect(capturedPayloads).toEqual([payload]);
  });

  it("posts Shopee viewer messages to runtime and renders returned action evidence", async () => {
    document.body.innerHTML = '<section id="review"></section>';
    const requests: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          actions: [validLiveAction],
          toolResults: [],
          auditEvents: [validAuditEvent]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    });

    const result = await handleReceiveNormalUserMessage(
      {
        uid: "viewer-real",
        nickname: "Real Buyer",
        content: "How much is the Bamboo Cooling Tee?"
      },
      {
        sessionId: validLiveSessionSpec.sessionId,
        timestamp: "2026-06-06T02:00:00.000Z",
        fetchImpl,
        renderTarget: document.getElementById("review")!,
        composer: {
          value: "",
          isSellerTyping: false
        }
      }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/runtime/events",
      expect.objectContaining({ method: "POST" })
    );
    expect(requests[0]).toMatchObject({
      sessionId: validLiveSessionSpec.sessionId,
      source: "viewer",
      type: "viewer_chat",
      payload: {
        viewerId: "viewer-real",
        viewerName: "Real Buyer",
        text: "How much is the Bamboo Cooling Tee?"
      }
    });
    expect(result.executedCommands).toHaveLength(1);
    expect(result.executedCommands[0]?.publicSend).toBe(true);
    expect(document.querySelector("[data-liveseller-action-id='action-send-price']")?.textContent)
      .toContain("Low-risk factual price answer from ProductRecord.");
  });

  it("renders seller UI policy for product identity review", () => {
    document.body.innerHTML = '<section id="policy"></section>';

    renderSellerUiPolicy(document.getElementById("policy")!, {
      sessionId: "live-custom-material-001",
      status: "seller_review_required",
      products: [
        {
          productId: "prod-custom-camera-strap",
          title: "Custom Camera Strap",
          sku: "LS-CUSTOM-STRAP-001",
          priceLabel: "SGD 19.90",
          stockLabel: "42 in structured stock",
          imageCount: 2,
          missingFields: ["shopeeProductId"],
          reviewRequired: true
        }
      ],
      photoEnhancement: [
        {
          productId: "prod-custom-camera-strap",
          model: "gpt-image-2",
          sourceImageCount: 2,
          promptCount: 3,
          requiresApproval: true
        }
      ],
      publicAutomation: {
        autoSend: "low_risk_structured_only",
        approvalRequired: ["refund", "legal", "discount"],
        blockedAutoSend: ["fake-product accusation"]
      },
      renderHints: {
        sidePanelSectionId: "liveseller-prep-review",
        productAttribute: "data-liveseller-product-id",
        actionAttribute: "data-liveseller-action-id"
      }
    });

    const product = document.querySelector("[data-liveseller-product-id='prod-custom-camera-strap']");
    expect(product?.textContent).toContain("Custom Camera Strap");
    expect(product?.textContent).toContain("2 images");
    expect(product?.textContent).toContain("shopeeProductId");
    expect(document.querySelector("[data-liveseller-policy-status]")?.textContent).toContain(
      "seller_review_required"
    );
  });

  it("renders Codex operator app-server events without model secrets", () => {
    document.body.innerHTML = '<section id="operator"></section>';

    renderCodexOperatorEvents(document.getElementById("operator")!, {
      threadId: "thread-review-001",
      events: [
        {
          type: "session_started",
          message: "Codex app-server review session started.",
          timestamp: "2026-06-06T04:30:00.000Z"
        },
        {
          type: "tool_call_received",
          message: "Codex requested liveseller_record_seller_review_response.",
          timestamp: "2026-06-06T04:30:01.000Z",
          tool: "liveseller_record_seller_review_response",
          callId: "call-record-response-001"
        },
        {
          type: "tool_result_sent",
          message: "LiveSeller returned a validated review-plan update.",
          timestamp: "2026-06-06T04:30:02.000Z",
          tool: "liveseller_record_seller_review_response",
          callId: "call-record-response-001"
        }
      ]
    });

    const operator = document.querySelector("[data-liveseller-codex-operator='thread-review-001']");
    expect(operator?.textContent).toContain("Codex app-server");
    expect(operator?.textContent).toContain("liveseller_record_seller_review_response");
    expect(operator?.textContent).not.toMatch(/OPENAI|sk-/i);
    expect(document.querySelectorAll("[data-liveseller-codex-event]")).toHaveLength(3);
  });

  it("renders generated prep outputs and validated approval decisions", () => {
    document.body.innerHTML = '<section id="plan"></section>';
    const productId = validProductReviewPlan.items[0]!.productId;
    const taskId = validProductReviewPlan.generationTasks.find((task) =>
      task.productId === productId && task.taskType === "image_edit"
    )!.taskId;
    const plan = {
      ...validProductReviewPlan,
      generationTasks: validProductReviewPlan.generationTasks.map((task) =>
        task.taskId === taskId
          ? {
              ...task,
              status: "completed" as const,
              outputRefs: ["generated/clean-background.png"],
              completedAt: "2026-06-06T02:20:00.000Z"
            }
          : task
      )
    };

    renderProductReviewPlan(document.getElementById("plan")!, plan, {
      artifactBaseUri: "file:///tmp/liveseller-run",
      decidedAt: "2026-06-06T02:30:00.000Z"
    });

    const generatedImage = document.querySelector("[data-liveseller-generated-ref='generated/clean-background.png']");
    expect(generatedImage?.getAttribute("src")).toBe("file:///tmp/liveseller-run/generated/clean-background.png");
    expect(document.querySelector("[data-liveseller-image-prompts]")?.textContent).toContain("Create a square");

    const approve = document.querySelector("[data-liveseller-action-id^='approve-']");
    const decision = JSON.parse(approve?.getAttribute("data-liveseller-product-decision") ?? "{}");
    expect(decision).toMatchObject({
      productId,
      status: "approved",
      decidedBy: "seller",
      decidedAt: "2026-06-06T02:30:00.000Z"
    });
    expect(buildProductReviewDecision(validProductReviewPlan, productId, "reject", "2026-06-06T02:31:00.000Z"))
      .toMatchObject({
        productId,
        status: "rejected"
      });
  });

  it("posts seller approval decisions and executes returned create-product commands", async () => {
    const productId = validProductReviewPlan.items[0]!.productId;
    const decision = buildProductReviewDecision(
      validProductReviewPlan,
      productId,
      "approve",
      "2026-06-06T02:30:00.000Z"
    );
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.decision).toMatchObject({
        productId,
        status: "approved"
      });
      return new Response(
        JSON.stringify({
          reviewPlan: {
            ...validProductReviewPlan,
            status: "ready_for_publish",
            items: validProductReviewPlan.items.map((item) =>
              item.productId === productId ? { ...item, decision } : item
            )
          },
          createProductCommands: [validShopeeCreateProductCommand],
          startLivestreamCommands: [validShopeeStartLivestreamCommand]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    });

    const result = await handleProductReviewDecision(validProductReviewPlan, decision, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/prep/review-decisions",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.runtimeResponse.createProductCommands).toHaveLength(1);
    expect(result.executedProductCommands[0]?.toolResult.status).toBe("applied");
    expect(result.executedProductCommands[0]?.command?.kind).toBe("create_product");
    expect(result.runtimeResponse.startLivestreamCommands).toHaveLength(1);
    expect(result.executedLivestreamCommands[0]?.toolResult.status).toBe("applied");
    expect(result.executedLivestreamCommands[0]?.command?.kind).toBe("prepare_livestream");
    expect(result.executedLivestreamCommands[0]?.setupEvidence).toMatchObject({
      liveSessionCreated: true,
      credentialEvidence: {
        serverUrl: "present_redacted",
        secretToken: "present_redacted"
      },
      publicOverlayReady: true,
      goLivePressed: false
    });
    expect(JSON.stringify(result).toLowerCase()).not.toContain("streamkey");
    expect(JSON.stringify(result).toLowerCase()).not.toContain("rtmp://");
  });

  it("keeps OpenAI keys out of extension manifest", () => {
    const manifest = readFileSync(join(repoRoot, "apps/extension/manifest.json"), "utf8");
    expect(manifest).not.toMatch(/OPENAI|sk-/i);
    expect(manifest).toContain('"sidePanel"');
    expect(manifest).toContain('"action"');
    expect(manifest).toContain('"service_worker": "background.js"');
    expect(manifest).toContain('"contentScript.js"');
  });

  it("ships a side-panel mount point for Codex operator events", () => {
    const sidePanel = readFileSync(join(repoRoot, "apps/extension/sidepanel.html"), "utf8");
    const sidePanelScript = readFileSync(join(repoRoot, "apps/extension/sidepanel.js"), "utf8");
    const background = readFileSync(join(repoRoot, "apps/extension/background.js"), "utf8");
    const contentScript = readFileSync(join(repoRoot, "apps/extension/contentScript.js"), "utf8");

    expect(sidePanel).toContain('id="liveseller-codex-operator"');
    expect(sidePanel).toContain("Codex operator");
    expect(sidePanel).toContain('id="toggle-settings"');
    expect(sidePanel).toContain('id="settings-panel"');
    expect(sidePanel).toContain("Settings");
    expect(sidePanel).toContain('id="liveseller-material-intake"');
    expect(sidePanel).toContain("Drag product images here");
    expect(sidePanel).toContain("Generate product plan");
    expect(sidePanel).toContain("Activity");
    expect(sidePanel).toContain("Rolling live log");
    expect(sidePanel).toContain('id="product-event-log"');
    expect(sidePanel).toContain('id="product-event-count"');
    expect(sidePanel).toContain('id="approve-all-sticky"');
    expect(sidePanel).toContain("Approve all and create products");
    expect(sidePanel).not.toContain('id="approve-all"');
    expect(sidePanel).toContain("More options");
    expect(sidePanel).toContain("Load cached plan");
    expect(sidePanel).toContain("Generated after processing");
    expect(sidePanel).toContain('id="liveseller-live-control"');
    expect(sidePanel).toContain("Live preview");
    expect(sidePanel).toContain("Products in this live");
    expect(sidePanel).toContain("Go Live");
    expect(sidePanel).toContain("Shopee Live setup URL");
    expect(sidePanel).toContain("Codex operator origin");
    expect(sidePanel).toContain('id="liveseller-seller-timeline"');
    expect(sidePanel).toContain("Seller timeline");
    expect(sidePanel).toContain("Refresh timeline");
    expect(sidePanel).toContain("Public overlay browser-source URL");
    expect(sidePanel).toContain("Seller camera compositor preview URL");
    expect(sidePanel).toContain("Open Shopee Live setup");
    expect(sidePanel).toContain("Open camera preview");
    expect(sidePanel).toContain("Copy overlay URL");
    expect(sidePanel).toContain("Capture Shopee preview");
    expect(sidePanel).toContain("Start stream publisher");
    expect(sidePanel).toContain("Camera + AI overlays");
    expect(sidePanel).toContain('id="live-camera-frame"');
    expect(sidePanel).toContain('id="viewer-url"');
    expect(sidePanel).toContain("Refresh preview");
    expect(sidePanel).toContain("Stop preview");
    expect(sidePanel).toContain("AI stream director");
    expect(sidePanel).toContain("Generate overlay");
    expect(sidePanel).toContain("Send safe reply");
    expect(sidePanel).toContain("Fill Shopee listing");
    expect(sidePanel).toContain("Confirm Save and Publish");
    expect(sidePanel).toContain("What to say next");
    expect(sidePanel).toContain("Load scripts");
    expect(sidePanel).toContain("Start voice copilot");
    expect(sidePanel).toContain("Codex app-server operator");
    expect(sidePanel).toContain("Ask operator");
    expect(sidePanel).toContain("Generate image edits");
    expect(sidePanel).toContain("Build create_product commands");
    expect(sidePanel).toContain("Verify Shopee camera/video preview and overlay feed manually.");
    expect(sidePanel).toContain('script src="sidepanel.js"');
    expect(sidePanelScript).toContain("/api/prep/review-plan/");
    expect(sidePanelScript).toContain("/api/operator/sidepanel-draft");
    expect(sidePanelScript).toContain("createIntakeReviewDraft");
    expect(sidePanelScript).toContain("operator_review_plan_created");
    expect(sidePanelScript).toContain("operator_approval_recorded");
    expect(sidePanelScript).toContain("appendProductEvent");
    expect(sidePanelScript).toContain("productEventFromTimeline");
    expect(sidePanelScript).toContain("writeCachedPlan");
    expect(sidePanelScript).toContain("stripLargeCachedValues");
    expect(sidePanelScript).toContain("setInterval(() => void refreshSellerTimeline().catch(() => undefined), 2000)");
    expect(sidePanelScript).toContain("Approve all complete");
    expect(sidePanelScript).toContain("handleApproveAllClick");
    expect(sidePanelScript).not.toContain("Approve and create product");
    expect(sidePanelScript).toContain("Shopee publish queue complete");
    expect(sidePanelScript).toContain("Livestream product context ready");
    expect(sidePanelScript).toContain("Shopee form filled");
    expect(sidePanelScript).toContain("requestPlanChanges");
    expect(sidePanelScript).toContain("Request changes");
    expect(sidePanelScript).toContain("liveseller_record_product_review_decision");
    expect(sidePanelScript).toContain("cachedPlanStorageKey");
    expect(sidePanelScript).toContain('$("#load-cached-plan").addEventListener("click", loadCachedPlan)');
    expect(sidePanelScript).toContain("writeDraftFields({})");
    expect(sidePanelScript).toContain("extension_side_panel_drag_drop");
    expect(sidePanelScript).toContain("/api/prep/review-decisions");
    expect(sidePanelScript).toContain("/api/operator/seller-review-turn");
    expect(sidePanelScript).toContain("/api/operator/review-tools");
    expect(sidePanelScript).toContain("/api/operator/events");
    expect(sidePanelScript).toContain("/api/seller-timeline/events");
    expect(sidePanelScript).toContain("refreshSellerTimeline");
    expect(sidePanelScript).toContain("/api/runtime/events");
    expect(sidePanelScript).toContain("/api/runtime/realtime/agent-session");
    expect(sidePanelScript).toContain("@openai/agents-realtime");
    expect(sidePanelScript).toContain("RealtimeAgent");
    expect(sidePanelScript).toContain("RealtimeSession");
    expect(sidePanelScript).toContain('transport: "webrtc"');
    expect(sidePanelScript).toContain("gpt-realtime-2");
    expect(sidePanelScript).toContain("show_overlay_background");
    expect(sidePanelScript).toContain("show_product_card");
    expect(sidePanelScript).toContain("prompt_seller_script");
    expect(sidePanelScript).toContain("send_policy_checked_reply");
    expect(sidePanelScript).toContain("/api/runtime/realtime/tool-call");
    expect(sidePanelScript).toContain("/api/live-sessions");
    expect(sidePanelScript).toContain("registerApprovedLiveSession");
    expect(sidePanelScript).toContain("renderLivePreview");
    expect(sidePanelScript).toContain("callRealtimeTool");
    expect(sidePanelScript).toContain("/api/live-sessions/");
    expect(sidePanelScript).not.toContain("speechSynthesis");
    expect(sidePanelScript).toContain("publicOverlayUrl");
    expect(sidePanelScript).toContain("cameraPreviewUrl");
    expect(sidePanelScript).toContain("openShopeeLiveSetup");
    expect(sidePanelScript).toContain("aiPrepareShopeePreview");
    expect(sidePanelScript).toContain("/api/shopee/runtime-compositor/start");
    expect(sidePanelScript).toContain('cameraInputKind: "avfoundation"');
    expect(sidePanelScript).toContain('cameraInput: "0"');
    expect(sidePanelScript).toContain("/api/shopee/runtime-compositor/status");
    expect(sidePanelScript).toContain("/api/shopee/runtime-compositor/stop");
    expect(sidePanelScript).toContain("publicOverlayUrl");
    expect(sidePanelScript).toContain("sendLowRiskReplyThroughShopeeTab");
    expect(sidePanelScript).toContain("queueShopeeProductCreation");
    expect(sidePanelScript).toContain("confirmShopeeProductPublish");
    expect(sidePanelScript).toContain("Fill one approved Shopee product listing before confirming Save and Publish.");
    expect(sidePanelScript).toContain("remainingApprovedCommands");
    expect(sidePanelScript).toContain("state.productCreationFilled");
    expect(sidePanelScript).toContain("confirmShopeeGoLive");
    expect(sidePanelScript).toContain("operatorBuildCreateProducts");
    expect(sidePanelScript).toContain("updateLaunchChecklist");
    expect(sidePanelScript).toContain("present_redacted");
    expect(background).toContain("liveseller:lastViewerMessage");
    expect(background).toContain("openPanelOnActionClick");
    expect(background).toContain("prepareShopeeTestPreview");
    expect(background).toContain("liveseller:prepare-shopee-test-preview");
    expect(background).toContain("liveseller:confirm-product-publish");
    expect(background).toContain("liveseller:confirm-go-live");
    expect(contentScript).toContain("data-viewer-id");
    expect(`${sidePanel}\n${sidePanelScript}\n${background}\n${contentScript}`).not.toMatch(/OPENAI_API_KEY|sk-/i);
  });

  it("presents a seller-facing step flow and hides diagnostics by default", () => {
    const sidePanel = readFileSync(join(repoRoot, "apps/extension/sidepanel.html"), "utf8");
    const sidePanelScript = readFileSync(join(repoRoot, "apps/extension/sidepanel.js"), "utf8");
    const sidePanelStyles = readFileSync(join(repoRoot, "apps/extension/sidepanel.css"), "utf8");

    expect(sidePanel).toContain("Start with products");
    expect(sidePanel).toContain("Go live");
    expect(sidePanel).toContain("Talk to viewers");
    expect(sidePanel).toContain('data-step="products"');
    expect(sidePanel).toContain('data-step="live"');
    expect(sidePanel).toContain('data-step="audience"');
    expect(sidePanel).toContain("Connection settings");
    expect(sidePanel).toContain("Technical details");
    expect(sidePanelScript).toContain("setActiveStep");
    expect(sidePanelScript).toContain("toggleSettingsPanel");
    expect(sidePanelScript).toContain("Draft ready for review");
    expect(sidePanelStyles).toContain(".panel[data-step]");
    expect(sidePanelStyles).toContain(".panel[data-step].active-step");
    expect(sidePanelStyles).toContain(".icon-button");
    expect(sidePanelStyles).toContain("details.diagnostics");
  });
});
