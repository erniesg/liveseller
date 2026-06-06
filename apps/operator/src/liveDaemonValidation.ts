import { DEFAULT_SELLER_DROP_FOLDER, buildSellerMaterialIngestion } from "@liveseller/prep";
import { vintageJewelryLiveSessionSpec, vintageJewelryProducts } from "@liveseller/contracts";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile, runOneImageLivePrep } from "../../prep/src/liveOpenAiPrep";
import { spawnCodexAppServerStdioTransport } from "./codexAppServerTransport";
import { runCodexAppServerReviewSession } from "./codexAppServerReview";

const timeoutMs = Number(process.env.LIVESELLER_LIVE_DAEMON_TIMEOUT_MS ?? 180_000);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const traceDir = join(repoRoot, ".liveseller");
const tracePath = join(traceDir, "live-daemon-validation.jsonl");
const imageArtifactRoot = join(repoRoot, "artifacts", "prep-live", `live-daemon-${new Date().toISOString().replaceAll(/[:.]/gu, "-")}`);
const runStartedAt = new Date().toISOString();
const runStartTime = performance.now();

loadEnvFile(repoRoot);
mkdirSync(traceDir, { recursive: true });
writeFileSync(tracePath, "");
console.log(`LiveSeller live daemon trace: ${tracePath}`);

function trace(event: Record<string, unknown>): void {
  appendFileSync(tracePath, JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event
  }) + "\n");
}

async function timed<T>(name: string, run: () => Promise<T> | T): Promise<T> {
  const startedAt = new Date().toISOString();
  const startTime = performance.now();
  trace({ type: "timing_segment_started", name, startedAt });
  try {
    return await run();
  } finally {
    const completedAt = new Date().toISOString();
    trace({
      type: "timing_segment_completed",
      name,
      startedAt,
      completedAt,
      durationMs: Math.round((performance.now() - startTime) * 1000) / 1000
    });
  }
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!));
}

function requireFirst<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function dropFolderFileNameFromProductImage(image: { citations: Array<{ excerpt: string }> }): string | undefined {
  for (const citation of image.citations) {
    const match = citation.excerpt.match(/drop-folder file:\s*(.+)$/u);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function buildSingleProductDropFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "liveseller-single-product-drop-"));
  mkdirSync(folder, { recursive: true });
  const product = vintageJewelryProducts[0]!;
  for (const image of product.media.images) {
    const fileName = dropFolderFileNameFromProductImage(image);
    if (fileName) {
      copyFileSync(join(DEFAULT_SELLER_DROP_FOLDER, fileName), join(folder, fileName));
    }
  }
  return folder;
}

const singleProduct = vintageJewelryProducts[0]!;
const dropFolder = await timed("prepare_single_product_drop_folder", () => buildSingleProductDropFolder());
const sourceImageFileName = requireFirst(
  dropFolderFileNameFromProductImage(requireFirst(singleProduct.media.images[0], "single product source image")),
  "single product drop-folder file name"
);
const sourceImagePath = join(dropFolder, sourceImageFileName);
const prep = await timed("ingest_seller_material", () =>
  buildSellerMaterialIngestion(dropFolder, {
    products: [singleProduct],
    liveSessionSpec: {
      ...vintageJewelryLiveSessionSpec,
      sessionId: "live-daemon-single-product-001",
      products: [singleProduct]
    }
  })
);
const item = requireFirst(prep.productReviewPlan.items[0], "product review item");
const round = requireFirst(item.reviewRounds[0], "seller review round");
const product = item.product;

const sellerText = [
  "Live daemon validation for LiveSeller before-stream prep.",
  "You must call LiveSeller dynamic tools, not just describe the plan.",
  "First call liveseller_record_seller_review_response with an edit_request response for the first review round.",
  "Then call liveseller_apply_ai_draft_update to shorten the product title and replace photoEnhancementPrompts with one new image-edit prompt.",
  "Then call liveseller_generate_image_edits to run the server-side image edit worker for the pending image task.",
  "Do not call liveseller_build_create_product_commands because the seller has not approved publishing.",
  "",
  `Use responseId=live-daemon-response-001, roundId=${round.roundId}, productId=${item.productId}.`,
  "Use text='Shorten the title and add one clean cover image option.' and interpretedIntent=edit_request.",
  "Use updateId=live-daemon-ai-update-001, actor=ai, reason='Live daemon validation edit.'",
  "Use updatedAt and receivedAt as 2026-06-06T04:40:00.000Z.",
  `Set title to '${product.title} - Live Review Draft'.`,
  "Set photoEnhancementPrompts to ['Create a clean Shopee cover from the supplied product image; preserve exact condition and do not add claims.']."
].join("\n");

const transport = spawnCodexAppServerStdioTransport({
  cwd: repoRoot,
  args: [
    "app-server",
    "-c",
    "plugins.\"cloudflare@openai-curated\".enabled=false",
    "-c",
    "plugins.\"twilio-developer-kit@openai-curated\".enabled=false",
    "--listen",
    "stdio://"
  ]
});

