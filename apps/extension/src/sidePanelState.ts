import {
  type LiveAction,
  type ToolResult,
  ToolResultSchema,
  vintageJewelryLiveSessionSpec
} from "@liveseller/contracts";
import type { CapturedViewerMessage } from "./contentScript";

export type SidePanelConnectionState = "connected" | "disconnected";

export type SidePanelActionView = {
  actionId: string;
  label: string;
  sellerStatus: "public-send-eligible" | "seller-only" | "blocked";
  risk: LiveAction["risk"];
  requiresApproval: boolean;
  reason: string;
};

export type SidePanelSnapshot = {
  connection: SidePanelConnectionState;
  runtimeOrigin: string;
  realSelectorsAudited: boolean;
  blockerLabel?: string;
  session: {
    sessionId: string;
    title: string;
    shopId: string;
    productCount: number;
  };
  capturedMessage?: CapturedViewerMessage & {
    sentToRuntime: boolean;
  };
  pendingActions: SidePanelActionView[];
  lastToolResult?: ToolResult;
};

const extensionEvidence = [
  {
    sourceId: "side-panel-state",
    sourceType: "system" as const,
    locator: "apps/extension/src/sidePanelState.ts",
    excerpt: "Static side-panel state for Lane 3 extension UI proof.",
    confidence: 1
  }
];

export function describeActionForSeller(action: LiveAction): SidePanelActionView {
  if (
    action.type === "send_reply" &&
    action.payload.kind === "send_reply" &&
    action.risk === "low" &&
    !action.requiresApproval
  ) {
    return {
      actionId: action.actionId,
      label: "Pending safe reply",
      sellerStatus: "public-send-eligible",
      risk: action.risk,
      requiresApproval: action.requiresApproval,
      reason: action.reason
    };
  }

  if (action.type === "draft_reply" || action.type === "escalate" || action.type === "request_approval") {
    return {
      actionId: action.actionId,
      label: action.type === "draft_reply" ? "Pending seller draft" : "Pending seller review",
      sellerStatus: "seller-only",
      risk: action.risk,
      requiresApproval: action.requiresApproval,
      reason: action.reason
    };
  }

  return {
    actionId: action.actionId,
    label: "Blocked public command",
    sellerStatus: "blocked",
    risk: action.risk,
    requiresApproval: action.requiresApproval,
    reason: action.reason
  };
}

export function createDemoToolResult(actionId: string): ToolResult {
  return ToolResultSchema.parse({
    actionId,
    adapter: "shopee-content-script",
    status: "skipped",
    evidence: extensionEvidence,
    error: "Real Shopee selectors are not audited; public automation remains blocked.",
    timestamp: "2026-06-06T02:45:00.000Z"
  });
}

export function createSidePanelSnapshot(options: {
  connection?: SidePanelConnectionState;
  capturedMessage?: CapturedViewerMessage;
  pendingActions?: LiveAction[];
  runtimeOrigin?: string;
  realSelectorsAudited?: boolean;
}): SidePanelSnapshot {
  const pendingActions = options.pendingActions ?? [];
  const firstAction = pendingActions[0];

  return {
    connection: options.connection ?? "disconnected",
    runtimeOrigin: options.runtimeOrigin ?? "http://127.0.0.1:8787",
    realSelectorsAudited: options.realSelectorsAudited ?? false,
    blockerLabel: options.realSelectorsAudited ? undefined : "REAL_SHOPEE_UI_AUDIT_REQUIRED",
    session: {
      sessionId: vintageJewelryLiveSessionSpec.sessionId,
      title: vintageJewelryLiveSessionSpec.title,
      shopId: vintageJewelryLiveSessionSpec.shopId,
      productCount: vintageJewelryLiveSessionSpec.products.length
    },
    capturedMessage: options.capturedMessage
      ? {
          ...options.capturedMessage,
          sentToRuntime: options.connection === "connected"
        }
      : undefined,
    pendingActions: pendingActions.map(describeActionForSeller),
    lastToolResult: firstAction ? createDemoToolResult(firstAction.actionId) : undefined
  };
}
