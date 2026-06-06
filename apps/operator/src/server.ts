import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  LiveSessionSpecSchema,
  ProductRecordSchema,
  ProductReviewPlanSchema,
  type ProductReviewPlan,
  SellerTimelineEventSchema,
  type SellerTimelineEvent,
  type ShopeeCreateProductCommand,
  validLiveSessionSpec
} from "@liveseller/contracts";
import {
  buildImageGenerationPlan,
  buildProductIdentityDrafts,
  buildProductReviewPlan,
  buildSellerGuidance,
  buildSellerUiPolicy
} from "@liveseller/prep";
import { loadEnvFile } from "../../prep/src/liveOpenAiPrep";
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
const MAX_TIMELINE_EVENTS = 200;

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

const SidepanelImageSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  dataUrl: z.string().min(1)
}).strict();

const SidepanelDraftRequestSchema = z.object({
  sessionId: z.string().min(1),
  product: ProductRecordSchema.optional(),
  products: z.array(ProductRecordSchema).optional(),
  images: z.array(SidepanelImageSchema).min(1)
}).strict().transform((value) => ({
  ...value,
  products: value.products && value.products.length > 0
    ? value.products
    : value.product
      ? [value.product]
      : []
}));

type SidepanelDraftRequest = z.infer<typeof SidepanelDraftRequestSchema>;

type GeneratedSidepanelDraft = {
  imageIndex: number;
  title: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  bulletPoints: string[];
};

type SidepanelDraftGenerator = (input: SidepanelDraftRequest) => Promise<GeneratedSidepanelDraft[]>;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json"
  });
  res.end(JSON.stringify(body));
}

