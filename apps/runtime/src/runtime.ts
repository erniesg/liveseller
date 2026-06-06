import {
  type AuditEvent,
  type ContextEnvelope,
  type LiveAction,
  type LiveSessionSpec,
  type ProductRecord,
  type RuntimeEvent,
  type SessionMemory,
  type ViewerMemory,
  AuditEventSchema,
  ContextEnvelopeSchema,
  LiveActionSchema,
  validSessionMemory
} from "@liveseller/contracts";
import { executeFakeAdapters } from "./adapters";
import {
  buildSafeReplyText,
  classifyViewerMessage,
  detectLanguage,
  findRelevantCitations,
  isFlashPromoAnnouncement,
  resolveProduct,
  translateCaption
} from "./policy";
import { applyOverlayActions, createInitialOverlayState } from "./overlay";

const now = () => new Date().toISOString();

function firstProduct(session: LiveSessionSpec): ProductRecord {
  const product = session.products[0];
  if (!product) {
    throw new Error("LiveSessionSpec must include at least one product");
  }
  return product;
}

function actionId(event: RuntimeEvent, type: string): string {
  return `${event.eventId}-${type}`;
}

export function buildContextEnvelope(
  event: RuntimeEvent,
  session: LiveSessionSpec,
  memory: {
    viewerMemory?: ViewerMemory;
    sessionMemory?: SessionMemory;
    currentProductId?: string;
    currentPromoId?: string;
  } = {}
): ContextEnvelope {
  const text =
    event.type === "viewer_chat" || event.type === "host_transcript" ? event.payload.text : "";
  const product = event.type === "product_switch"
    ? session.products.find((candidate) => candidate.id === event.payload.productId) ?? firstProduct(session)
    : resolveProduct(text, session);
  const promo = session.promos[0];
  const policyDecision = event.type === "viewer_chat" ? classifyViewerMessage(event.payload.text) : undefined;

  return ContextEnvelopeSchema.parse({
    contextId: `ctx-${event.eventId}`,
    event,
    session,
    currentProductId: memory.currentProductId ?? product.id,
    currentPromoId: memory.currentPromoId ?? promo?.id,
    viewerMemory: memory.viewerMemory,
    sessionMemory: memory.sessionMemory ?? {
      ...validSessionMemory,
      sessionId: session.sessionId,
      updatedAt: now()
    },
    retrievalCitations: findRelevantCitations(product, session),
    structuredFacts: {
      productIds: [product.id],
      promoIds: promo ? [promo.id] : [],
      canonicalFields: ["price", "stock", "variants", "sku", "promoEligibility"]
    },
    policyFlags: policyDecision
      ? [
          {
            rule: policyDecision.rule,
            risk: policyDecision.risk,
            reason: policyDecision.reason
          }
        ]
      : []
  });
}

export function decideActions(context: ContextEnvelope): LiveAction[] {
  const { event, session } = context;

  if (event.type === "viewer_chat") {
    return decideViewerChatActions(context);
  }

  if (event.type === "host_transcript") {
    return decideHostTranscriptActions(context);
  }

  if (event.type === "product_switch") {
    return [
      LiveActionSchema.parse({
        actionId: actionId(event, "set_current_product"),
        sessionId: session.sessionId,
        createdAt: now(),
        type: "set_current_product",
        risk: "low",
        reason: "Seller or runtime switched the active structured product.",
        citations: context.retrievalCitations,
        requiresApproval: false,
        payload: {
          kind: "set_current_product",
          productId: event.payload.productId
        }
      }),
      LiveActionSchema.parse({
        actionId: actionId(event, "show_product_card"),
        sessionId: session.sessionId,
        createdAt: now(),
        type: "show_product_card",
        risk: "low",
        reason: "Product card uses structured ProductRecord fields.",
        citations: context.retrievalCitations,
        requiresApproval: false,
        payload: {
          kind: "show_product_card",
          productId: event.payload.productId
        }
      })
    ];
  }

  if (event.type === "promo_update") {
    const promo = session.promos.find((candidate) => candidate.id === event.payload.promoId);
    if (!promo) {
      return [];
    }
    return [
      LiveActionSchema.parse({
        actionId: actionId(event, "show_promo_banner"),
        sessionId: session.sessionId,
        createdAt: now(),
        type: "show_promo_banner",
        risk: "low",
        reason: "Promo banner reflects structured PromoRecord and explicit update event.",
        citations: promo.citations,
        requiresApproval: false,
        payload: {
          kind: "show_promo_banner",
          promoId: promo.id,
          backing: promo.source === "shopee" ? "shopee" : "overlay_only"
        }
      })
    ];
  }

  return [];
}

