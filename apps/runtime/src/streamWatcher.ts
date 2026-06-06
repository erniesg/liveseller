import {
  type AuditEvent,
  type EvidenceCitation,
  type LiveAction,
  type LiveSessionSpec,
  type RollingStreamSummary,
  type RuntimeEvent,
  type StreamMoment,
  RollingStreamSummarySchema,
  StreamMomentSchema
} from "@liveseller/contracts";
import { summarizeStream } from "./postStream";

export type RoutedRuntimeEvent = {
  actions: LiveAction[];
  auditEvents: AuditEvent[];
};

export type StreamAccumulatorOptions = {
  checkpointEveryEvents?: number;
  maxMoments?: number;
};

export type StreamAccumulator = {
  observe(event: RuntimeEvent, routed: RoutedRuntimeEvent): RollingStreamSummary | undefined;
  snapshot(): RollingStreamSummary;
  finalize(event?: RuntimeEvent): RollingStreamSummary;
};

type MutableState = {
  status: "active" | "closed";
  checkpointSeq: number;
  eventCount: number;
  auditEventCount: number;
  actions: LiveAction[];
  auditEvents: AuditEvent[];
  moments: StreamMoment[];
  topQuestions: string[];
  orders: number;
  viewerPeak: number;
  currentProductId?: string;
  currentPromoId?: string;
  updatedAt: string;
  finalizedAt?: string;
};

const defaultOptions = {
  checkpointEveryEvents: 3,
  maxMoments: 20
};

function uniquePush(values: string[], value: string, limit: number): string[] {
  const next = values.filter((existing) => existing !== value);
  next.unshift(value);
  return next.slice(0, limit);
}

function firstCitation(actions: LiveAction[]): EvidenceCitation[] {
  return actions.find((action) => action.citations.length > 0)?.citations ?? [];
}

function actionProductId(action: LiveAction): string | undefined {
  return "productId" in action.payload ? action.payload.productId : undefined;
}

function actionPromoId(action: LiveAction): string | undefined {
  return "promoId" in action.payload ? action.payload.promoId : undefined;
}

function buildActionMoments(event: RuntimeEvent, actions: LiveAction[], auditIds: string[]): StreamMoment[] {
  return actions.flatMap((action) => {
    if (action.type === "escalate") {
      return [
        StreamMomentSchema.parse({
          momentId: `moment-${action.actionId}`,
          sessionId: event.sessionId,
          eventId: event.eventId,
          timestamp: event.timestamp,
          kind: "risk_escalation",
          title: "Risk escalated",
          detail: action.reason,
          productId: actionProductId(action),
          promoId: actionPromoId(action),
          risk: action.risk,
          actionIds: [action.actionId],
          auditIds,
          citations: action.citations
        })
      ];
    }

    if (action.requiresApproval) {
      return [
        StreamMomentSchema.parse({
          momentId: `moment-${action.actionId}`,
          sessionId: event.sessionId,
          eventId: event.eventId,
          timestamp: event.timestamp,
          kind: "approval_required",
          title: "Seller approval required",
          detail: action.reason,
          productId: actionProductId(action),
          promoId: actionPromoId(action),
          risk: action.risk,
          actionIds: [action.actionId],
          auditIds,
          citations: action.citations
        })
      ];
    }

    return [];
  });
}

function buildEventMoment(event: RuntimeEvent, actions: LiveAction[], auditIds: string[]): StreamMoment | undefined {
  if (event.type === "viewer_chat") {
    return StreamMomentSchema.parse({
      momentId: `moment-${event.eventId}`,
      sessionId: event.sessionId,
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: "viewer_question",
      title: event.payload.viewerName,
      detail: event.payload.text,
      productId: actionProductId(actions[0]!),
      promoId: actionPromoId(actions[0]!),
      risk: actions.find((action) => action.risk !== "low")?.risk,
      actionIds: actions.map((action) => action.actionId),
      auditIds,
      citations: firstCitation(actions)
    });
  }

  if (event.type === "host_transcript") {
    return StreamMomentSchema.parse({
      momentId: `moment-${event.eventId}`,
      sessionId: event.sessionId,
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: "host_caption",
      title: "Host caption",
      detail: event.payload.text,
      productId: actionProductId(actions[0]!),
      promoId: actionPromoId(actions[0]!),
      actionIds: actions.map((action) => action.actionId),
      auditIds,
      citations: firstCitation(actions)
    });
  }

  if (event.type === "product_switch") {
    return StreamMomentSchema.parse({
      momentId: `moment-${event.eventId}`,
      sessionId: event.sessionId,
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: "product_switch",
      title: "Product switched",
      detail: event.payload.productId,
      productId: event.payload.productId,
      actionIds: actions.map((action) => action.actionId),
      auditIds,
      citations: firstCitation(actions)
    });
  }

  if (event.type === "promo_update") {
    return StreamMomentSchema.parse({
      momentId: `moment-${event.eventId}`,
      sessionId: event.sessionId,
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: "promo_update",
      title: "Promo updated",
      detail: `${event.payload.remainingQuantity} remaining`,
      promoId: event.payload.promoId,
      actionIds: actions.map((action) => action.actionId),
      auditIds,
      citations: firstCitation(actions)
    });
  }

  if (event.type === "metric_update") {
    return StreamMomentSchema.parse({
      momentId: `moment-${event.eventId}`,
      sessionId: event.sessionId,
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: "performance_signal",
      title: "Performance signal",
      detail: `${event.payload.viewerCount} viewers, ${event.payload.orders} orders`,
      actionIds: actions.map((action) => action.actionId),
      auditIds,
      citations: []
    });
  }

  if (event.type === "stream_lifecycle") {
    return StreamMomentSchema.parse({
      momentId: `moment-${event.eventId}`,
      sessionId: event.sessionId,
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: "lifecycle",
      title: `Stream ${event.payload.status}`,
      detail: event.payload.reason ?? event.payload.status,
      actionIds: actions.map((action) => action.actionId),
      auditIds,
      citations: []
    });
  }

  return undefined;
}