function createOperatorTimelineStore() {
  const events: SellerTimelineEvent[] = [];
  let cursor = 0;
  return {
    append(input: Omit<SellerTimelineEvent, "id" | "timestamp" | "service" | "redacted"> & {
      id?: string;
      timestamp?: string;
      service?: SellerTimelineEvent["service"];
      redacted?: boolean;
    }) {
      const { redacted, ...rest } = input;
      const event = SellerTimelineEventSchema.parse({
        service: "operator",
        ...rest,
        redacted: redacted ?? false,
        id: input.id ?? `operator-timeline-${Date.now()}-${cursor + 1}`,
        timestamp: input.timestamp ?? now()
      });
      events.push(event);
      if (events.length > MAX_TIMELINE_EVENTS) {
        events.splice(0, events.length - MAX_TIMELINE_EVENTS);
      }
      cursor += 1;
      return event;
    },
    list(after = 0) {
      return {
        events: events.slice(Math.max(0, events.length - Math.max(0, cursor - after))),
        nextCursor: cursor
      };
    }
  };
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

const FALLBACK_GENERATED_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function firstDataImageRef(refs: string[]): string | undefined {
  return refs.find((ref) => ref.startsWith("data:image/"));
}

function imageBlobFromDataUrl(dataUrl: string, fallbackType = "image/jpeg") {
  const [header, base64] = dataUrl.split(",");
  if (!header?.startsWith("data:") || !base64) {
    return undefined;
  }
  const mimeType = header.match(/^data:([^;]+)/u)?.[1] ?? fallbackType;
  return {
    mimeType,
    bytes: Buffer.from(base64, "base64")
  };
}

async function generateCleanBackgroundImage(options: {
  apiKey: string;
  imageDataUrl: string;
  fileName: string;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const image = imageBlobFromDataUrl(options.imageDataUrl);
  if (!image) {
    throw new Error("Image edit task input was not a data image URL.");
  }
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("image", new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), options.fileName);
  form.append(
    "prompt",
    [
      "Remove the background from this product photo for a Shopee listing.",
      "Preserve the exact product, visible condition, color, shape, and included parts.",
      "Use a clean white or transparent studio background.",
      "Do not add text, logos, props, certificates, packaging, claims, or extra product parts."
    ].join(" ")
  );
  form.append("quality", "low");
  form.append("size", "1024x1024");
  form.append("output_format", "png");

  const response = await options.fetchImpl("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`
    },
    body: form
  });
  if (!response.ok) {
    throw new Error(`OpenAI image edit failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json() as { data?: Array<{ b64_json?: string }> };
  const base64 = body.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error("OpenAI image edit response did not include data[0].b64_json");
  }
  return `data:image/png;base64,${base64}`;
}

function buildDeterministicImageRunner(): CodexImageEditRunner {
  return async ({ reviewPlan }) => ({
    completedAt: now(),
    taskOutputs: reviewPlan.generationTasks
      .filter((task) => task.status === "pending" && task.taskType === "image_edit")
      .map((task) => ({
        taskId: task.taskId,
        outputRefs: [firstDataImageRef(task.inputRefs) ?? FALLBACK_GENERATED_PNG_DATA_URL]
      }))
  });
}

function buildOperatorImageRunner(fetchImpl: typeof fetch = fetch): CodexImageEditRunner {
  return async ({ reviewPlan }) => {
    loadEnvFile();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return buildDeterministicImageRunner()({ reviewPlan });
    }

    const taskOutputs = await Promise.all(reviewPlan.generationTasks
      .filter((task) => task.status === "pending" && task.taskType === "image_edit")
      .map(async (task) => {
        const sourceImage = firstDataImageRef(task.inputRefs);
        if (!sourceImage) {
          return {
            taskId: task.taskId,
            outputRefs: [FALLBACK_GENERATED_PNG_DATA_URL],
            error: "No uploadable data image URL was available for this image edit task."
          };
        }
        const outputRef = await generateCleanBackgroundImage({
          apiKey,
          imageDataUrl: sourceImage,
          fileName: `${task.taskId}.png`,
          fetchImpl
        });
        return {
          taskId: task.taskId,
          outputRefs: [outputRef]
        };
      }));
    return {
      completedAt: now(),
      taskOutputs
    };
  };
}

async function runToolCalls(
  initialState: CodexReviewToolState,
  calls: CodexReviewToolCall[],
  imageEditRunner: CodexImageEditRunner = buildOperatorImageRunner()
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
      imageEditRunner
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

function extractResponseText(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const candidate = body as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };
  if (typeof candidate.output_text === "string") {
    return candidate.output_text;
  }
  for (const item of candidate.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}

function parseGeneratedDrafts(text: string, imageCount: number): GeneratedSidepanelDraft[] {
  const jsonText = text.trim().replace(/^```json\s*|\s*```$/gu, "");
  const parsed = JSON.parse(jsonText) as { products?: Array<Partial<GeneratedSidepanelDraft>> };
  const products = Array.isArray(parsed.products) ? parsed.products : [];
  if (products.length === 0) {
    throw new Error("Generated product draft did not include products[].");
  }
  return products.slice(0, imageCount).map((product, index) => {
    const title = String(product.title ?? "").trim();
    const category = String(product.category ?? "").trim();
    const description = String(product.description ?? "").trim();
    if (!title || !category || !description) {
      throw new Error(`Generated product draft ${index + 1} was missing title, category, or description.`);
    }
    return {
      imageIndex: Number.isInteger(product.imageIndex) ? Number(product.imageIndex) : index,
      title,
      category,
      price: Number.isFinite(product.price) && Number(product.price) > 0 ? Number(product.price) : 19.9,
      stock: Number.isInteger(product.stock) && Number(product.stock) >= 0 ? Number(product.stock) : 20,
      description,
      bulletPoints: Array.isArray(product.bulletPoints)
        ? product.bulletPoints.map((point) => String(point).trim()).filter(Boolean).slice(0, 5)
        : []
    };
  });
}

async function generateSidepanelDraftWithOpenAi(input: SidepanelDraftRequest): Promise<GeneratedSidepanelDraft[]> {
  loadEnvFile();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required on the operator server to generate product drafts from images.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.LIVESELLER_PRODUCT_DRAFT_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Generate a Shopee seller-review product listing draft from these uploaded product images.",
              `There are ${input.images.length} uploaded product image(s). Treat each image as one separate product unless an image is clearly a duplicate angle of the same item.`,
              "Use only visible evidence from the images. Do not invent brand, authenticity, material, certificate, warranty, discount, or exact variants.",
              "Return strict JSON only with shape: {\"products\":[{\"imageIndex\":0,\"title\":\"...\",\"category\":\"...\",\"price\":19.9,\"stock\":20,\"description\":\"...\",\"bulletPoints\":[\"...\"]}]}",
              "Use SGD price and stock as seller-review defaults if not visually knowable; the seller will edit before publishing."
            ].join(" ")
          },
          ...input.images.map((image) => ({
            type: "input_image",
            image_url: image.dataUrl
          }))
        ]
      }]
    })
  });
  if (!response.ok) {
    throw new Error(`OpenAI product draft generation failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  const text = extractResponseText(body);
  if (!text) {
    throw new Error("OpenAI product draft generation returned no text.");
  }
  return parseGeneratedDrafts(text, input.images.length);
}

function applyGeneratedDraft(product: SidepanelDraftRequest["products"][number], generated: GeneratedSidepanelDraft) {
  return ProductRecordSchema.parse({
    ...product,
    title: generated.title,
    aliases: [generated.title],
    category: generated.category,
    price: generated.price,
    stock: generated.stock,
    description: generated.description,
    listingDraft: {
      title: generated.title,
      description: generated.description,
      bulletPoints: generated.bulletPoints.length > 0
        ? generated.bulletPoints
        : ["Generated from seller-uploaded product images", "Seller must verify exact Shopee fields before publishing"]
    },
    sourceConfidence: Math.min(product.sourceConfidence, 0.85)
  });
}

function buildSidepanelReviewPlan(input: SidepanelDraftRequest, generatedDrafts: GeneratedSidepanelDraft[]): ProductReviewPlan {
  if (input.products.length === 0) {
    throw new Error("Sidepanel draft request must include product shells.");
  }
  const products = generatedDrafts.map((generated, index) => {
    const shell = input.products[index] ?? input.products[0]!;
    const sourceImage = input.images[generated.imageIndex] ?? input.images[index] ?? input.images[0]!;
    return ProductRecordSchema.parse({
      ...applyGeneratedDraft(shell, generated),
      evidence: shell.evidence.map((citation) => ({
        ...citation,
        locator: sourceImage.name,
        excerpt: `Codex operator generated a seller-review draft from uploaded image: ${sourceImage.name}`
      })),
      media: {
        images: [shell.media.images[0]].filter(Boolean)
      }
    });
  });
  const generatedAt = now();
  const session = LiveSessionSpecSchema.parse({
    ...validLiveSessionSpec,
    sessionId: input.sessionId,
    title: `${products.length} product live review`,
    products,
    promos: [],
    retrievalRefs: []
  });
  const missingFieldReport = {
    sessionId: input.sessionId,
    generatedAt,
    missingByProduct: products.map((product) => ({
      productId: product.id,
      sku: product.sku,
      missingFields: [
        "Shopee category selection",
        "Seller confirmation of condition/material claims",
        "Variant mapping"
      ]
    })),
    marketplaceReadiness: "needs_seller_review" as const
  };
  const identityDrafts = buildProductIdentityDrafts(products, missingFieldReport);
  const guidance = buildSellerGuidance(products);
  const imagePlan = buildImageGenerationPlan(products);
  const sellerUiPolicy = buildSellerUiPolicy(input.sessionId, products, missingFieldReport, imagePlan);
  return buildProductReviewPlan(session, identityDrafts, guidance, imagePlan, sellerUiPolicy, generatedAt);
}

export function createOperatorHttpServer(options: {
  sidepanelDraftGenerator?: SidepanelDraftGenerator;
  imageEditRunner?: CodexImageEditRunner;
} = {}) {
  const timeline = createOperatorTimelineStore();
  const sidepanelDraftGenerator = options.sidepanelDraftGenerator ?? generateSidepanelDraftWithOpenAi;
  const imageEditRunner = options.imageEditRunner ?? buildOperatorImageRunner();
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

      if (req.method === "GET" && url.pathname === "/api/operator/events") {
        const after = Number(url.searchParams.get("after") ?? "0");
        json(res, 200, timeline.list(Number.isFinite(after) ? after : 0));
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
          calls,
          imageEditRunner
        );
        for (const event of result.operatorEvents) {
          timeline.append({
            kind: "operator",
            status: event.type === "turn_completed" ? "success" : "info",
            title: event.tool ? `${event.type}: ${event.tool}` : event.type,
            detail: event.message,
            tool: event.tool,
            subjectId: event.callId,
            redacted: true
          });
        }
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
          calls,
          imageEditRunner
        );
        for (const event of result.operatorEvents) {
          timeline.append({
            kind: "operator",
            status: event.type === "turn_completed" ? "success" : "info",
            title: event.tool ? `${event.type}: ${event.tool}` : event.type,
            detail: event.message,
            tool: event.tool,
            subjectId: event.callId,
            redacted: true
          });
        }
        json(res, 200, {
          ...result,
          interpretedCalls: calls.map((call) => call.tool)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/operator/sidepanel-draft") {
        const payload = SidepanelDraftRequestSchema.parse(await readJson(req));
        const generated = await sidepanelDraftGenerator(payload);
        const reviewPlan = buildSidepanelReviewPlan(payload, generated);
        const event = timeline.append({
          kind: "operator",
          status: "success",
          title: "Sidepanel product draft created",
          detail: `Created review plan ${reviewPlan.reviewPlanId} from ${payload.images.length} sidepanel image(s).`,
          subjectId: payload.products[0]?.id,
          redacted: true
        });
        json(res, 200, {
          reviewPlan,
          createProductCommands: [],
          startLivestreamCommands: [],
          operatorEvents: [
            operatorEvent({
              type: "turn_completed",
              message: event.detail ?? "Sidepanel product draft created.",
              callId: event.id
            })
          ]
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const started = await startOperatorHttpServer();
  console.log(`LiveSeller operator HTTP server listening on ${started.url}`);
}
