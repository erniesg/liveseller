import { DEFAULT_SELLER_DROP_FOLDER, buildSellerMaterialIngestion } from "@liveseller/prep";
import { vintageJewelryLiveSessionSpec, vintageJewelryProducts } from "@liveseller/contracts";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnCodexAppServerStdioTransport } from "./codexAppServerTransport";
import { runCodexAppServerReviewSession } from "./codexAppServerReview";

const timeoutMs = Number(process.env.LIVESELLER_LIVE_DAEMON_TIMEOUT_MS ?? 180_000);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const traceDir = join(repoRoot, ".liveseller");
const tracePath = join(traceDir, "live-daemon-validation.jsonl");

mkdirSync(traceDir, { recursive: true });
writeFileSync(tracePath, "");
console.log(`LiveSeller live daemon trace: ${tracePath}`);

function trace(event: Record<string, unknown>): void {
  appendFileSync(tracePath, JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event
  }) + "\n");
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
const prep = buildSellerMaterialIngestion(buildSingleProductDropFolder(), {
  products: [singleProduct],
  liveSessionSpec: {
    ...vintageJewelryLiveSessionSpec,
    sessionId: "live-daemon-single-product-001",
    products: [singleProduct]
  }
});
const item = requireFirst(prep.productReviewPlan.items[0], "product review item");
const round = requireFirst(item.reviewRounds[0], "seller review round");
const product = item.product;

const sellerText = [
  "Live daemon validation for LiveSeller before-stream prep.",
  "You must call LiveSeller dynamic tools, not just describe the plan.",
  "First call liveseller_record_seller_review_response with an edit_request response for the first review round.",
  "Then call liveseller_apply_ai_draft_update to shorten the product title and replace photoEnhancementPrompts with one new image-edit prompt.",
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
  const result = await withTimeout(
    runCodexAppServerReviewSession(
      {
        cwd: repoRoot,
        reviewPlan: prep.productReviewPlan,
        sellerText,
        onTrace: (event) => trace({ type: "jsonrpc", ...event })
      },
      transport
    ),
    "Codex app-server live validation"
  );

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
  if (!updatedItem.product.title.includes("Live Review Draft")) {
    throw new Error("Live daemon did not apply the requested title edit");
  }
  if (updatedItem.photoEnhancementPlan.prompts.length !== 1) {
    throw new Error("Live daemon did not replace photo enhancement prompts");
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
    createProductCommandCount: result.createProductCommands.length,
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
