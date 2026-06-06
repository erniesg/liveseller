import {
  type AuditEvent,
  type LiveAction,
  type RuntimeEvent,
  type ToolResult,
  AuditEventSchema,
  LiveActionSchema,
  ToolResultSchema
} from "@liveseller/contracts";
import { RUNTIME_ORIGIN } from "./background";
import {
  type ComposerState,
  type ExecutedCommand,
  executeSellerCommand
} from "./commandExecutor";

export type CapturedViewerMessage = {
  viewerId: string;
  viewerName: string;
  text: string;
};

export type ReceiveNormalUserMessageTarget = {
  receiveNormalUserMessage?: unknown;
};

export type RuntimeActionResponse = {
  actions: LiveAction[];
  toolResults: ToolResult[];
  auditEvents: AuditEvent[];
  raw: unknown;
};

export type ReviewPayload = {
  event: RuntimeEvent;
  actions: LiveAction[];
  runtimeToolResults: ToolResult[];
  extensionToolResults: ToolResult[];
  auditEvents: AuditEvent[];
  approvalQueue: LiveAction[];
  renderedAt: string;
};

export type HandleReceiveNormalUserMessageOptions = {
  sessionId: string;
  timestamp?: string;
  runtimeOrigin?: string;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  composer?: ComposerState;
  renderTarget?: Element;
};

export type HandledReceiveNormalUserMessage = {
  event: RuntimeEvent;
  runtimeResponse: RuntimeActionResponse;
  executedCommands: ExecutedCommand[];
  reviewPayload: ReviewPayload;
};

export function extractViewerMessage(row: Element): CapturedViewerMessage | null {
  const viewerId = row.getAttribute("data-viewer-id");
  const viewerName = row.getAttribute("data-viewer-name");
  const text = row.textContent?.trim();

  if (!viewerId || !viewerName || !text) {
    return null;
  }

  return {
    viewerId,
    viewerName,
    text
  };
}

