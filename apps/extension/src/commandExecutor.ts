import {
  type LiveAction,
  type ToolResult,
  ToolResultSchema
} from "@liveseller/contracts";

export type ComposerState = {
  value: string;
  isSellerTyping: boolean;
};

export type ExecutedCommand = {
  toolResult: ToolResult;
  nextComposerValue: string;
  publicSend: boolean;
};

const extensionEvidence = [
  {
    sourceId: "extension-command-executor",
    sourceType: "system" as const,
    locator: "apps/extension/src/commandExecutor.ts",
    excerpt: "Deterministic seller-tab command executor result.",
    confidence: 1
  }
];

function result(action: LiveAction, status: ToolResult["status"], error?: string): ToolResult {
  return ToolResultSchema.parse({
    actionId: action.actionId,
    adapter: "shopee-content-script",
    status,
    evidence: extensionEvidence,
    error,
    timestamp: new Date().toISOString()
  });
}

export function canWriteDraft(composer: ComposerState): boolean {
  return composer.value.trim().length === 0 && !composer.isSellerTyping;
}

export function executeSellerCommand(action: LiveAction, composer: ComposerState): ExecutedCommand {
  if (action.type === "send_reply") {
    if (action.risk !== "low" || action.requiresApproval || action.payload.kind !== "send_reply") {
      return {
        toolResult: result(action, "rejected", "send_reply requires low risk and no approval"),
        nextComposerValue: composer.value,
        publicSend: false
      };
    }

    if (!canWriteDraft(composer)) {
      return {
        toolResult: result(action, "skipped", "seller is typing or composer is not empty"),
        nextComposerValue: composer.value,
        publicSend: false
      };
    }

    return {
      toolResult: result(action, "applied"),
      nextComposerValue: "",
      publicSend: true
    };
  }

  if (action.type === "draft_reply" && action.payload.kind === "draft_reply") {
    if (!canWriteDraft(composer)) {
      return {
        toolResult: result(action, "skipped", "seller is typing or composer is not empty"),
        nextComposerValue: composer.value,
        publicSend: false
      };
    }

    return {
      toolResult: result(action, "applied"),
      nextComposerValue: action.payload.text,
      publicSend: false
    };
  }

  if (action.type === "escalate" || action.type === "request_approval") {
    return {
      toolResult: result(action, "applied"),
      nextComposerValue: composer.value,
      publicSend: false
    };
  }

  return {
    toolResult: result(action, "skipped", "action is not handled by the seller tab"),
    nextComposerValue: composer.value,
    publicSend: false
  };
}
