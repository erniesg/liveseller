import type { AuditEvent, LiveSessionSpec } from "@liveseller/contracts";

export type PostStreamSummary = {
  sessionId: string;
  totalEvents: number;
  publicReplies: number;
  drafts: number;
  escalations: number;
  approvalsRequested: number;
  recommendations: string[];
};

export function summarizeStream(session: LiveSessionSpec, auditEvents: AuditEvent[]): PostStreamSummary {
  const actions = auditEvents.flatMap((event) => (event.action ? [event.action] : []));
  const publicReplies = actions.filter((action) => action.type === "send_reply").length;
  const drafts = actions.filter((action) => action.type === "draft_reply").length;
  const escalations = actions.filter((action) => action.type === "escalate").length;
  const approvalsRequested = actions.filter((action) => action.type === "request_approval").length;
  const topProduct = session.products[0];
  if (!topProduct) {
    throw new Error("LiveSessionSpec must include at least one product");
  }

  return {
    sessionId: session.sessionId,
    totalEvents: auditEvents.length,
    publicReplies,
    drafts,
    escalations,
    approvalsRequested,
    recommendations: [
      `Start the next stream with ${topProduct.title}; it has clear structured price and stock facts.`,
      "Verify overlay-only promos in Shopee Seller Centre before promising them publicly.",
      "Keep refund, fake-product, legal, and discount-negotiation replies behind seller approval."
    ]
  };
}
