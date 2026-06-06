import {
  type AuditEvent,
  type LiveAction,
  type ProductReviewDecision,
  type ProductReviewPlan,
  type RuntimeEvent,
  type ShopeeCreateProductCommand,
  type ShopeeStartLivestreamCommand,
  type ToolResult,
  AuditEventSchema,
  LiveActionSchema,
  ProductReviewDecisionSchema,
  ProductReviewPlanSchema,
  ShopeeCreateProductCommandSchema,
  ShopeeStartLivestreamCommandSchema,
  ToolResultSchema
} from "@liveseller/contracts";
import { RUNTIME_ORIGIN } from "./background";
import {
  type ComposerState,
  type ExecutedCommand,
  type ExecutedLivestreamCommand,
  type ExecutedProductCommand,
  executeSellerCommand,
  executeShopeeCreateProductCommand,
  executeShopeeStartLivestreamCommand
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

export type PrepReviewDecisionResponse = {
  reviewPlan: ProductReviewPlan;
  createProductCommands: ShopeeCreateProductCommand[];
  startLivestreamCommands: ShopeeStartLivestreamCommand[];
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

export type SellerUiPolicyPayload = {
  sessionId: string;
  status: "seller_review_required" | "ready_for_live_review";
  products: Array<{
    productId: string;
    title: string;
    sku: string;
    priceLabel: string;
    stockLabel: string;
    imageCount: number;
    missingFields: string[];
    reviewRequired: boolean;
  }>;
  photoEnhancement: Array<{
    productId: string;
    model: "gpt-image-2";
    sourceImageCount: number;
    promptCount: number;
    requiresApproval: boolean;
  }>;
  publicAutomation: {
    autoSend: "low_risk_structured_only";
    approvalRequired: string[];
    blockedAutoSend: string[];
  };
  renderHints: {
    sidePanelSectionId: string;
    productAttribute: string;
    actionAttribute: string;
  };
};

export type CodexOperatorEventPayload = {
  threadId: string;
  events: Array<{
    type: "session_started" | "tool_call_received" | "tool_result_sent" | "turn_completed";
    message: string;
    timestamp: string;
    tool?: string;
    callId?: string;
  }>;
};

export type ProductReviewAction = "approve" | "reject";

export type RenderProductReviewPlanOptions = {
  artifactBaseUri?: string;
  decidedAt?: string;
};

export type HandledReceiveNormalUserMessage = {
  event: RuntimeEvent;
  runtimeResponse: RuntimeActionResponse;
  executedCommands: ExecutedCommand[];
  reviewPayload: ReviewPayload;
};

export type HandledProductReviewDecision = {
  runtimeResponse: PrepReviewDecisionResponse;
  executedProductCommands: ExecutedProductCommand[];
  executedLivestreamCommands: ExecutedLivestreamCommand[];
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

function parsePrepReviewDecisionResponse(raw: unknown): PrepReviewDecisionResponse {
  const body = asRecord(raw);
  if (!body || !Array.isArray(body.createProductCommands)) {
    throw new Error("Prep review decision response must include createProductCommands[]");
  }

  return {
    reviewPlan: ProductReviewPlanSchema.parse(body.reviewPlan),
    createProductCommands: body.createProductCommands.map((command) =>
      ShopeeCreateProductCommandSchema.parse(command)
    ),
    startLivestreamCommands: Array.isArray(body.startLivestreamCommands)
      ? body.startLivestreamCommands.map((command) => ShopeeStartLivestreamCommandSchema.parse(command))
      : [],
    raw
  };
}

export async function postProductReviewDecision(
  reviewPlan: ProductReviewPlan,
  decision: ProductReviewDecision,
  runtimeOrigin = RUNTIME_ORIGIN,
  fetchImpl: HandleReceiveNormalUserMessageOptions["fetchImpl"] = fetch
): Promise<PrepReviewDecisionResponse> {
  const response = await fetchImpl(`${runtimeOrigin}/api/prep/review-decisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      reviewPlan: ProductReviewPlanSchema.parse(reviewPlan),
      decision: ProductReviewDecisionSchema.parse(decision)
    })
  });

  if (!response.ok) {
    throw new Error(`Runtime rejected product review decision: ${response.status}`);
  }

  return parsePrepReviewDecisionResponse(await response.json());
}

export async function handleProductReviewDecision(
  reviewPlan: ProductReviewPlan,
  decision: ProductReviewDecision,
  options: {
    runtimeOrigin?: string;
    fetchImpl?: HandleReceiveNormalUserMessageOptions["fetchImpl"];
  } = {}
): Promise<HandledProductReviewDecision> {
  const runtimeResponse = await postProductReviewDecision(
    reviewPlan,
    decision,
    options.runtimeOrigin,
    options.fetchImpl
  );
  const executedProductCommands = runtimeResponse.createProductCommands.map((command) =>
    executeShopeeCreateProductCommand(command)
  );
  const executedLivestreamCommands = runtimeResponse.startLivestreamCommands.map((command) =>
    executeShopeeStartLivestreamCommand(command)
  );

  return {
    runtimeResponse,
    executedProductCommands,
    executedLivestreamCommands
  };
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

export function renderSellerUiPolicy(target: Element, policy: SellerUiPolicyPayload): void {
  const doc = target.ownerDocument;
  const section = doc.createElement("section");
  section.id = policy.renderHints.sidePanelSectionId;

  const heading = doc.createElement("h2");
  heading.textContent = "Seller review";
  section.append(heading);

  const status = doc.createElement("p");
  status.setAttribute("data-liveseller-policy-status", policy.status);
  status.textContent = `${policy.status} - ${policy.publicAutomation.autoSend}`;
  section.append(status);

  for (const product of policy.products) {
    const article = doc.createElement("article");
    article.setAttribute(policy.renderHints.productAttribute, product.productId);

    const title = doc.createElement("h3");
    title.textContent = product.title;
    article.append(title);

    const facts = doc.createElement("p");
    facts.textContent = `${product.sku} - ${product.priceLabel} - ${product.stockLabel} - ${product.imageCount} images`;
    article.append(facts);

    const missing = doc.createElement("p");
    missing.textContent = product.missingFields.length > 0
      ? `Review: ${product.missingFields.join(", ")}`
      : "Review: structured identity complete";
    article.append(missing);

    const photoPlan = policy.photoEnhancement.find((plan) => plan.productId === product.productId);
    if (photoPlan) {
      const photo = doc.createElement("p");
      photo.textContent = `${photoPlan.model}: ${photoPlan.promptCount} prompts from ${photoPlan.sourceImageCount} source images`;
      article.append(photo);
    }

    section.append(article);
  }

  target.replaceChildren(section);
}

function joinUri(baseUri: string | undefined, ref: string): string {
  if (!baseUri || /^(?:https?:|file:|data:|\/)/u.test(ref)) {
    return ref;
  }
  return `${baseUri.replace(/\/$/u, "")}/${ref.replace(/^\//u, "")}`;
}

export function buildProductReviewDecision(
  plan: ProductReviewPlan,
  productId: string,
  action: ProductReviewAction,
  decidedAt = new Date().toISOString()
): ProductReviewDecision {
  const parsedPlan = ProductReviewPlanSchema.parse(plan);
  const item = parsedPlan.items.find((candidate) => candidate.productId === productId);
  if (!item) {
    throw new Error(`Cannot build seller decision for unknown product: ${productId}`);
  }

  return ProductReviewDecisionSchema.parse({
    decisionId: `decision-${productId}-${action}-${Date.parse(decidedAt)}`,
    productId,
    status: action === "approve" ? "approved" : "rejected",
    decidedBy: "seller",
    decidedAt,
    reason: action === "approve"
      ? "Seller approved the reviewed product plan and generated assets."
      : "Seller rejected the reviewed product plan.",
    citations: item.product.evidence
  });
}

export function renderProductReviewPlan(
  target: Element,
  plan: ProductReviewPlan,
  options: RenderProductReviewPlanOptions = {}
): void {
  const parsedPlan = ProductReviewPlanSchema.parse(plan);
  const doc = target.ownerDocument;
  const section = doc.createElement("section");
  section.setAttribute("data-liveseller-product-review-plan", parsedPlan.reviewPlanId);

  const heading = doc.createElement("h2");
  heading.textContent = "Product review plan";
  section.append(heading);

  const status = doc.createElement("p");
  status.setAttribute("data-liveseller-review-status", parsedPlan.status);
  status.textContent = `${parsedPlan.status} - ${parsedPlan.items.length} products`;
  section.append(status);

  for (const item of parsedPlan.items) {
    const article = doc.createElement("article");
    article.setAttribute("data-liveseller-product-id", item.productId);

    const title = doc.createElement("h3");
    title.textContent = item.product.title;
    article.append(title);

    const facts = doc.createElement("p");
    facts.textContent = `${item.product.sku} - ${item.product.currency} ${item.product.price.toFixed(2)} - ${item.product.stock} stock`;
    article.append(facts);

    const prompts = doc.createElement("ul");
    prompts.setAttribute("data-liveseller-image-prompts", item.productId);
    for (const prompt of item.photoEnhancementPlan.prompts) {
      const promptItem = doc.createElement("li");
      promptItem.textContent = prompt;
      prompts.append(promptItem);
    }
    article.append(prompts);

    const generatedTasks = parsedPlan.generationTasks.filter((task) =>
      task.productId === item.productId &&
      task.taskType === "image_edit" &&
      task.status === "completed"
    );
    if (generatedTasks.length > 0) {
      const generated = doc.createElement("div");
      generated.setAttribute("data-liveseller-generated-assets", item.productId);
      for (const task of generatedTasks) {
        for (const outputRef of task.outputRefs) {
          const image = doc.createElement("img");
          image.src = joinUri(options.artifactBaseUri, outputRef);
          image.alt = `${item.product.title} generated option`;
          image.setAttribute("data-liveseller-generated-ref", outputRef);
          generated.append(image);
        }
      }
      article.append(generated);
    }

    for (const action of ["approve", "reject"] as const) {
      const decision = buildProductReviewDecision(
        parsedPlan,
        item.productId,
        action,
        options.decidedAt
      );
      const button = doc.createElement("button");
      button.type = "button";
      button.setAttribute("data-liveseller-action-id", `${action}-${item.productId}`);
      button.setAttribute("data-liveseller-product-decision", JSON.stringify(decision));
      button.textContent = action === "approve" ? "Approve" : "Reject";
      article.append(button);
    }

    section.append(article);
  }

  target.replaceChildren(section);
}

export function renderCodexOperatorEvents(target: Element, payload: CodexOperatorEventPayload): void {
  const doc = target.ownerDocument;
  const section = doc.createElement("section");
  section.setAttribute("data-liveseller-codex-operator", payload.threadId);

  const heading = doc.createElement("h2");
  heading.textContent = "Codex app-server";
  section.append(heading);

  const meta = doc.createElement("p");
  meta.textContent = payload.threadId;
  section.append(meta);

  for (const event of payload.events) {
    const article = doc.createElement("article");
    article.setAttribute("data-liveseller-codex-event", event.type);

    const title = doc.createElement("h3");
    title.textContent = event.tool ? `${event.type} - ${event.tool}` : event.type;
    article.append(title);

    const message = doc.createElement("p");
    message.textContent = event.message;
    article.append(message);

    const timestamp = doc.createElement("p");
    timestamp.textContent = event.callId
      ? `${event.timestamp} - ${event.callId}`
      : event.timestamp;
    article.append(timestamp);

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