transport.child.stderr.on("data", (chunk) => {
  const line = String(chunk).trim();
  trace({ type: "stderr", message: line });
  if (line.length > 0 && !line.includes('"level":"WARN"') && !line.includes("OPENAI_API_KEY")) {
    console.error(line);
  }
});

try {
  const result = await timed(
    "codex_app_server_review_session",
    () => withTimeout(
      runCodexAppServerReviewSession(
        {
          cwd: repoRoot,
          reviewPlan: prep.productReviewPlan,
          sellerText,
          imageEditRunner: async ({ reviewPlan }) => {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
              throw new Error("OPENAI_API_KEY is required for live daemon image edit validation");
            }
            const reviewItem = requireFirst(reviewPlan.items[0], "image edit review item");
            const prompt = requireFirst(
              reviewItem.photoEnhancementPlan.prompts[0],
              "image edit prompt"
            );
            const livePrep = await timed("openai_image_edit_generation", () =>
              runOneImageLivePrep({
                apiKey,
                sourceImagePath,
                outputDir: imageArtifactRoot,
                products: [singleProduct],
                liveSessionSpec: {
                  ...vintageJewelryLiveSessionSpec,
                  sessionId: "live-daemon-single-product-001",
                  products: [singleProduct]
                },
                imagePrompt: prompt
              })
            );
            trace({
              type: "image_edit_artifacts",
              outputDir: imageArtifactRoot,
              timingPath: livePrep.timingPath,
              generatedImagePaths: livePrep.generatedImagePaths
            });
            return {
              completedAt: new Date().toISOString(),
              taskOutputs: livePrep.updatedReviewPlan.generationTasks
                .filter((task) => task.taskType === "image_edit" && task.status === "completed")
                .map((task) => ({
                  taskId: task.taskId,
                  outputRefs: task.outputRefs
                }))
            };
          },
          onTrace: (event) => trace({ type: "jsonrpc", ...event })
        },
        transport
      ),
      "Codex app-server live validation"
    )
  );
  const totalCompletedAt = new Date().toISOString();
  const totalDurationMs = Math.round((performance.now() - runStartTime) * 1000) / 1000;

  trace({
    type: "timing_total",
    startedAt: runStartedAt,
    completedAt: totalCompletedAt,
    durationMs: totalDurationMs
  });

  const toolNames = result.operatorEvents.flatMap((event) =>
    event.type === "tool_call_received" && event.tool ? [event.tool] : []
  );
  const updatedItem = requireFirst(
    result.reviewPlan.items.find((candidate) => candidate.productId === item.productId),
    "updated product review item"
  );

  if (!toolNames.includes("liveseller_record_seller_review_response")) {
    throw new Error("Live daemon did not call liveseller_record_seller_review_response");
  }
  if (!toolNames.includes("liveseller_apply_ai_draft_update")) {
    throw new Error("Live daemon did not call liveseller_apply_ai_draft_update");
  }
  if (!toolNames.includes("liveseller_generate_image_edits")) {
    throw new Error("Live daemon did not call liveseller_generate_image_edits");
  }
  if (!updatedItem.product.title.includes("Live Review Draft")) {
    throw new Error("Live daemon did not apply the requested title edit");
  }
  if (updatedItem.photoEnhancementPlan.prompts.length !== 1) {
    throw new Error("Live daemon did not replace photo enhancement prompts");
  }
  const completedImageTasks = result.reviewPlan.generationTasks.filter((task) =>
    task.productId === updatedItem.productId && task.taskType === "image_edit" && task.status === "completed"
  );
  if (completedImageTasks.length === 0 || completedImageTasks.some((task) => task.outputRefs.length === 0)) {
    throw new Error("Live daemon did not attach generated image-edit outputs");
  }
  if (result.createProductCommands.length !== 0) {
    throw new Error("Live daemon built publish commands before seller approval");
  }

  console.log(JSON.stringify({
    ok: true,
    threadId: result.threadId,
    ingestedFileCount: prep.ingestedFiles.length,
    productCount: prep.productReviewPlan.items.length,
    toolCalls: toolNames,
    updatedProductId: updatedItem.productId,
    updatedTitle: updatedItem.product.title,
    imagePromptCount: updatedItem.photoEnhancementPlan.prompts.length,
    imageEditOutputRefs: completedImageTasks.flatMap((task) => task.outputRefs),
    createProductCommandCount: result.createProductCommands.length,
    timings: {
      startedAt: runStartedAt,
      completedAt: totalCompletedAt,
      durationMs: totalDurationMs
    },
    operatorEvents: result.operatorEvents
  }, null, 2));
  trace({
    type: "validation_result",
    ok: true,
    threadId: result.threadId,
    toolCalls: toolNames,
    updatedTitle: updatedItem.product.title
  });
} finally {
  await transport.close();
}
