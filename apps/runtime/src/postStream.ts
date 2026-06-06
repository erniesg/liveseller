import type { AuditEvent, LiveSessionSpec, SessionMemory } from "@liveseller/contracts";
import { buildSessionMemoryFromAudit } from "./memory";

export type PostStreamSummary = {
  sessionId: string;
  totalEvents: number;
  publicReplies: number;
  drafts: number;
  escalations: number;
  approvalsRequested: number;
  sessionMemory: SessionMemory;
  recommendations: string[];
};

export function summarizeStream(session: LiveSessionSpec, auditEvents: AuditEvent[]): PostStreamSummary {
  const actions = auditEvents.flatMap((event) => (event.action ? [event.action] : []));
  const publicReplies = actions.filter((action) => action.type === "send_reply").length;
  const drafts = actions.filter((action) => action.type === "draft_reply").length;
  const escalations = actions.filter((action) => action.type === "escalate").length;
  const approvalsRequested = actions.filter((action) => action.type === "request_approval").length;
  if (!session.products[0]) {
    throw new Error("LiveSessionSpec must include at least one product");
  }
  const sessionMemory = buildSessionMemoryFromAudit(session, auditEvents);

  return {
    sessionId: session.sessionId,
    totalEvents: auditEvents.length,
    publicReplies,
    drafts,
    escalations,
    approvalsRequested,
    sessionMemory,
    recommendations: sessionMemory.recommendations
  };
}
