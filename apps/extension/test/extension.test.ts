// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validAuditEvent,
  validLiveAction,
  validLiveSessionSpec,
  validShopeeCreateProductCommand
} from "@liveseller/contracts";
import {
  executeSellerCommand,
  executeShopeeCreateProductCommand
} from "../src/commandExecutor";
import {
  extractViewerMessage,
  handleReceiveNormalUserMessage,
  installReceiveNormalUserMessageHook,
  renderCodexOperatorEvents,
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

  it("keeps OpenAI keys out of extension manifest", () => {
    const manifest = readFileSync(join(repoRoot, "apps/extension/manifest.json"), "utf8");
    expect(manifest).not.toMatch(/OPENAI|sk-/i);
  });
});
