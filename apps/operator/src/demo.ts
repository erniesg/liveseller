import {
  validProductReviewPlan,
  validSellerFreeFormReviewResponse
} from "@liveseller/contracts";
import {
  LIVESELLER_CODEX_REVIEW_TOOLS,
  buildCodexAppServerReviewTurn,
  executeCodexReviewToolCall
} from "./codexAppServerReview";

const turn = buildCodexAppServerReviewTurn({
  cwd: process.cwd(),
  threadId: "thread-live-seller-demo-review",
  reviewPlan: validProductReviewPlan,
  sellerText: "Make the title shorter and generate another image option."
});

const updated = await executeCodexReviewToolCall(
  { reviewPlan: validProductReviewPlan, createProductCommands: [] },
  {
    tool: "liveseller_record_seller_review_response",
    arguments: {
      response: {
        ...validSellerFreeFormReviewResponse,
        text: "Make the title shorter and generate another image option.",
        interpretedIntent: "edit_request"
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
    reviewStatus: updated.reviewPlan.status,
    reviewRoundCount: updated.reviewPlan.items[0]?.reviewRounds.length,
    createProductCommandCount: updated.createProductCommands.length,
    contentItems: updated.contentItems
  },
  nextTransportStep: "Connect these JSON-RPC messages to `codex app-server` stdio/unix/ws transport and handle item/tool/call requests."
}, null, 2));