export function toViewerChatEvent(
  message: CapturedViewerMessage,
  sessionId: string,
  timestamp = new Date().toISOString()
): RuntimeEvent {
  return {
    eventId: `viewer-${message.viewerId}-${Date.parse(timestamp)}`,
    sessionId,
    timestamp,
    source: "viewer",
    type: "viewer_chat",
    payload: {
      viewerId: message.viewerId,
      viewerName: message.viewerName,
      text: message.text
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => asRecord(current)?.[key], value);
}

function firstString(value: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return undefined;
}

function slug(value: string): string {
  const cleaned = value
    .trim()
    .replaceAll(/[^\w-]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 48);
  return cleaned || "message";
}

export function normalizeReceiveNormalUserMessagePayload(
  payload: unknown,
  sessionId: string,
  timestamp = new Date().toISOString()
): RuntimeEvent {
  const viewerId = firstString(payload, [
    ["viewerId"],
    ["userId"],
    ["user_id"],
    ["uid"],
    ["sender", "viewerId"],
    ["sender", "userId"],
    ["sender", "user_id"],
    ["sender", "uid"],
    ["user", "id"],
    ["data", "uid"],
    ["data", "userId"]
  ]);
  const viewerName = firstString(payload, [
    ["viewerName"],
    ["nickname"],
    ["nickName"],
    ["nick_name"],
    ["displayName"],
    ["sender", "nickname"],
    ["sender", "nickName"],
    ["user", "nickname"],
    ["data", "nickname"],
    ["data", "nickName"]
  ]);
  const text = firstString(payload, [
    ["text"],
    ["content"],
    ["message"],
    ["msg"],
    ["messageContent"],
    ["data", "text"],
    ["data", "content"],
    ["data", "message"],
    ["body", "text"]
  ]);

  if (!viewerId || !text) {
    throw new Error("receiveNormalUserMessage payload must include viewer id and message text");
  }

  return {
    eventId: `shopee-${slug(viewerId)}-${Date.parse(timestamp)}-${slug(text)}`,
    sessionId,
    timestamp,
    source: "viewer",
    type: "viewer_chat",
    payload: {
      viewerId,
      viewerName: viewerName ?? viewerId,
      text
    }
  };
}

function parseRuntimeActionResponse(raw: unknown): RuntimeActionResponse {
  const body = asRecord(raw);
  if (!body || !Array.isArray(body.actions)) {
    throw new Error("Runtime response must include actions[]");
  }

  return {
    actions: body.actions.map((action) => LiveActionSchema.parse(action)),
    toolResults: Array.isArray(body.toolResults)
      ? body.toolResults.map((toolResult) => ToolResultSchema.parse(toolResult))
      : [],
    auditEvents: Array.isArray(body.auditEvents)
      ? body.auditEvents.map((auditEvent) => AuditEventSchema.parse(auditEvent))
      : [],
    raw
  };
}

export async function postRuntimeEvent(
  event: RuntimeEvent,
  runtimeOrigin = RUNTIME_ORIGIN,
  fetchImpl: HandleReceiveNormalUserMessageOptions["fetchImpl"] = fetch
): Promise<RuntimeActionResponse> {
  const response = await fetchImpl(`${runtimeOrigin}/api/runtime/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    throw new Error(`Runtime rejected viewer event: ${response.status}`);
  }

  return parseRuntimeActionResponse(await response.json());
}

export function buildReviewPayload(
  event: RuntimeEvent,
  runtimeResponse: RuntimeActionResponse,
  executedCommands: ExecutedCommand[],
  renderedAt = new Date().toISOString()
): ReviewPayload {
  return {
    event,
    actions: runtimeResponse.actions,
    runtimeToolResults: runtimeResponse.toolResults,
    extensionToolResults: executedCommands.map((command) => command.toolResult),
    auditEvents: runtimeResponse.auditEvents,
    approvalQueue: runtimeResponse.actions.filter((action) => action.requiresApproval),
    renderedAt
  };
}

export function renderReviewPayload(target: Element, payload: ReviewPayload): void {
  const doc = target.ownerDocument;
  const section = doc.createElement("section");
  section.setAttribute("data-liveseller-review", "latest");

  const heading = doc.createElement("h2");
  heading.textContent = "Runtime actions";
  section.append(heading);

  const meta = doc.createElement("p");
  meta.textContent = `${payload.event.eventId} - ${payload.renderedAt}`;
  section.append(meta);

  for (const action of payload.actions) {
    const article = doc.createElement("article");
    article.setAttribute("data-liveseller-action-id", action.actionId);

    const title = doc.createElement("h3");
    title.textContent = `${action.type} - ${action.risk}`;
    article.append(title);

    const reason = doc.createElement("p");
    reason.textContent = action.reason;
    article.append(reason);

    if ("text" in action.payload) {
      const proposedText = doc.createElement("blockquote");
      proposedText.textContent = action.payload.text;
      article.append(proposedText);
    }

    if (action.requiresApproval) {
      const approval = doc.createElement("p");
      approval.setAttribute("data-liveseller-approval-required", "true");
      approval.textContent = action.approvalId ?? "approval-required";
      article.append(approval);
    }

    section.append(article);
  }

  target.replaceChildren(section);
}

export async function handleReceiveNormalUserMessage(
  payload: unknown,
  options: HandleReceiveNormalUserMessageOptions
): Promise<HandledReceiveNormalUserMessage> {
  const event = normalizeReceiveNormalUserMessagePayload(
    payload,
    options.sessionId,
    options.timestamp
  );
  const runtimeResponse = await postRuntimeEvent(
    event,
    options.runtimeOrigin,
    options.fetchImpl
  );
  const composer = options.composer ?? { value: "", isSellerTyping: true };
  const executedCommands = runtimeResponse.actions.map((action) =>
    executeSellerCommand(action, composer)
  );
  const reviewPayload = buildReviewPayload(event, runtimeResponse, executedCommands);

  if (options.renderTarget) {
    renderReviewPayload(options.renderTarget, reviewPayload);
  }

  return {
    event,
    runtimeResponse,
    executedCommands,
    reviewPayload
  };
}

export function installReceiveNormalUserMessageHook(
  target: ReceiveNormalUserMessageTarget,
  onPayload: (payload: unknown) => void | Promise<void>
): () => void {
  const original = target.receiveNormalUserMessage;
  if (typeof original !== "function") {
    return () => undefined;
  }

  const wrapped = function receiveNormalUserMessageWrapper(this: unknown, ...args: unknown[]) {
    void onPayload(args[0]);
    return original.apply(this, args);
  };

  target.receiveNormalUserMessage = wrapped;

  return () => {
    if (target.receiveNormalUserMessage === wrapped) {
      target.receiveNormalUserMessage = original;
    }
  };
}
