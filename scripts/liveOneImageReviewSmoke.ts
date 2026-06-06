import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ProductReviewPlan,
  type SellerFreeFormReviewResponse,
  SellerFreeFormReviewResponseSchema
} from "@liveseller/contracts";
import {
  DEFAULT_SELLER_DROP_FOLDER
} from "../apps/prep/src/index";
import {
  loadEnvFile,
  runOneImageLivePrep
} from "../apps/prep/src/liveOpenAiPrep";
import {
  buildShopeeCreateProductCommands,
  recordSellerReviewResponse
} from "../apps/runtime/src/approvals";

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseArg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parseSellerIntent(
  value = "edit_request"
): SellerFreeFormReviewResponse["interpretedIntent"] {
  const allowed = ["approve", "reject", "edit_request", "more_options", "unknown"] as const;
  if (allowed.includes(value as SellerFreeFormReviewResponse["interpretedIntent"])) {
    return value as SellerFreeFormReviewResponse["interpretedIntent"];
  }

  throw new Error(`seller-intent must be one of: ${allowed.join(", ")}`);
}

function defaultOutputDir(): string {
  return join(
    process.cwd(),
    "artifacts",
    "prep-live",
    new Date().toISOString().replaceAll(/[:.]/gu, "-")
  );
}

function firstSellerDropImage(folder = DEFAULT_SELLER_DROP_FOLDER): string {
  const fileName = readdirSync(folder)
    .filter((candidate) => [".jpg", ".jpeg", ".png", ".webp"].includes(extname(candidate).toLowerCase()))
    .sort((left, right) => left.localeCompare(right))[0];

  if (!fileName) {
    throw new Error(`No image files found in ${folder}`);
  }

  return join(folder, fileName);
}

export function buildSellerResponse(
  plan: ProductReviewPlan,
  text: string,
  interpretedIntent: SellerFreeFormReviewResponse["interpretedIntent"],
  receivedAt = new Date().toISOString()
): SellerFreeFormReviewResponse {
  const item = required(plan.items[0]?.productId, "review plan item");
  const reviewItem = plan.items.find((candidate) => candidate.productId === item)!;
  const round = required(reviewItem.reviewRounds.at(-1)?.roundId, "review round");

  return SellerFreeFormReviewResponseSchema.parse({
    responseId: `response-${reviewItem.productId}-live-smoke-${receivedAt.replaceAll(/\W+/gu, "-")}`,
    roundId: round,
    productId: reviewItem.productId,
    text,
    receivedAt,
    interpretedIntent,
    citations: reviewItem.product.evidence
  });
}

async function main(): Promise<void> {
  loadEnvFile();

  const sourceImagePath = resolve(parseArg("image") ?? firstSellerDropImage());
  const outputDir = resolve(parseArg("out") ?? defaultOutputDir());
  const sellerResponseText = parseArg("seller-response")
    ?? "Please make the title shorter and show me another image prompt option.";
  const sellerIntent = parseSellerIntent(parseArg("seller-intent"));
  const imagePrompt = parseArg("image-prompt");

  const livePrep = await runOneImageLivePrep({
    apiKey: required(process.env.OPENAI_API_KEY, "OPENAI_API_KEY"),
    sourceImagePath,
    outputDir,
    imagePrompt
  });

  const sellerResponse = buildSellerResponse(livePrep.updatedReviewPlan, sellerResponseText, sellerIntent);
  const responsePlan = recordSellerReviewResponse(livePrep.updatedReviewPlan, sellerResponse);
  const responsePlanPath = join(dirname(livePrep.updatedReviewPlanPath), "review-plan.response.json");
  writeFileSync(responsePlanPath, JSON.stringify(responsePlan, null, 2));

  const pendingCreateProductCommands = buildShopeeCreateProductCommands(responsePlan);

  console.log(JSON.stringify({
    sourceImagePath,
    outputDir,
    initialReviewPlanPath: livePrep.initialReviewPlanPath,
    updatedReviewPlanPath: livePrep.updatedReviewPlanPath,
    timingPath: livePrep.timingPath,
    timings: livePrep.timings,
    responsePlanPath,
    generatedImagePaths: livePrep.generatedImagePaths,
    generatedImagesExist: livePrep.generatedImagePaths.map((imagePath) => existsSync(imagePath)),
    productId: responsePlan.items[0]?.productId,
    reviewStatus: responsePlan.status,
    reviewRoundCount: responsePlan.items[0]?.reviewRounds.length,
    latestReviewOptions: responsePlan.items[0]?.reviewRounds.at(-1)?.options.map((option) => ({
      label: option.label,
      intent: option.intent
    })),
    recordedSellerResponse: {
      interpretedIntent: sellerResponse.interpretedIntent,
      text: sellerResponse.text
    },
    createProductCommandCountBeforeApproval: pendingCreateProductCommands.length,
    generationTasks: responsePlan.generationTasks.map((task) => ({
      taskId: task.taskId,
      taskType: task.taskType,
      status: task.status,
      outputRefs: task.outputRefs
    }))
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