function buildSnapshot(session: LiveSessionSpec, state: MutableState): RollingStreamSummary {
  const post = summarizeStream(session, state.auditEvents);
  const actions = state.actions;

  return RollingStreamSummarySchema.parse({
    summaryId: `rolling-${session.sessionId}`,
    sessionId: session.sessionId,
    status: state.status,
    checkpointSeq: state.checkpointSeq,
    updatedAt: state.updatedAt,
    eventCount: state.eventCount,
    auditEventCount: state.auditEventCount,
    actionCount: actions.length,
    publicReplies: actions.filter((action) => action.type === "send_reply").length,
    drafts: actions.filter((action) => action.type === "draft_reply").length,
    escalations: actions.filter((action) => action.type === "escalate").length,
    approvalsRequested: actions.filter((action) => action.type === "request_approval").length,
    orders: state.orders,
    viewerPeak: state.viewerPeak,
    currentProductId: state.currentProductId,
    currentPromoId: state.currentPromoId,
    topQuestions: state.topQuestions,
    moments: state.moments,
    recommendations: post.recommendations,
    finalizedAt: state.finalizedAt
  });
}

export function createStreamAccumulator(
  session: LiveSessionSpec,
  options: StreamAccumulatorOptions = {}
): StreamAccumulator {
  const checkpointEveryEvents = options.checkpointEveryEvents ?? defaultOptions.checkpointEveryEvents;
  const maxMoments = options.maxMoments ?? defaultOptions.maxMoments;
  const firstProduct = session.products[0];
  const state: MutableState = {
    status: "active",
    checkpointSeq: 0,
    eventCount: 0,
    auditEventCount: 0,
    actions: [],
    auditEvents: [],
    moments: [],
    topQuestions: [],
    orders: 0,
    viewerPeak: 0,
    currentProductId: firstProduct?.id,
    currentPromoId: session.promos[0]?.id,
    updatedAt: new Date().toISOString()
  };

  function appendMoments(moments: StreamMoment[]) {
    state.moments = [...moments, ...state.moments].slice(0, maxMoments);
  }

  function checkpoint(now: string) {
    state.checkpointSeq += 1;
    state.updatedAt = now;
    return buildSnapshot(session, state);
  }

  return {
    observe(event, routed) {
      if (state.status === "closed") {
        return buildSnapshot(session, state);
      }

      state.eventCount += 1;
      state.auditEvents.push(...routed.auditEvents);
      state.auditEventCount += routed.auditEvents.length;
      state.actions.push(...routed.actions);
      state.updatedAt = event.timestamp;

      if (event.type === "viewer_chat") {
        state.topQuestions = uniquePush(state.topQuestions, event.payload.text, 5);
      } else if (event.type === "product_switch") {
        state.currentProductId = event.payload.productId;
      } else if (event.type === "promo_update") {
        state.currentPromoId = event.payload.promoId;
      } else if (event.type === "metric_update") {
        state.orders = Math.max(state.orders, event.payload.orders);
        state.viewerPeak = Math.max(state.viewerPeak, event.payload.viewerCount);
      }

      const auditIds = routed.auditEvents.map((auditEvent) => auditEvent.auditId);
      const eventMoment = buildEventMoment(event, routed.actions, auditIds);
      appendMoments([
        ...buildActionMoments(event, routed.actions, auditIds),
        ...(eventMoment ? [eventMoment] : [])
      ]);

      if (event.type === "stream_lifecycle" && event.payload.status === "closed") {
        return this.finalize(event);
      }

      if (state.eventCount % checkpointEveryEvents === 0) {
        return checkpoint(event.timestamp);
      }

      return undefined;
    },

    snapshot() {
      return buildSnapshot(session, state);
    },

    finalize(event) {
      state.status = "closed";
      state.finalizedAt = event?.timestamp ?? new Date().toISOString();
      return checkpoint(state.finalizedAt);
    }
  };
}
