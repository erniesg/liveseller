import {
  type EvidenceCitation,
  type LiveAction,
  type ToolResult,
  ToolResultSchema
} from "@liveseller/contracts";

const adapterCitation: EvidenceCitation = {
  sourceId: "fake-adapter",
  sourceType: "system",
  locator: "apps/runtime/src/adapters.ts",
  excerpt: "Fake adapter result for deterministic local integration tests.",
  confidence: 1
};

const now = () => new Date().toISOString();

export function applyFakeExtension(action: LiveAction): ToolResult {
  const extensionActions = new Set(["send_reply", "draft_reply", "escalate", "request_approval"]);

  return ToolResultSchema.parse({
    actionId: action.actionId,
    adapter: "fake-extension",
    status: extensionActions.has(action.type) ? "applied" : "skipped",
    evidence: [adapterCitation],
    timestamp: now()
  });
}

export function applyFakeOverlay(action: LiveAction): ToolResult {
  const overlayActions = new Set([
    "show_product_card",
    "show_promo_banner",
    "update_caption",
    "emit_translation",
    "set_caption_visibility",
    "set_audio_mix",
    "set_current_product"
  ]);

  return ToolResultSchema.parse({
    actionId: action.actionId,
    adapter: "fake-overlay",
    status: overlayActions.has(action.type) ? "applied" : "skipped",
    evidence: [adapterCitation],
    timestamp: now()
  });
}

export function executeFakeAdapters(actions: LiveAction[]): ToolResult[] {
  return actions.flatMap((action) => {
    const results = [applyFakeExtension(action), applyFakeOverlay(action)];
    return results.filter((result) => result.status !== "skipped");
  });
}
