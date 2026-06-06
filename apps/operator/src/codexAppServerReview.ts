import { z } from "zod";
import type { ServerNotification } from "./generated/app-server/ServerNotification";
import type { ServerRequest } from "./generated/app-server/ServerRequest";
import type { DynamicToolCallParams } from "./generated/app-server/v2/DynamicToolCallParams";
import {
  type AiDraftUpdate,
  type ProductReviewDecision,
  type ProductReviewPlan,
  type SellerFreeFormReviewResponse,
  type ShopeeCreateProductCommand,
  AiDraftUpdateSchema,
  ProductReviewDecisionSchema,
  ProductReviewPlanSchema,
  SellerFreeFormReviewResponseSchema
} from "@liveseller/contracts";
import {
  applyAiDraftUpdate,
  runPendingPrepGenerationTasks
} from "@liveseller/prep";
import {
  buildShopeeCreateProductCommands,
  recordProductReviewDecision,
  recordSellerReviewResponse
} from "@liveseller/runtime";

export type CodexReviewToolName =
  | "liveseller_record_seller_review_response"
  | "liveseller_apply_ai_draft_update"
  | "liveseller_run_generation_tasks"
  | "liveseller_record_product_review_decision"
  | "liveseller_build_create_product_commands";

export type CodexDynamicTool = {
  name: CodexReviewToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const LIVESELLER_CODEX_REVIEW_TOOLS: CodexDynamicTool[] = [
  {
    name: "liveseller_record_seller_review_response",
    description:
      "Record the interpreted seller response for a ProductReviewPlan review round. Use for approve/reject/edit/more-options text before mutating the plan.",
    inputSchema: {
      type: "object",
      required: ["response"],
      properties: {
        response: {
          type: "object",
          description: "A SellerFreeFormReviewResponse contract payload with interpretedIntent."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "liveseller_apply_ai_draft_update",
    description:
      "Apply an AI draft update to title, listing draft, seller guidance, or image prompts. Locked structured commerce fields remain untouched.",
    inputSchema: {
      type: "object",
      required: ["update"],
      properties: {
        update: {
          type: "object",
          description: "An AiDraftUpdate contract payload."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "liveseller_run_generation_tasks",
    description:
      "Attach server-side generation outputs, such as image-edit refs, to pending prep generation tasks after the generation worker has completed.",
    inputSchema: {
      type: "object",
      required: ["taskOutputs"],
      properties: {
        completedAt: { type: "string", description: "ISO timestamp for completed generation tasks." },
        taskOutputs: {
          type: "array",
          items: {
            type: "object",
            required: ["taskId", "outputRefs"],
            properties: {
              taskId: { type: "string" },
              outputRefs: { type: "array", items: { type: "string" } },
              error: { type: "string" }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "liveseller_record_product_review_decision",
    description:
      "Record the seller's final approve, reject, or edited decision for one reviewed product.",
    inputSchema: {
      type: "object",
      required: ["decision"],
      properties: {
        decision: {
          type: "object",
          description: "A ProductReviewDecision contract payload."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "liveseller_build_create_product_commands",
    description:
      "Build deterministic Shopee create-product commands from approved or edited review items only.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

export type CodexJsonRpcRequest = {
  id?: number;
  method: string;
  params?: Record<string, unknown>;
};

export type CodexJsonRpcSuccessResponse = {
  id?: number;
  result: unknown;
};

export type CodexJsonRpcResponse = {
  id: number;
  result?: unknown;
  error?: unknown;
};

export type CodexJsonRpcMessage =
  | CodexJsonRpcRequest
  | CodexJsonRpcResponse
  | ServerRequest
  | ServerNotification;

export type CodexReviewTurnOptions = {
  cwd: string;
  threadId?: string;
  reviewPlan: ProductReviewPlan;
  sellerText: string;
  onTrace?: (event: {
    direction: "in" | "out" | "operator";
    method?: string;
    id?: number;
    message?: string;
    payload?: unknown;
  }) => void;
};

export type CodexReviewTurnMessages = {
  initialize: CodexJsonRpcRequest;
  initialized: CodexJsonRpcRequest;
  threadStart: CodexJsonRpcRequest & {
    params: {
      cwd: string;
      dynamicTools: CodexDynamicTool[];
    };
  };
  turnStart: CodexJsonRpcRequest & {
    params: {
      threadId?: string;
      input: Array<{ type: "text"; text: string }>;
    };
  };
};

export type CodexReviewToolCall = {
  tool: CodexReviewToolName;
  arguments: unknown;
};

export type CodexReviewToolState = {
  reviewPlan: ProductReviewPlan;
  createProductCommands: ShopeeCreateProductCommand[];
};

export type CodexReviewToolResult = CodexReviewToolState & {
  contentItems: Array<{ type: "text"; text: string }>;
};

export type CodexOperatorEvent = {
  type: "session_started" | "tool_call_received" | "tool_result_sent" | "turn_completed";
  message: string;
  timestamp: string;
  tool?: CodexReviewToolName;
  callId?: string;
};

export type CodexAppServerTransport = {
  send(message: CodexJsonRpcRequest | CodexJsonRpcSuccessResponse): Promise<void>;
  events(): AsyncIterable<CodexJsonRpcMessage>;
};

export type CodexReviewSessionResult = CodexReviewToolState & {
  threadId?: string;
  operatorEvents: CodexOperatorEvent[];
};

const SellerResponseArgsSchema = z.object({
  response: SellerFreeFormReviewResponseSchema
}).strict();

const AiDraftUpdateArgsSchema = z.object({
  update: AiDraftUpdateSchema
}).strict();

const ProductReviewDecisionArgsSchema = z.object({
  decision: ProductReviewDecisionSchema
}).strict();

const GenerationTaskArgsSchema = z.object({
  completedAt: z.string().datetime().optional(),
  taskOutputs: z.array(
    z.object({
      taskId: z.string().min(1),
      outputRefs: z.array(z.string().min(1)),
      error: z.string().min(1).optional()
    }).strict()
  )
}).strict();

function buildReviewPrompt(options: CodexReviewTurnOptions): string {
  return [
    "You are the Codex-native LiveSeller operator for a seller review workflow.",
    "Interpret the seller's free-form reply, propose options every round, and call LiveSeller dynamic tools instead of hand-writing state.",
    "Allowed outcomes: record seller response, apply AI draft update, run more image generation tasks, record approve/reject/edit decision, or build publish commands after approval.",
    "Never create Shopee publish commands unless a ProductReviewDecision is approved or edited.",
    "",
    `Seller free-form response:\n${options.sellerText}`,
    "",
    `Available tools:\n${LIVESELLER_CODEX_REVIEW_TOOLS.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}`,
    "",
    `ProductReviewPlan:\n${JSON.stringify(ProductReviewPlanSchema.parse(options.reviewPlan), null, 2)}`
  ].join("\n");
}

function content(action: string, state: CodexReviewToolState): CodexReviewToolResult["contentItems"] {
  return [
    {
      type: "text",
      text: [
        `LiveSeller tool applied: ${action}`,
        `reviewPlanStatus=${state.reviewPlan.status}`,
        `productCount=${state.reviewPlan.items.length}`,
        `createProductCommandCount=${state.createProductCommands.length}`
      ].join("; ")
    }
  ];
}

function now(): string {
  return new Date().toISOString();
}

function operatorEvent(
  event: Omit<CodexOperatorEvent, "timestamp">
): CodexOperatorEvent {
  return {
    ...event,
    timestamp: now()
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function withDefaultCitations<T extends Record<string, unknown>>(value: T): T & { citations: unknown[] } {
  return {
    ...value,
    citations: Array.isArray(value.citations) ? value.citations : []
  };
}

function normalizeReviewToolArguments(call: CodexReviewToolCall): unknown {
  const args = asRecord(call.arguments);
  if (!args) {
    return call.arguments;
  }

  if (call.tool === "liveseller_record_seller_review_response") {
    const response = asRecord(args.response);
    return response
      ? {
          ...args,
          response: withDefaultCitations(response)
        }
      : call.arguments;
  }

  if (call.tool === "liveseller_apply_ai_draft_update") {
    const update = asRecord(args.update);
    return update
      ? {
          ...args,
          update: withDefaultCitations(update)
        }
      : call.arguments;
  }

  if (call.tool === "liveseller_record_product_review_decision") {
    const decision = asRecord(args.decision);
    return decision
      ? {
          ...args,
          decision: withDefaultCitations(decision)
        }
      : call.arguments;
  }

  return call.arguments;
}

function isReviewToolName(value: unknown): value is CodexReviewToolName {
  return typeof value === "string" && LIVESELLER_CODEX_REVIEW_TOOLS.some((tool) => tool.name === value);
}

function readToolCall(message: CodexJsonRpcMessage): (DynamicToolCallParams & {
  id?: number;
  tool: CodexReviewToolName;
}) | undefined {
  const record = asRecord(message);
  if (record?.method !== "item/tool/call") {
    return undefined;
  }

  const id = typeof record.id === "number" ? record.id : undefined;
  const params = asRecord(record.params);
  if (!params || !isReviewToolName(params.tool)) {
    return undefined;
  }

  return {
    threadId: typeof params.threadId === "string" ? params.threadId : "",
    turnId: typeof params.turnId === "string" ? params.turnId : "",
    callId: typeof params.callId === "string" ? params.callId : `call-${id ?? "unknown"}`,
    namespace: typeof params.namespace === "string" ? params.namespace : null,
    tool: params.tool,
    arguments: params.arguments ?? {},
    id
  };
}

function isTurnCompleted(message: CodexJsonRpcMessage): boolean {
  return asRecord(message)?.method === "turn/completed";
}

function readResponse(message: CodexJsonRpcMessage, id: number): CodexJsonRpcResponse | undefined {
  const record = asRecord(message);
  if (record?.id !== id) {
    return undefined;
  }
  if ("error" in record && record.error) {
    throw new Error(`Codex app-server request ${id} failed: ${JSON.stringify(record.error)}`);
  }
  return record as CodexJsonRpcResponse;
}

function threadIdFromThreadStart(response: CodexJsonRpcResponse): string {
  const result = asRecord(response.result);
  const thread = asRecord(result?.thread);
  if (typeof thread?.id !== "string" || thread.id.length === 0) {
    throw new Error("Codex app-server thread/start response did not include thread.id");
  }
  return thread.id;
}

export function buildCodexAppServerReviewTurn(options: CodexReviewTurnOptions): CodexReviewTurnMessages {
  return {
    initialize: {
      id: 1,
      method: "initialize",
      params: {
        clientInfo: {
          name: "liveseller-operator",
          title: "LiveSeller Operator",
          version: "0.1.0"
        },
        capabilities: {
          experimentalApi: true
        }
      }
    },
    initialized: {
      method: "initialized",
      params: {}
    },
    threadStart: {
      id: 2,
      method: "thread/start",
      params: {
        cwd: options.cwd,
        dynamicTools: LIVESELLER_CODEX_REVIEW_TOOLS,
        approvalPolicy: "never",
        sandbox: "read-only",
        experimentalRawEvents: false,
        persistExtendedHistory: false
      }
    },
    turnStart: {
      id: 3,
      method: "turn/start",
      params: {
        threadId: options.threadId,
        input: [
          {
            type: "text",
            text: buildReviewPrompt(options)
          }
        ]
      }
    }
  };
}

export async function executeCodexReviewToolCall(
  state: CodexReviewToolState,
  call: CodexReviewToolCall
): Promise<CodexReviewToolResult> {
  const normalizedArguments = normalizeReviewToolArguments(call);
  const parsedState: CodexReviewToolState = {
    reviewPlan: ProductReviewPlanSchema.parse(state.reviewPlan),
    createProductCommands: state.createProductCommands
  };

  if (call.tool === "liveseller_record_seller_review_response") {
    const args = SellerResponseArgsSchema.parse(normalizedArguments) as { response: SellerFreeFormReviewResponse };
    const nextState = {
      ...parsedState,
      reviewPlan: recordSellerReviewResponse(parsedState.reviewPlan, args.response)
    };
    return { ...nextState, contentItems: content(call.tool, nextState) };
  }

  if (call.tool === "liveseller_apply_ai_draft_update") {
    const args = AiDraftUpdateArgsSchema.parse(normalizedArguments) as { update: AiDraftUpdate };
    const nextState = {
      ...parsedState,
      reviewPlan: applyAiDraftUpdate(parsedState.reviewPlan, args.update)
    };
    return { ...nextState, contentItems: content(call.tool, nextState) };
  }

  if (call.tool === "liveseller_run_generation_tasks") {
    const args = GenerationTaskArgsSchema.parse(normalizedArguments);
    const outputs = new Map(args.taskOutputs.map((output) => [output.taskId, output]));
    const reviewPlan = await runPendingPrepGenerationTasks(
      parsedState.reviewPlan,
      async (task) => {
        const output = outputs.get(task.taskId);
        return {
          outputRefs: output?.outputRefs ?? [],
          error: output?.error ?? (output ? undefined : `No generation output supplied for ${task.taskId}`),
          citations: task.citations
        };
      },
      args.completedAt
    );
    const nextState = { ...parsedState, reviewPlan };
    return { ...nextState, contentItems: content(call.tool, nextState) };
  }

  if (call.tool === "liveseller_record_product_review_decision") {
    const args = ProductReviewDecisionArgsSchema.parse(normalizedArguments) as { decision: ProductReviewDecision };
    const nextState = {
      ...parsedState,
      reviewPlan: recordProductReviewDecision(parsedState.reviewPlan, args.decision)
    };
    return { ...nextState, contentItems: content(call.tool, nextState) };
  }

  if (call.tool === "liveseller_build_create_product_commands") {
    const nextState = {
      ...parsedState,
      createProductCommands: buildShopeeCreateProductCommands(parsedState.reviewPlan)
    };
    return { ...nextState, contentItems: content(call.tool, nextState) };
  }

  throw new Error(`Unsupported Codex review tool: ${call.tool satisfies never}`);
}

export async function runCodexAppServerReviewSession(
  options: CodexReviewTurnOptions,
  transport: CodexAppServerTransport
): Promise<CodexReviewSessionResult> {
  const turn = buildCodexAppServerReviewTurn(options);
  const operatorEvents: CodexOperatorEvent[] = [];
  let state: CodexReviewToolState = {
    reviewPlan: ProductReviewPlanSchema.parse(options.reviewPlan),
    createProductCommands: []
  };
  let threadId = options.threadId;

  await transport.send(turn.initialize);
  options.onTrace?.({ direction: "out", method: turn.initialize.method, id: turn.initialize.id });
  await transport.send(turn.initialized);
  options.onTrace?.({ direction: "out", method: turn.initialized.method, id: turn.initialized.id });
  await transport.send(turn.threadStart);
  options.onTrace?.({ direction: "out", method: turn.threadStart.method, id: turn.threadStart.id });
  if (options.threadId) {
    await transport.send(turn.turnStart);
    options.onTrace?.({ direction: "out", method: turn.turnStart.method, id: turn.turnStart.id });
  }

  operatorEvents.push(operatorEvent({
    type: "session_started",
    message: "Codex app-server review session started."
  }));

  let turnStarted = Boolean(options.threadId);

  for await (const message of transport.events()) {
    const inbound = asRecord(message);
    options.onTrace?.({
      direction: "in",
      method: typeof inbound?.method === "string" ? inbound.method : undefined,
      id: typeof inbound?.id === "number" ? inbound.id : undefined,
      payload: message
    });

    const threadStartResponse = readResponse(message, 2);
    if (threadStartResponse && !turnStarted) {
      threadId = threadIdFromThreadStart(threadStartResponse);
      await transport.send({
        ...turn.turnStart,
        params: {
          ...turn.turnStart.params,
          threadId
        }
      });
      options.onTrace?.({ direction: "out", method: turn.turnStart.method, id: turn.turnStart.id });
      turnStarted = true;
      continue;
    }

    const toolCall = readToolCall(message);
    if (toolCall) {
      operatorEvents.push(operatorEvent({
        type: "tool_call_received",
        message: `Codex requested ${toolCall.tool}.`,
        tool: toolCall.tool,
        callId: toolCall.callId
      }));
      options.onTrace?.({
        direction: "operator",
        method: "tool_call_received",
        message: `Codex requested ${toolCall.tool}.`,
        payload: {
          tool: toolCall.tool,
          callId: toolCall.callId,
          arguments: toolCall.arguments
        }
      });

      let result: CodexReviewToolResult;
      try {
        result = await executeCodexReviewToolCall(state, {
          tool: toolCall.tool,
          arguments: toolCall.arguments
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await transport.send({
          id: toolCall.id,
          result: {
            contentItems: [{ type: "inputText", text: `LiveSeller tool validation failed: ${message}` }],
            success: false
          }
        });
        options.onTrace?.({
          direction: "out",
          method: "item/tool/result",
          id: toolCall.id,
          message: `Rejected invalid arguments for ${toolCall.tool}: ${message}`
        });
        operatorEvents.push(operatorEvent({
          type: "tool_result_sent",
          message: `LiveSeller rejected invalid arguments for ${toolCall.tool}.`,
          tool: toolCall.tool,
          callId: toolCall.callId
        }));
        continue;
      }
      state = {
        reviewPlan: result.reviewPlan,
        createProductCommands: result.createProductCommands
      };

      await transport.send({
        id: toolCall.id,
        result: {
          contentItems: result.contentItems.map((item) => ({
            type: "inputText",
            text: item.text
          })),
          success: true
        }
      });
      options.onTrace?.({
        direction: "out",
        method: "item/tool/result",
        id: toolCall.id,
        message: `Returned validated result for ${toolCall.tool}.`
      });

      operatorEvents.push(operatorEvent({
        type: "tool_result_sent",
        message: `LiveSeller returned a validated result for ${toolCall.tool}.`,
        tool: toolCall.tool,
        callId: toolCall.callId
      }));
      continue;
    }

    if (isTurnCompleted(message)) {
      operatorEvents.push(operatorEvent({
        type: "turn_completed",
        message: "Codex app-server review turn completed."
      }));
      break;
    }
  }

  return {
    ...state,
    threadId,
    operatorEvents
  };
}
