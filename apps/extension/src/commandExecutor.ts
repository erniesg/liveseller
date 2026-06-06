import {
  type LiveAction,
  type ShopeeCreateProductCommand,
  type ShopeeStartLivestreamCommand,
  type ToolResult,
  ShopeeCreateProductCommandSchema,
  ShopeeStartLivestreamCommandSchema,
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

export type ExecutedProductCommand = {
  toolResult: ToolResult;
  command?: ShopeeCreateProductCommand;
};

export type ExecutedLivestreamCommand = {
  toolResult: ToolResult;
  command?: ShopeeStartLivestreamCommand;
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

function result(actionId: string, status: ToolResult["status"], error?: string): ToolResult {
  return ToolResultSchema.parse({
    actionId,
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
        toolResult: result(action.actionId, "rejected", "send_reply requires low risk and no approval"),
        nextComposerValue: composer.value,
        publicSend: false
      };
    }

    if (!canWriteDraft(composer)) {
      return {
        toolResult: result(action.actionId, "skipped", "seller is typing or composer is not empty"),
        nextComposerValue: composer.value,
        publicSend: false
      };
    }

    return {
      toolResult: result(action.actionId, "applied"),
      nextComposerValue: "",
      publicSend: true
    };
  }

  if (action.type === "draft_reply" && action.payload.kind === "draft_reply") {
    if (!canWriteDraft(composer)) {
      return {
        toolResult: result(action.actionId, "skipped", "seller is typing or composer is not empty"),
        nextComposerValue: composer.value,
        publicSend: false
      };
    }

    return {
      toolResult: result(action.actionId, "applied"),
      nextComposerValue: action.payload.text,
      publicSend: false
    };
  }

  if (action.type === "escalate" || action.type === "request_approval") {
    return {
      toolResult: result(action.actionId, "applied"),
      nextComposerValue: composer.value,
      publicSend: false
    };
  }

  return {
    toolResult: result(action.actionId, "skipped", "action is not handled by the seller tab"),
    nextComposerValue: composer.value,
    publicSend: false
  };
}

function readCommandId(value: unknown): string {
  if (value && typeof value === "object" && "commandId" in value) {
    const commandId = (value as { commandId?: unknown }).commandId;
    if (typeof commandId === "string" && commandId.trim().length > 0) {
      return commandId;
    }
  }
  return "unknown-create-product-command";
}

export function executeShopeeCreateProductCommand(input: unknown): ExecutedProductCommand {
  const parsed = ShopeeCreateProductCommandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      toolResult: result(
        readCommandId(input),
        "rejected",
        "create_product requires approved or edited product review state"
      )
    };
  }

  return {
    toolResult: result(parsed.data.commandId, "applied"),
    command: parsed.data
  };
}

export function executeShopeeStartLivestreamCommand(input: unknown): ExecutedLivestreamCommand {
  const parsed = ShopeeStartLivestreamCommandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      toolResult: result(
        readCommandId(input),
        "rejected",
        "prepare_livestream requires approved dry-run setup with redacted stream credentials"
      )
    };
  }

  return {
    toolResult: result(parsed.data.commandId, "applied"),
    command: parsed.data
  };
}
