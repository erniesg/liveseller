import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import {
  ProductReviewPlanSchema,
  type ProductReviewPlan,
  type ShopeeCreateProductCommand
} from "@liveseller/contracts";
import {
  LIVESELLER_CODEX_REVIEW_TOOLS,
  executeCodexReviewToolCall,
  type CodexImageEditRunner,
  type CodexOperatorEvent,
  type CodexReviewToolCall,
  type CodexReviewToolName,
  type CodexReviewToolState
} from "./codexAppServerReview";

const DEFAULT_PORT = 8788;

const ToolCallSchema = z.object({
  tool: z.enum(LIVESELLER_CODEX_REVIEW_TOOLS.map((tool) => tool.name) as [CodexReviewToolName, ...CodexReviewToolName[]]),
  arguments: z.unknown().default({})
}).strict();

const ToolRequestSchema = z.object({
  reviewPlan: ProductReviewPlanSchema,
  createProductCommands: z.array(z.unknown()).default([]),
  calls: z.array(ToolCallSchema).min(1)
}).strict();

const SellerTurnRequestSchema = z.object({
  reviewPlan: ProductReviewPlanSchema,
  createProductCommands: z.array(z.unknown()).default([]),
  sellerText: z.string().min(1),
  productId: z.string().min(1).optional()
}).strict();

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function now(): string {
  return new Date().toISOString();
}

function operatorEvent(event: Omit<CodexOperatorEvent, "timestamp">): CodexOperatorEvent {
  return {
    ...event,
    timestamp: now()
  };
}

function buildDeterministicImageRunner(): CodexImageEditRunner {
  return async ({ reviewPlan }) => ({
    completedAt: now(),
    taskOutputs: reviewPlan.generationTasks
      .filter((task) => task.status === "pending" && task.taskType === "image_edit")
      .map((task) => ({
        taskId: task.taskId,
        outputRefs: [`generated/operator-${task.taskId}.png`]
      }))
  });
}

async function runToolCalls(
  initialState: CodexReviewToolState,
  calls: CodexReviewToolCall[]
): Promise<CodexReviewToolState & { operatorEvents: CodexOperatorEvent[] }> {
  let state = initialState;
  const operatorEvents: CodexOperatorEvent[] = [
    operatorEvent({
      type: "session_started",
      message: "Codex operator HTTP review session started."
    })
  ];

  for (const call of calls) {
    operatorEvents.push(operatorEvent({
      type: "tool_call_received",
      message: `Seller UI requested ${call.tool}.`,
      tool: call.tool,
      callId: `http-${operatorEvents.length}`
    }));
    const result = await executeCodexReviewToolCall(state, call, {
      imageEditRunner: buildDeterministicImageRunner()
    });
    state = {
      reviewPlan: result.reviewPlan,
      createProductCommands: result.createProductCommands
    };
    operatorEvents.push(operatorEvent({
      type: "tool_result_sent",
      message: `Operator returned validated result for ${call.tool}.`,
      tool: call.tool,
      callId: `http-${operatorEvents.length}`
    }));
  }

  operatorEvents.push(operatorEvent({
    type: "turn_completed",
    message: "Codex operator HTTP review turn completed."
  }));

  return {
    ...state,
    operatorEvents
  };
}

function firstReviewRound(plan: ProductReviewPlan, productId: string) {
  const item = plan.items.find((candidate) => candidate.productId === productId) ?? plan.items[0];
  return {
    item,
    round: item?.reviewRounds.at(-1)
  };
}

function buildSellerTurnCalls(plan: ProductReviewPlan, sellerText: string, productId?: string): CodexReviewToolCall[] {
  const target = firstReviewRound(plan, productId ?? plan.items[0]?.productId ?? "");
  if (!target.item || !target.round) {
    return [];
  }
  const lower = sellerText.toLowerCase();
  const interpretedIntent = lower.includes("approve")
    ? "approve"
    : lower.includes("reject")
      ? "reject"
      : lower.includes("more") || lower.includes("image") || lower.includes("background")
        ? "more_options"
        : lower.includes("edit") || lower.includes("short")
          ? "edit_request"
          : "unknown";
  const calls: CodexReviewToolCall[] = [
    {
      tool: "liveseller_record_seller_review_response",
      arguments: {
        response: {
          responseId: `response-${target.item.productId}-${Date.now()}`,
          roundId: target.round.roundId,
          productId: target.item.productId,
          text: sellerText,
          receivedAt: now(),
          interpretedIntent,
          citations: target.item.product.evidence
        }
      }
    }
  ];

  if (lower.includes("image") || lower.includes("background")) {
    calls.push({
      tool: "liveseller_generate_image_edits",
      arguments: {}
    });
  }

  if (lower.includes("short")) {
    calls.push({
      tool: "liveseller_apply_ai_draft_update",
      arguments: {
        update: {
          updateId: `update-${target.item.productId}-${Date.now()}`,
          productId: target.item.productId,
          actor: "ai",
          updatedAt: now(),
          reason: "Seller asked Codex operator to shorten the product title.",
          patch: {
            title: target.item.product.title.split(/\s+/u).slice(0, 6).join(" ")
          },
          citations: target.item.product.evidence
        }
      }
    });
  }

  return calls;
}

export function createOperatorHttpServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        json(res, 204, {});
        return;
      }

      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, {
          ok: true,
          service: "liveseller-operator",
          tools: LIVESELLER_CODEX_REVIEW_TOOLS.map((tool) => tool.name)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/operator/review-tools") {
        const payload = ToolRequestSchema.parse(await readJson(req));
        const calls = payload.calls.map((call) => ({
          tool: call.tool,
          arguments: call.arguments ?? {}
        }));
        const result = await runToolCalls(
          {
            reviewPlan: payload.reviewPlan,
            createProductCommands: payload.createProductCommands as ShopeeCreateProductCommand[]
          },
          calls
        );
        json(res, 200, result);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/operator/seller-review-turn") {
        const payload = SellerTurnRequestSchema.parse(await readJson(req));
        const calls = buildSellerTurnCalls(payload.reviewPlan, payload.sellerText, payload.productId);
        const result = await runToolCalls(
          {
            reviewPlan: payload.reviewPlan,
            createProductCommands: payload.createProductCommands as ShopeeCreateProductCommand[]
          },
          calls
        );
        json(res, 200, {
          ...result,
          interpretedCalls: calls.map((call) => call.tool)
        });
        return;
      }

      json(res, 404, { ok: false, message: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      json(res, 400, { ok: false, message });
    }
  });
}

export async function startOperatorHttpServer(port = Number(process.env.LIVESELLER_OPERATOR_PORT || DEFAULT_PORT)) {
  const server = createOperatorHttpServer();
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = await startOperatorHttpServer();
  console.log(`LiveSeller operator HTTP server listening on ${started.url}`);
}
