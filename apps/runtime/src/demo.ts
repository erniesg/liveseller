import {
  type LanguageCode,
  type RuntimeEvent,
  validLiveSessionSpec,
  validRuntimeEvents
} from "@liveseller/contracts";
import { routeRuntimeEvent } from "./runtime";
import { summarizeStream } from "./postStream";

function viewerEvent(
  eventId: string,
  text: string,
  language: LanguageCode,
  viewerId = "viewer-demo"
): RuntimeEvent {
  return {
    eventId,
    sessionId: validLiveSessionSpec.sessionId,
    timestamp: "2026-06-06T02:05:00.000Z",
    source: "viewer",
    type: "viewer_chat",
    payload: {
      viewerId,
      viewerName: "Demo Viewer",
      text,
      language
    }
  };
}

const [seedViewerEvent, seedHostEvent] = validRuntimeEvents;
if (!seedViewerEvent || !seedHostEvent) {
  throw new Error("Runtime demo requires seeded viewer and host events.");
}

const demoEvents: RuntimeEvent[] = [
  seedViewerEvent,
  viewerEvent("event-demo-safe-zh", "这件透气T恤多少钱？", "zh", "viewer-zh"),
  viewerEvent("event-demo-safe-ms", "berapa harga cable organizer?", "ms", "viewer-ms"),
  viewerEvent("event-demo-safe-ta", "இந்த tumbler விலை என்ன?", "ta", "viewer-ta"),
  viewerEvent("event-demo-refund", "I want a refund right now", "en", "viewer-risk-refund"),
  viewerEvent("event-demo-fake", "This looks fake and counterfeit", "en", "viewer-risk-fake"),
  viewerEvent("event-demo-legal", "My lawyer will sue you", "en", "viewer-risk-legal"),
  viewerEvent("event-demo-fraud", "This is a scam and fraud", "en", "viewer-risk-fraud"),
  viewerEvent("event-demo-discount", "Give me extra discount cheaper best price", "en", "viewer-risk-discount"),
  seedHostEvent
];

const routed = demoEvents.map((event) => routeRuntimeEvent(event, validLiveSessionSpec));
const auditEvents = routed.flatMap((result) => result.auditEvents);
const actions = routed.flatMap((result) => result.actions);
const riskyActions = actions.filter((action) => action.requiresApproval);
const policyAuditEvents = auditEvents.filter((event) => event.kind === "policy");
const approvalAuditEvents = auditEvents.filter((event) => event.kind === "approval");
const overlayResult = [...routed]
  .reverse()
  .find((result) =>
    result.actions.some((action) =>
      ["update_caption", "emit_translation", "show_promo_banner", "show_product_card"].includes(action.type)
    )
  );

console.log(
  JSON.stringify(
    {
      checkpointProof: {
        safeMultilingualReplies: ["en", "zh", "ms", "ta"].every((language) =>
          actions.some(
            (action) =>
              action.type === "send_reply" &&
              action.payload.kind === "send_reply" &&
              action.payload.language === language
          )
        ),
        riskyAutoSendBlocked: [
          "refund_request",
          "fake_or_counterfeit",
          "legal_threat",
          "fraud_allegation",
          "discount_negotiation"
        ].every((rule) =>
          auditEvents.some(
            (auditEvent) =>
              auditEvent.kind === "context" &&
              auditEvent.context?.policyFlags.some((flag) => flag.rule === rule) &&
              !actions.some(
                (action) =>
                  action.type === "send_reply" &&
                  action.actionId.startsWith(auditEvent.context?.event.eventId ?? "missing-event")
              )
          )
        ),
        chineseCaptionTranslated: actions.some((action) => action.type === "emit_translation"),
        riskyPublicSends: riskyActions.filter((action) => action.type === "send_reply").length,
        approvalsRecorded: approvalAuditEvents.length,
        policiesRecorded: policyAuditEvents.length
      },
      actions: actions.map((action) => ({
        type: action.type,
        risk: action.risk,
        requiresApproval: action.requiresApproval,
        approvalId: action.approvalId,
        reason: action.reason
      })),
      policyAudit: policyAuditEvents.map((event) => ({
        auditId: event.auditId,
        rule: event.context?.policyFlags[0]?.rule,
        risk: event.context?.policyFlags[0]?.risk,
        reason: event.reason
      })),
      approvalAudit: approvalAuditEvents.map((event) => ({
        approvalId: event.approval?.approvalId,
        actionId: event.approval?.actionId,
        status: event.approval?.status,
        actionType: event.approval?.originalAction.type,
        risk: event.approval?.originalAction.risk
      })),
      overlayState: overlayResult?.overlayState,
      summary: summarizeStream(validLiveSessionSpec, auditEvents)
    },
    null,
    2
  )
);
