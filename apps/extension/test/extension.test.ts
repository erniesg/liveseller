// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validLiveAction } from "@liveseller/contracts";
import { executeSellerCommand } from "../src/commandExecutor";
import { extractViewerMessage, toViewerChatEvent } from "../src/contentScript";
import { createSidePanelSnapshot, describeActionForSeller } from "../src/sidePanelState";

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

  it("rejects unsafe public replies and keeps escalations seller-only", () => {
    const unsafeSend = {
      ...validLiveAction,
      actionId: "action-unsafe-send",
      risk: "high" as const,
      requiresApproval: true
    };

    const rejected = executeSellerCommand(unsafeSend, {
      value: "",
      isSellerTyping: false
    });

    expect(rejected.toolResult.status).toBe("rejected");
    expect(rejected.publicSend).toBe(false);

    const escalation = {
      ...validLiveAction,
      actionId: "action-escalate-fake-claim",
      type: "escalate" as const,
      risk: "high" as const,
      requiresApproval: true,
      payload: {
        kind: "escalate" as const,
        severity: "high" as const,
        sellerMessage: "Buyer asked for authenticity proof; keep this seller-only.",
        suggestedScript: "I can describe visible condition, but I will not claim authenticity without proof."
      }
    };

    const escalated = executeSellerCommand(escalation, {
      value: "",
      isSellerTyping: false
    });

    expect(escalated.toolResult.status).toBe("applied");
    expect(escalated.publicSend).toBe(false);
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

  it("captures language-specific nested message text and ignores host rows", () => {
    const row = document.createElement("div");
    row.setAttribute("data-live-viewer-id", "viewer-zh");
    row.setAttribute("data-live-viewer-name", "Mei");
    row.setAttribute("data-language", "zh");
    row.setAttribute("data-timestamp", "2026-06-06T02:10:00.000Z");
    row.innerHTML = `<span data-message-text>这枚胸针是纯金吗?</span>`;

    const message = extractViewerMessage(row);
    expect(message).toEqual({
      viewerId: "viewer-zh",
      viewerName: "Mei",
      text: "这枚胸针是纯金吗?",
      language: "zh",
      timestamp: "2026-06-06T02:10:00.000Z"
    });

    const event = toViewerChatEvent(
      message!,
      "live-vintage-jewelry-001",
      message!.timestamp ?? "2026-06-06T02:10:00.000Z"
    );
    expect(event.type).toBe("viewer_chat");
    if (event.type !== "viewer_chat") {
      throw new Error("Expected viewer_chat event");
    }
    expect(event.payload.language).toBe("zh");

    const hostRow = document.createElement("div");
    hostRow.setAttribute("data-live-role", "host");
    hostRow.setAttribute("data-viewer-id", "seller");
    hostRow.setAttribute("data-viewer-name", "Host");
    hostRow.textContent = "Host recap";
    expect(extractViewerMessage(hostRow)).toBeNull();
  });

  it("surfaces JodisW side-panel states for the vintage jewelry seller flow", () => {
    const draftAction = {
      ...validLiveAction,
      actionId: "action-vintage-draft",
      type: "draft_reply" as const,
      risk: "medium" as const,
      requiresApproval: true,
      reason: "Material question needs seller review before public answer.",
      payload: {
        kind: "draft_reply" as const,
        viewerId: "viewer-real",
        text: "I can describe the visible gold-tone finish, but cannot claim pure gold without proof.",
        language: "en" as const,
        productId: "prod-vintage-gold-grape-leaf-brooch"
      }
    };

    expect(describeActionForSeller(validLiveAction).sellerStatus).toBe("public-send-eligible");
    expect(describeActionForSeller(draftAction).sellerStatus).toBe("seller-only");

    const snapshot = createSidePanelSnapshot({
      capturedMessage: {
        viewerId: "viewer-real",
        viewerName: "Real Buyer",
        text: "Is the brooch real gold?"
      },
      pendingActions: [draftAction]
    });

    expect(snapshot.session.title).toBe("Vintage Jewelry Live Showcase");
    expect(snapshot.blockerLabel).toBe("REAL_SHOPEE_UI_AUDIT_REQUIRED");
    expect(snapshot.capturedMessage?.sentToRuntime).toBe(false);
    expect(snapshot.pendingActions[0]?.label).toBe("Pending seller draft");
    expect(snapshot.lastToolResult?.status).toBe("skipped");
  });

  it("keeps OpenAI keys out of extension manifest", () => {
    const manifest = readFileSync(join(process.cwd(), "apps/extension/manifest.json"), "utf8");
    expect(manifest).not.toMatch(/OPENAI|sk-/i);
  });

  it("keeps OpenAI keys out of side-panel files", () => {
    const html = readFileSync(join(process.cwd(), "apps/extension/sidepanel.html"), "utf8");
    const script = readFileSync(join(process.cwd(), "apps/extension/sidepanel.js"), "utf8");
    expect(`${html}\n${script}`).not.toMatch(/OPENAI|sk-/i);
    expect(html).toContain("Vintage Jewelry Live Showcase");
    expect(html).toContain("REAL_SHOPEE_UI_AUDIT_REQUIRED");
  });
});