function decideViewerChatActions(context: ContextEnvelope): LiveAction[] {
  const event = context.event;
  if (event.type !== "viewer_chat") {
    return [];
  }

  const session = context.session;
  const product = resolveProduct(event.payload.text, session);
  const language = detectLanguage(event.payload.text, event.payload.language);
  const decision = classifyViewerMessage(event.payload.text);
  const citations = findRelevantCitations(product, session);

  if (decision.behavior === "send_reply") {
    return [
      LiveActionSchema.parse({
        actionId: actionId(event, "send_reply"),
        sessionId: session.sessionId,
        createdAt: now(),
        type: "send_reply",
        risk: "low",
        reason: decision.reason,
        citations,
        requiresApproval: false,
        payload: {
          kind: "send_reply",
          viewerId: event.payload.viewerId,
          text: buildSafeReplyText(event.payload.text, product, session, language),
          language,
          productId: product.id,
          promoId: session.promos[0]?.id
        }
      }),
      LiveActionSchema.parse({
        actionId: actionId(event, "record_memory"),
        sessionId: session.sessionId,
        createdAt: now(),
        type: "record_memory",
        risk: "low",
        reason: "Remember low-risk viewer product interest for stream recommendations.",
        citations,
        requiresApproval: false,
        payload: {
          kind: "record_memory",
          viewerId: event.payload.viewerId,
          note: `Asked about ${product.title}`,
          productId: product.id
        }
      })
    ];
  }

  if (decision.behavior === "draft_reply") {
    return [
      LiveActionSchema.parse({
        actionId: actionId(event, "draft_reply"),
        sessionId: session.sessionId,
        createdAt: now(),
        type: "draft_reply",
        risk: decision.risk,
        reason: decision.reason,
        citations,
        requiresApproval: true,
        payload: {
          kind: "draft_reply",
          viewerId: event.payload.viewerId,
          text:
            "Eligible unused items can be reviewed under the 7-day return policy. Seller approval is needed before confirming any refund.",
          language,
          productId: product.id
        }
      })
    ];
  }

  if (decision.behavior === "request_approval") {
    return [
      LiveActionSchema.parse({
        actionId: actionId(event, "request_approval"),
        sessionId: session.sessionId,
        createdAt: now(),
        type: "request_approval",
        risk: decision.risk,
        reason: decision.reason,
        citations,
        requiresApproval: true,
        approvalId: `approval-${event.eventId}`,
        payload: {
          kind: "request_approval",
          prompt: "Viewer is negotiating a discount. Confirm whether this is Shopee-backed before posting.",
          proposedPublicText:
            "The current promo is the Live Flash 10% Off deal shown on stream; seller will confirm if extra vouchers apply.",
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        }
      })
    ];
  }

  return [
    LiveActionSchema.parse({
      actionId: actionId(event, "escalate"),
      sessionId: session.sessionId,
      createdAt: now(),
      type: "escalate",
      risk: decision.risk,
      reason: decision.reason,
      citations,
      requiresApproval: true,
      payload: {
        kind: "escalate",
        severity: decision.risk === "blocked" ? "blocked" : "high",
        sellerMessage: `Sensitive viewer message from ${event.payload.viewerName}: ${event.payload.text}`,
        suggestedScript:
          "Acknowledge the concern briefly and say the seller will check order details privately after the live."
      }
    })
  ];
}

