// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validAuditEvent,
  validLiveAction,
  validLiveSessionSpec
} from "@liveseller/contracts";
import { executeSellerCommand } from "../src/commandExecutor";
import {
  extractViewerMessage,
  handleReceiveNormalUserMessage,
  installReceiveNormalUserMessageHook,
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

  it("keeps OpenAI keys out of extension manifest", () => {
    const manifest = readFileSync(join(repoRoot, "apps/extension/manifest.json"), "utf8");
    expect(manifest).not.toMatch(/OPENAI|sk-/i);
  });
});
