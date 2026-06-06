import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type LiveSessionSpec,
  type ProductRecord,
  ProductReviewPlanSchema,
  vintageJewelryLiveSessionSpec,
  vintageJewelryProducts
} from "@liveseller/contracts";
import {
  DEFAULT_SELLER_DROP_FOLDER,
  buildSellerMaterialIngestion,
  runPendingPrepGenerationTasks
} from "./index";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type OneImageLivePrepOptions = {
  apiKey: string;
  sourceImagePath: string;
  outputDir: string;
  products?: ProductRecord[];
  liveSessionSpec?: LiveSessionSpec;
  fetchImpl?: FetchLike;
};

export type OneImageLivePrepResult = {
  inputFolder: string;
  initialReviewPlanPath: string;
  updatedReviewPlanPath: string;
  generatedImagePaths: string[];
  initialReviewPlan: ReturnType<typeof ProductReviewPlanSchema.parse>;
  updatedReviewPlan: ReturnType<typeof ProductReviewPlanSchema.parse>;
};

function assertNonSecret(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function findEnvFile(startPath = process.cwd()): string | undefined {
  const resolvedStartPath = resolve(startPath);
  if (existsSync(resolvedStartPath) && statSync(resolvedStartPath).isFile()) {
    return resolvedStartPath;
  }

  let currentDir = resolvedStartPath;
  while (true) {
    const candidate = join(currentDir, ".env");
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

export function loadEnvFile(startPath = process.cwd()): string[] {
  const envPath = findEnvFile(startPath);
  if (!envPath) {
    return [];
  }

  const loadedKeys: string[] = [];
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (!key || process.env[key]) {
      continue;
    }

    const value = rawValue?.replace(/^['"]|['"]$/gu, "") ?? "";
    process.env[key] = value;
    loadedKeys.push(key);
  }

  return loadedKeys;
}

function dropFolderFileNameFromProductImage(image: ProductRecord["media"]["images"][number]): string | undefined {
  for (const citation of image.citations) {
    const match = citation.excerpt.match(/drop-folder file:\s*(.+)$/u);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function oneImageProduct(sourceImagePath: string, products: ProductRecord[]): ProductRecord {
  const fileName = basename(sourceImagePath);

  for (const product of products) {
    const image = product.media.images.find((candidate) => {
      const dropFileName = dropFolderFileNameFromProductImage(candidate);
      return dropFileName === fileName || basename(candidate.uri) === fileName;
    });

    if (image) {
      return {
        ...product,
        media: {
          ...product.media,
          images: [image]
        }
      };
    }
  }

  if (products.length === 1 && products[0]?.media.images[0]) {
    return {
      ...products[0],
      media: {
        ...products[0].media,
        images: [products[0].media.images[0]]
      }
    };
  }

  throw new Error(`No ProductRecord image citation matches one-image input: ${fileName}`);
}

function mimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

async function requestImageEdit(options: {
  apiKey: string;
  imagePath: string;
  prompt: string;
  fetchImpl: FetchLike;
}): Promise<Buffer> {
  const form = new FormData();
  const bytes = readFileSync(options.imagePath);
  form.append("model", "gpt-image-2");
  form.append("image", new Blob([new Uint8Array(bytes)], { type: mimeType(options.imagePath) }), basename(options.imagePath));
  form.append("prompt", options.prompt);
  form.append("quality", "low");
  form.append("size", "1024x1024");
  form.append("output_format", "png");

  const response = await options.fetchImpl("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(`OpenAI image edit failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json() as { data?: Array<{ b64_json?: string }> };
  const base64Image = body.data?.[0]?.b64_json;
  if (!base64Image) {
    throw new Error("OpenAI image edit response did not include data[0].b64_json");
  }

  return Buffer.from(base64Image, "base64");
}

function firstSellerDropImage(): string {
  const fileName = readdirSync(DEFAULT_SELLER_DROP_FOLDER)
    .filter((candidate) => [".jpg", ".jpeg", ".png", ".webp"].includes(extname(candidate).toLowerCase()))
    .sort((left, right) => left.localeCompare(right))[0];

  if (!fileName) {
    throw new Error(`No image files found in ${DEFAULT_SELLER_DROP_FOLDER}`);
  }

  return join(DEFAULT_SELLER_DROP_FOLDER, fileName);
}

function parseArg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

export async function runOneImageLivePrep(options: OneImageLivePrepOptions): Promise<OneImageLivePrepResult> {
  const apiKey = assertNonSecret(options.apiKey, "apiKey");
  const sourceImagePath = resolve(options.sourceImagePath);
  if (!existsSync(sourceImagePath)) {
    throw new Error(`One-image live prep source not found: ${sourceImagePath}`);
  }

  const outputDir = resolve(options.outputDir);
  const inputFolder = join(outputDir, "input");
  const generatedFolder = join(outputDir, "generated");
  mkdirSync(inputFolder, { recursive: true });
  mkdirSync(generatedFolder, { recursive: true });

  const inputImagePath = join(inputFolder, basename(sourceImagePath));
  copyFileSync(sourceImagePath, inputImagePath);

  const product = oneImageProduct(sourceImagePath, options.products ?? vintageJewelryProducts);
  const session = {
    ...(options.liveSessionSpec ?? vintageJewelryLiveSessionSpec),
    sessionId: options.liveSessionSpec?.sessionId ?? "live-one-image-openai-001",
    products: [product]
  };
  const material = buildSellerMaterialIngestion(inputFolder, {
    products: [product],
    liveSessionSpec: session
  });
  const initialReviewPlan = ProductReviewPlanSchema.parse(material.productReviewPlan);
  const initialReviewPlanPath = join(outputDir, "review-plan.initial.json");
  writeFileSync(initialReviewPlanPath, JSON.stringify(initialReviewPlan, null, 2));

  const generatedImagePaths: string[] = [];
  const imagePathByRef = new Map(product.media.images.map((image) => [image.uri, inputImagePath]));
  const updatedReviewPlan = await runPendingPrepGenerationTasks(
    initialReviewPlan,
    async (task) => {
      if (task.taskType !== "image_edit") {
        return { outputRefs: task.outputRefs, citations: task.citations };
      }

      const imagePath = imagePathByRef.get(task.inputRefs[0] ?? "") ?? inputImagePath;
      const prompt = material.photoEnhancementPlan.find((plan) => plan.productId === task.productId)?.prompts[0]
        ?? `Create a Shopee-ready product image variant for ${product.title}. Preserve the exact product and visible condition.`;
      const imageBytes = await requestImageEdit({
        apiKey,
        imagePath,
        prompt,
        fetchImpl: options.fetchImpl ?? fetch
      });
      const generatedFileName = `${task.taskId.replaceAll(/[^\w.-]+/gu, "-")}.png`;
      const generatedPath = join(generatedFolder, generatedFileName);
      writeFileSync(generatedPath, imageBytes);
      generatedImagePaths.push(generatedPath);

      return {
        outputRefs: [`generated/${generatedFileName}`],
        citations: task.citations
      };
    }
  );
  const updatedReviewPlanPath = join(outputDir, "review-plan.updated.json");
  writeFileSync(updatedReviewPlanPath, JSON.stringify(updatedReviewPlan, null, 2));

  return {
    inputFolder,
    initialReviewPlanPath,
    updatedReviewPlanPath,
    generatedImagePaths,
    initialReviewPlan,
    updatedReviewPlan
  };
}

async function main(): Promise<void> {
  loadEnvFile();
  const sourceImagePath = parseArg("image") ?? firstSellerDropImage();
  const outputDir = parseArg("out") ?? join(
    process.cwd(),
    "artifacts",
    "prep-live",
    new Date().toISOString().replaceAll(/[:.]/gu, "-")
  );
  const result = await runOneImageLivePrep({
    apiKey: assertNonSecret(process.env.OPENAI_API_KEY, "OPENAI_API_KEY"),
    sourceImagePath,
    outputDir
  });

  console.log(JSON.stringify({
    inputFolder: result.inputFolder,
    initialReviewPlanPath: result.initialReviewPlanPath,
    updatedReviewPlanPath: result.updatedReviewPlanPath,
    generatedImagePaths: result.generatedImagePaths,
    taskSummary: result.updatedReviewPlan.generationTasks.map((task) => ({
      taskId: task.taskId,
      taskType: task.taskType,
      status: task.status,
      outputRefs: task.outputRefs
    })),
    reviewOptions: result.updatedReviewPlan.items[0]?.reviewRounds.at(-1)?.options.map((option) => ({
      label: option.label,
      intent: option.intent
    }))
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