function decideHostTranscriptActions(context: ContextEnvelope): LiveAction[] {
  const event = context.event;
  if (event.type !== "host_transcript") {
    return [];
  }

  const actions: LiveAction[] = [
    LiveActionSchema.parse({
      actionId: actionId(event, "update_caption"),
      sessionId: context.session.sessionId,
      createdAt: now(),
      type: "update_caption",
      risk: "low",
      reason: "Caption mirrors host transcript.",
      citations: context.retrievalCitations,
      requiresApproval: false,
      payload: {
        kind: "update_caption",
        text: event.payload.text,
        language: event.payload.language,
        visible: true
      }
    })
  ];

  const translation = translateCaption(event.payload.text, event.payload.language);
  if (event.payload.language !== "en" && context.session.targetLanguages.includes("en")) {
    actions.push(
      LiveActionSchema.parse({
        actionId: actionId(event, "emit_translation"),
        sessionId: context.session.sessionId,
        createdAt: now(),
        type: "emit_translation",
        risk: "low",
        reason: "Translated caption for target-language viewers.",
        citations: context.retrievalCitations,
        requiresApproval: false,
        payload: {
          kind: "emit_translation",
          sourceLanguage: event.payload.language,
          targetLanguage: "en",
          text: translation
        }
      })
    );
  }

  if (isFlashPromoAnnouncement(event) && context.session.promos[0]) {
    const promo = context.session.promos[0];
    actions.push(
      LiveActionSchema.parse({
        actionId: actionId(event, "show_promo_banner"),
        sessionId: context.session.sessionId,
        createdAt: now(),
        type: "show_promo_banner",
        risk: "low",
        reason: "Host announced a flash promo; overlay marks whether it is Shopee-backed.",
        citations: promo.citations,
        requiresApproval: false,
        payload: {
          kind: "show_promo_banner",
          promoId: promo.id,
          backing: promo.source === "shopee" ? "shopee" : "overlay_only"
        }
      })
    );
  }

  return actions;
}

export function createAuditEvents(
  event: RuntimeEvent,
  context: ContextEnvelope,
  actions: LiveAction[]
): AuditEvent[] {
  const input = AuditEventSchema.parse({
    auditId: `audit-${event.eventId}-input`,
    sessionId: event.sessionId,
    timestamp: now(),
    kind: "input",
    actor: event.source === "viewer" ? "viewer" : event.source === "host" ? "host" : "runtime",
    reason: "Runtime received event.",
    event
  });

  const contextEvent = AuditEventSchema.parse({
    auditId: `audit-${event.eventId}-context`,
    sessionId: event.sessionId,
    timestamp: now(),
    kind: "context",
    actor: "runtime",
    reason: "Runtime assembled structured context and policy flags.",
    context
  });

  const actionEvents = actions.map((action) =>
    AuditEventSchema.parse({
      auditId: `audit-${action.actionId}`,
      sessionId: event.sessionId,
      timestamp: now(),
      kind: "model_action",
      actor: "runtime",
      reason: action.reason,
      action
    })
  );

  return [input, contextEvent, ...actionEvents];
}

export function routeRuntimeEvent(event: RuntimeEvent, session: LiveSessionSpec) {
  const context = buildContextEnvelope(event, session);
  const actions = decideActions(context);
  const toolResults = executeFakeAdapters(actions);
  const auditEvents = [
    ...createAuditEvents(event, context, actions),
    ...toolResults.map((toolResult) =>
      AuditEventSchema.parse({
        auditId: `audit-${toolResult.actionId}-${toolResult.adapter}`,
        sessionId: event.sessionId,
        timestamp: now(),
        kind: "tool_result",
        actor: toolResult.adapter === "fake-overlay" ? "overlay" : "extension",
        reason: "Fake adapter executed deterministic command.",
        toolResult
      })
    )
  ];
  const overlayState = applyOverlayActions(session, actions, createInitialOverlayState(session));

  return {
    context,
    actions,
    toolResults,
    auditEvents,
    overlayState
  };
}
