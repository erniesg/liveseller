import {
  validProductReviewPlan,
  validSellerFreeFormReviewResponse
} from "@liveseller/contracts";
import {
  LIVESELLER_CODEX_REVIEW_TOOLS,
  buildCodexAppServerReviewTurn,
  runCodexAppServerReviewSession
} from "./codexAppServerReview";

const turn = buildCodexAppServerReviewTurn({
  cwd: process.cwd(),
  threadId: "thread-live-seller-demo-review",
  reviewPlan: validProductReviewPlan,
  sellerText: "Make the title shorter and generate another image option."
});

const session = await runCodexAppServerReviewSession(
  {
    cwd: process.cwd(),
    threadId: "thread-live-seller-demo-review",
    reviewPlan: validProductReviewPlan,
    sellerText: "Make the title shorter and generate another image option."
  },
  {
    send: async () => undefined,
    events: async function* () {
      yield {
        id: 4,
        method: "item/tool/call",
        params: {
          threadId: "thread-live-seller-demo-review",
          turnId: "turn-demo-001",
          callId: "call-demo-record-response",
          namespace: null,
          tool: "liveseller_record_seller_review_response",
          arguments: {
            response: {
              ...validSellerFreeFormReviewResponse,
              text: "Make the title shorter and generate another image option.",
              interpretedIntent: "edit_request"
            }
          }
        }
      };
      yield {
        method: "turn/completed",
        params: {
          reason: "demo_tool_result_applied"
        }
      }
    }
  }
);

console.log(JSON.stringify({
  appServerProtocol: {
    initializeMethod: turn.initialize.method,
    threadStartMethod: turn.threadStart.method,
    turnStartMethod: turn.turnStart.method,
    dynamicTools: LIVESELLER_CODEX_REVIEW_TOOLS.map((tool) => tool.name)
  },
  deterministicToolResult: {
    reviewStatus: session.reviewPlan.status,
    reviewRoundCount: session.reviewPlan.items[0]?.reviewRounds.length,
    createProductCommandCount: session.createProductCommands.length,
    operatorEvents: session.operatorEvents
  },
  nextTransportStep: "Connect the CodexAppServerTransport adapter to a live `codex app-server --listen stdio://|unix://|ws://...` process."
}, null, 2));
