export const RUNTIME_ORIGIN = "http://127.0.0.1:8787";

export function hasLongLivedOpenAiKey(value: unknown): boolean {
  return typeof value === "string" && /^sk-[A-Za-z0-9]/.test(value);
}

function isLowRiskSendReply(action: unknown): action is {
  actionId: string;
  type: "send_reply";
  risk: "low";
  requiresApproval: false;
  payload: { kind: "send_reply"; text: string };
} {
  if (!action || typeof action !== "object") {
    return false;
  }
  const candidate = action as {
    actionId?: unknown;
    type?: unknown;
    risk?: unknown;
    requiresApproval?: unknown;
    payload?: { kind?: unknown; text?: unknown };
  };
  return typeof candidate.actionId === "string" &&
    candidate.type === "send_reply" &&
    candidate.risk === "low" &&
    candidate.requiresApproval === false &&
    candidate.payload?.kind === "send_reply" &&
    typeof candidate.payload.text === "string" &&
    candidate.payload.text.trim().length > 0;
}

function approvedCreateProductCommands(commands: unknown): unknown[] {
  return Array.isArray(commands)
    ? commands.filter((command) => {
        if (!command || typeof command !== "object") {
          return false;
        }
        const candidate = command as { kind?: unknown; approvalStatus?: unknown; commandId?: unknown };
        return candidate.kind === "create_product" &&
          typeof candidate.commandId === "string" &&
          (candidate.approvalStatus === "approved" || candidate.approvalStatus === "edited");
      })
    : [];
}

type ChromeExtensionApi = {
  runtime?: {
    onInstalled?: { addListener(listener: () => void): void };
    onMessage?: {
      addListener(
        listener: (
          message: unknown,
          sender: unknown,
          sendResponse: (response: unknown) => void
        ) => boolean
      ): void;
    };
  };
  sidePanel?: { setPanelBehavior?(options: { openPanelOnActionClick: boolean }): void };
  storage?: {
    session?: {
      set(value: Record<string, unknown>): Promise<void>;
      get(key: string): Promise<Record<string, unknown>>;
    };
  };
};

const chromeApi = (globalThis as { chrome?: ChromeExtensionApi }).chrome;

chromeApi?.runtime?.onInstalled?.addListener(() => {
  chromeApi.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
  void chromeApi.storage?.session?.set({
    "liveseller:runtimeOrigin": RUNTIME_ORIGIN
  });
});

chromeApi?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  const payload = message as { type?: unknown; action?: unknown; commands?: unknown };

  if (payload?.type === "liveseller:execute-seller-command") {
    if (!isLowRiskSendReply(payload.action)) {
      sendResponse({ ok: false, error: "Only low-risk no-approval send_reply actions can execute." });
      return false;
    }
    void chromeApi.storage?.session?.set({
      "liveseller:lastQueuedSellerReply": {
        actionId: payload.action.actionId,
        text: payload.action.payload.text,
        queuedAt: new Date().toISOString(),
        source: "side-panel"
      }
    });
    sendResponse({ ok: true, status: "queued_for_shopee_content_script", actionId: payload.action.actionId });
    return false;
  }

  if (payload?.type === "liveseller:queue-create-products") {
    const commands = approvedCreateProductCommands(payload.commands);
    void chromeApi.storage?.session?.set({
      "liveseller:queuedCreateProducts": {
        commands,
        queuedAt: new Date().toISOString(),
        source: "side-panel"
      }
    });
    sendResponse({ ok: commands.length > 0, status: "queued_for_authenticated_tab", commandCount: commands.length });
    return false;
  }

  return false;
});
