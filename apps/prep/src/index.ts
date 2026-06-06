import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AiDraftUpdate,
  type EvidenceCitation,
  type ImageGenerationPlan,
  type LiveSessionSpec,
  type PrepGenerationTask,
  type ProductIdentityDraft,
  type ProductReviewPlan,
  type PolicyPack,
  type ProductRecord,
  type PromoRecord,
  type SellerGuidance,
  type SellerUiPolicy,
  AiDraftUpdateSchema,
  LiveSessionSpecSchema,
  PrepGenerationTaskSchema,
  PolicyPackSchema,
  ProductReviewPlanSchema,
  ProductRecordSchema,
  PromoRecordSchema,
  seedCitation,
  validLiveSessionSpec,
  validPolicyPack,
  validProducts,
  validPromo,
  vintageJewelryLiveSessionSpec,
  vintageJewelryProducts
} from "@liveseller/contracts";

export type {
  AiDraftUpdate,
  ImageGenerationPlan,
  PrepGenerationTask,
  ProductIdentityDraft,
  ProductReviewPlan,
  SellerGuidance,
  SellerUiPolicy
} from "@liveseller/contracts";

const currentDir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SEED_FOLDER = join(currentDir, "..", "seed");
export const DEFAULT_SELLER_DROP_FOLDER = join(currentDir, "..", "fixtures", "seller-drop", "vintage-jewelry");

export type MissingFieldReport = {
  sessionId: string;
  generatedAt: string;
  missingByProduct: Array<{
    productId: string;
    sku: string;
    missingFields: string[];
  }>;
  marketplaceReadiness: "ready_for_mock" | "needs_seller_review" | "blocked";
};

export type PrepAsset = {
  id: string;
  productId?: string;
  kind: "product_image" | "overlay_card" | "live_cover";
  uri: string;
  citations: EvidenceCitation[];
};

export type SellerDropFolderImage = {
  fileName: string;
  absolutePath: string;
  productId: string;
  productImageId: string;
  productImageUri: string;
};

export type SellerDropFolderGroup = {
  productId: string;
  label: string;
  imageFiles: SellerDropFolderImage[];
};

export type SellerDropFolderAssets = {
  folder: string;
  images: SellerDropFolderImage[];
  groups: SellerDropFolderGroup[];
};

export type SellerDropFolderExtractionOptions = {
  products?: ProductRecord[];
  liveSessionSpec?: LiveSessionSpec;
};

export type IngestedSellerFile = {
  fileName: string;
  absolutePath: string;
  relativePath: string;
  kind: "image" | "document" | "other";
  sizeBytes: number;
};

export type PrepExtractionResult = {
  products: ProductRecord[];
  promos: PromoRecord[];
  policyPack: PolicyPack;
  citations: EvidenceCitation[];
  assets: PrepAsset[];
  missingFieldReport: MissingFieldReport;
  liveSessionSpec: LiveSessionSpec;
  sellerGuidance: SellerGuidance[];
  imageGenerationPlan: ImageGenerationPlan[];
};

export type SellerMaterialIngestionResult = PrepExtractionResult & {
  ingestedFiles: IngestedSellerFile[];
  productIdentityDrafts: ProductIdentityDraft[];
  photoEnhancementPlan: ImageGenerationPlan[];
  sellerUiPolicy: SellerUiPolicy;
  productReviewPlan: ProductReviewPlan;
};

const requiredSeedFiles = ["product-notes.md", "policy-notes.md", "promo-notes.csv"];

export function assertSeedFolder(seedFolder = DEFAULT_SEED_FOLDER): void {
  if (!existsSync(seedFolder) || !statSync(seedFolder).isDirectory()) {
    throw new Error(`Seed folder not found: ${seedFolder}`);
  }

  const files = new Set(readdirSync(seedFolder));
  const missing = requiredSeedFiles.filter((file) => !files.has(file));
  if (missing.length > 0) {
    throw new Error(`Seed folder is missing required files: ${missing.join(", ")}`);
  }
}

export function readSeedDocuments(seedFolder = DEFAULT_SEED_FOLDER): Record<string, string> {
  assertSeedFolder(seedFolder);
  return Object.fromEntries(
    requiredSeedFiles.map((file) => [file, readFileSync(join(seedFolder, file), "utf8")])
  );
}

export function buildMissingFieldReport(
  products: ProductRecord[],
  sessionId = validLiveSessionSpec.sessionId
): MissingFieldReport {
  return {
    sessionId,
    generatedAt: "2026-06-06T02:00:00.000Z",
    missingByProduct: products.map((product) => {
      const missingFields: string[] = [];
      if (!product.shopeeProductId) {
        missingFields.push("shopeeProductId");
      }
      if (product.media.images.length === 0) {
        missingFields.push("primaryProductImage");
      }
      if (product.sourceConfidence < 0.85) {
        missingFields.push("sellerReviewForLowConfidenceExtraction");
      }

      return {
        productId: product.id,
        sku: product.sku,
        missingFields
      };
    }),
    marketplaceReadiness: "needs_seller_review"
  };
}

const supportedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const supportedDocumentExtensions = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".json",
  ".md",
  ".pdf",
  ".txt",
  ".xls",
  ".xlsx"
]);

function fileKind(fileName: string): IngestedSellerFile["kind"] {
  const extension = extname(fileName).toLowerCase();
  if (supportedImageExtensions.has(extension)) {
    return "image";
  }
  if (supportedDocumentExtensions.has(extension)) {
    return "document";
  }
  return "other";
}

export function discoverSellerMaterialFiles(inputPath: string): IngestedSellerFile[] {
  if (!existsSync(inputPath)) {
    throw new Error(`Seller material path not found: ${inputPath}`);
  }

  const rootStats = statSync(inputPath);
  const root = rootStats.isDirectory() ? inputPath : dirname(inputPath);
  const paths = rootStats.isDirectory()
    ? readdirSync(inputPath, { recursive: true }).map((entry) => join(inputPath, String(entry)))
    : [inputPath];

  return paths
    .filter((path) => statSync(path).isFile())
    .filter((path) => !path.split("/").some((part) => part.startsWith(".")))
    .map((path) => {
      const stats = statSync(path);
      return {
        fileName: path.split("/").at(-1) ?? path,
        absolutePath: path,
        relativePath: relative(root, path),
        kind: fileKind(path),
        sizeBytes: stats.size
      };
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

type DropFolderImageMatch = {
  product: ProductRecord;
  productIndex: number;
  image: ProductRecord["media"]["images"][number];
  imageIndex: number;
};

function dropFolderFileNameFromCitation(citation: EvidenceCitation): string | undefined {
  const match = citation.excerpt.match(/drop-folder file:\s*(.+)$/u);
  return match?.[1]?.trim();
}

function buildDropFolderImageIndex(products: ProductRecord[]): Map<string, DropFolderImageMatch> {
  const index = new Map<string, DropFolderImageMatch>();

  products.forEach((product, productIndex) => {
    product.media.images.forEach((image, imageIndex) => {
      image.citations.forEach((citation) => {
        const fileName = dropFolderFileNameFromCitation(citation);
        if (!fileName) {
          return;
        }
        if (index.has(fileName)) {
          throw new Error(`Duplicate seller drop-folder image citation: ${fileName}`);
        }
        index.set(fileName, {
          product,
          productIndex,
          image,
          imageIndex
        });
      });
    });
  });

  return index;
}

export function discoverSellerDropFolderAssets(
  folder = DEFAULT_SELLER_DROP_FOLDER,
  products = vintageJewelryProducts
): SellerDropFolderAssets {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new Error(`Seller drop folder not found: ${folder}`);
  }

  const imageIndex = buildDropFolderImageIndex(products);
  const files = readdirSync(folder)
    .filter((fileName) => supportedImageExtensions.has(extname(fileName).toLowerCase()));

  const images = files.map((fileName) => {
    const match = imageIndex.get(fileName);
    if (!match) {
      throw new Error(
        `Unsupported seller drop-folder image: ${fileName}. Add a product image citation ending with "drop-folder file: ${fileName}".`
      );
    }

    return {
      fileName,
      absolutePath: join(folder, fileName),
      productId: match.product.id,
      productImageId: match.image.id,
      productImageUri: match.image.uri,
      productIndex: match.productIndex,
      imageIndex: match.imageIndex
    };
  }).sort((left, right) => {
    if (left.productIndex !== right.productIndex) {
      return left.productIndex - right.productIndex;
    }
    return left.imageIndex - right.imageIndex;
  }).map(({ productIndex: _productIndex, imageIndex: _imageIndex, ...image }) => image);

  const groups = products
    .map((product) => ({
      productId: product.id,
      label: product.title,
      imageFiles: images.filter((image) => image.productId === product.id)
    }))
    .filter((group) => group.imageFiles.length > 0);

  return { folder, images, groups };
}

const sellerGuidanceOverrides: Record<string, Omit<SellerGuidance, "productId">> = {
  "prod-vintage-gold-grape-leaf-brooch": {
    talkTrack:
      "Start with the grape clusters and layered leaf texture; show how the gold-tone finish catches light on a blazer or scarf.",
    researchNotes: [
      "Botanical grape-and-leaf motifs are easy for viewers to remember and compare.",
      "Use visual language: gold-tone, sculpted leaves, raised grape beads.",
      "Do not claim gold purity without seller certificate."
    ],
    likelyBuyerQuestions: ["Is it real gold?", "How heavy is it?", "Can it hold on a scarf?"],
    riskNotes: ["Material and era claims need seller confirmation before public commitment."]
  },
  "prod-vintage-blue-stone-bar-brooch": {
    talkTrack:
      "Show the blue centerpiece first, then tilt under direct light so viewers see the rhinestone sparkle and bar shape.",
    researchNotes: [
      "The visual contrast between sky-blue stones, deep-blue center, and clear rhinestones is the main selling point.",
      "Position as a statement accent for lapels, scarves, or dress necklines.",
      "Describe stones visually unless certificates identify them."
    ],
    likelyBuyerQuestions: ["Are the blue stones turquoise?", "Any missing stones?", "Can you show the back pin?"],
    riskNotes: ["Stone identity and condition promises should be checked on camera."]
  },
  "prod-vintage-cameo-brooch": {
    talkTrack:
      "Lead with the cameo portrait relief; move close to camera so buyers can inspect the carving depth and gold-tone rim.",
    researchNotes: [
      "Cameo styling reads strongly on livestream because the portrait relief is recognizable.",
      "A side angle helps show raised carving and condition.",
      "Avoid shell, stone, brand, or era claims unless supplied in seller docs."
    ],
    likelyBuyerQuestions: ["Is the cameo shell?", "Can I see the back?", "Any chips or cracks?"],
    riskNotes: ["Authenticity and material questions require seller confirmation or a certificate."]
  }
};

export function buildSellerGuidance(products = vintageJewelryProducts): SellerGuidance[] {
  return products.map((product) => {
    const override = sellerGuidanceOverrides[product.id];
    if (override) {
      return {
        productId: product.id,
        ...override
      };
    }

    const variants = product.variants.map((variant) => variant.name).join(", ") || "single option";
    const primaryImageAlt = product.media.images[0]?.alt ?? product.title;

    return {
      productId: product.id,
      talkTrack: `Open with ${product.title}; show ${primaryImageAlt.toLowerCase()}, then call out ${product.currency} ${product.price.toFixed(2)}, stock ${product.stock}, and variants: ${variants}.`,
      researchNotes: [
        `Structured category: ${product.category}.`,
        product.description,
        "Use only structured price, stock, SKU, variant, shipping, and return-policy fields for factual claims."
      ],
      likelyBuyerQuestions: ["How much is it?", "How many are left?", "Which variants are available?"],
      riskNotes: ["Material, compatibility, authenticity, warranty, and condition claims need seller confirmation if not in structured records."]
    };
  });
}

export function buildImageGenerationPlan(products = vintageJewelryProducts): ImageGenerationPlan[] {
  return products.map((product) => ({
    productId: product.id,
    model: "gpt-image-2",
    sourceImageUris: product.media.images.map((image) => image.uri),
    prompts: [
      `Shopee-ready square cover for ${product.title} in ${product.category}: preserve the exact product shape, visible condition, color, and included parts; use a clean neutral background; no added features, brand marks, certificates, packaging, or text.`,
      `Create a livestream overlay hero image for ${product.title}: crop for a vertical product card, keep the original product unchanged, make the main details easy to inspect, and avoid inventing materials or variants.`,
      `Create one alternate catalog angle for ${product.title}: use the supplied product photo as source, clarify scale and surface detail, preserve any visible wear or condition marks, and do not create claims not backed by seller records.`
    ]
  }));
}

export function buildProductIdentityDrafts(
  products: ProductRecord[],
  missingFieldReport: MissingFieldReport
): ProductIdentityDraft[] {
  return products.map((product) => {
    const missingFields =
      missingFieldReport.missingByProduct.find((row) => row.productId === product.id)?.missingFields ?? [];

    return {
      productId: product.id,
      title: product.title,
      sku: product.sku,
      aliases: product.aliases,
      category: product.category,
      price: product.price,
      currency: product.currency,
      stock: product.stock,
      variantCount: product.variants.length,
      imageCount: product.media.images.length,
      sourceConfidence: product.sourceConfidence,
      identitySource: "structured_fixture",
      missingFields,
      evidence: product.evidence
    };
  });
}

export function buildSellerUiPolicy(
  sessionId: string,
  products: ProductRecord[],
  missingFieldReport: MissingFieldReport,
  photoEnhancementPlan: ImageGenerationPlan[]
): SellerUiPolicy {
  const productRows = products.map((product) => {
    const missingFields =
      missingFieldReport.missingByProduct.find((row) => row.productId === product.id)?.missingFields ?? [];

    return {
      productId: product.id,
      title: product.title,
      sku: product.sku,
      priceLabel: `${product.currency} ${product.price.toFixed(2)}`,
      stockLabel: `${product.stock} in structured stock`,
      imageCount: product.media.images.length,
      missingFields,
      reviewRequired: missingFields.length > 0 || product.sourceConfidence < 0.95
    };
  });

  return {
    sessionId,
    status: productRows.some((product) => product.reviewRequired)
      ? "seller_review_required"
      : "ready_for_live_review",
    products: productRows,
    photoEnhancement: photoEnhancementPlan.map((plan) => ({
      productId: plan.productId,
      model: plan.model,
      sourceImageCount: plan.sourceImageUris.length,
      promptCount: plan.prompts.length,
      requiresApproval: true
    })),
    publicAutomation: {
      autoSend: "low_risk_structured_only",
      approvalRequired: [
        "refund or return commitment",
        "legal, fraud, fake, or counterfeit accusation",
        "discounts not backed by structured Shopee promo records",
        "material, authenticity, warranty, or condition claims missing from structured records"
      ],
      blockedAutoSend: [
        "fake-product accusation",
        "fraud or legal threat",
        "refund commitment",
        "unauthorized discount",
        "unclear risky request"
      ]
    },
    renderHints: {
      sidePanelSectionId: "liveseller-prep-review",
      productAttribute: "data-liveseller-product-id",
      actionAttribute: "data-liveseller-action-id"
    }
  };
}

const aiUpdatableReviewFields = [
  "title",
  "aliases",
  "category",
  "description",
  "listingDraft",
  "sellerGuidance",
  "photoEnhancementPrompts"
] as const;

const lockedStructuredReviewFields = [
  "sku",
  "price",
  "stock",
  "variants",
  "shopeeProductId",
  "promoEligibility"
] as const;

function buildSellerReviewRound(product: ProductRecord, proposedAt: string) {
  return {
    roundId: `round-${product.id}-001`,
    productId: product.id,
    proposedAt,
    prompt:
      "Review the drafted Shopee listing. Choose an option or reply freely with edits, rejection reasons, or requests for more options.",
    options: [
      {
        optionId: `option-${product.id}-approve`,
        label: "Approve draft",
        description: "Use the structured product facts and current listing draft as-is.",
        intent: "approve_as_is" as const
      },
      {
        optionId: `option-${product.id}-edit`,
        label: "Request edits",
        description: "Reply with free-form wording, image, or policy edits before publishing.",
        intent: "request_edit" as const
      },
      {
        optionId: `option-${product.id}-more-options`,
        label: "More options",
        description: "Ask the agent to propose another set of listing or image directions.",
        intent: "request_more_options" as const
      }
    ],
    freeFormResponseMode: "enabled" as const
  };
}

function buildPrepGenerationTasks(product: ProductRecord, generatedAt: string): PrepGenerationTask[] {
  const completedTaskBase = {
    productId: product.id,
    status: "completed" as const,
    outputRefs: [`review://${product.id}`],
    dependsOnTaskIds: [],
    startedAt: generatedAt,
    completedAt: generatedAt,
    citations: product.evidence
  };

  return [
    PrepGenerationTaskSchema.parse({
      ...completedTaskBase,
      taskId: `task-${product.id}-identity-draft`,
      taskType: "identity_draft",
      inputRefs: product.evidence.map((citation) => citation.locator)
    }),
    PrepGenerationTaskSchema.parse({
      ...completedTaskBase,
      taskId: `task-${product.id}-seller-guidance`,
      taskType: "seller_guidance",
      inputRefs: [product.id]
    }),
    PrepGenerationTaskSchema.parse({
      ...completedTaskBase,
      taskId: `task-${product.id}-photo-prompt`,
      taskType: "photo_prompt",
      inputRefs: product.media.images.map((image) => image.uri)
    }),
    ...product.media.images.map((image) =>
      PrepGenerationTaskSchema.parse({
        taskId: `task-${product.id}-image-edit-${image.id}`,
        productId: product.id,
        taskType: "image_edit",
        status: "pending",
        inputRefs: [image.uri],
        outputRefs: [],
        dependsOnTaskIds: [`task-${product.id}-photo-prompt`],
        citations: image.citations
      })
    )
  ];
}

export function buildProductReviewPlan(
  session: LiveSessionSpec,
  productIdentityDrafts: ProductIdentityDraft[],
  sellerGuidance: SellerGuidance[],
  photoEnhancementPlan: ImageGenerationPlan[],
  sellerUiPolicy: SellerUiPolicy,
  generatedAt = "2026-06-06T02:00:00.000Z"
): ProductReviewPlan {
  const items = session.products.map((product) => {
    const identityDraft = productIdentityDrafts.find((draft) => draft.productId === product.id);
    const guidance = sellerGuidance.find((candidate) => candidate.productId === product.id);
    const photoPlan = photoEnhancementPlan.find((candidate) => candidate.productId === product.id);

    if (!identityDraft || !guidance || !photoPlan) {
      throw new Error(`Cannot build product review plan without complete draft context for ${product.id}`);
    }

    return {
      productId: product.id,
      product,
      identityDraft,
      sellerGuidance: guidance,
      photoEnhancementPlan: photoPlan,
      aiUpdatableFields: [...aiUpdatableReviewFields],
      lockedStructuredFields: [...lockedStructuredReviewFields],
      draftUpdates: [],
      reviewRounds: [buildSellerReviewRound(product, generatedAt)],
      decision: {
        decisionId: `decision-${product.id}-pending`,
        productId: product.id,
        status: "pending" as const,
        reason: "Seller has not reviewed this product listing draft.",
        citations: product.evidence
      }
    };
  });

  return ProductReviewPlanSchema.parse({
    reviewPlanId: `review-${session.sessionId}`,
    sessionId: session.sessionId,
    generatedAt,
    updatedAt: generatedAt,
    status: "seller_review_required",
    items,
    generationTasks: session.products.flatMap((product) => buildPrepGenerationTasks(product, generatedAt)),
    sellerUiPolicy,
    citations: session.products.flatMap((product) => product.evidence)
  });
}

export type PrepGenerationTaskRunnerResult = {
  outputRefs: string[];
  citations?: EvidenceCitation[];
  error?: string;
};

export type PrepGenerationTaskRunner = (
  task: PrepGenerationTask
) => Promise<PrepGenerationTaskRunnerResult>;

export async function runPendingPrepGenerationTasks(
  reviewPlan: ProductReviewPlan,
  runner: PrepGenerationTaskRunner,
  completedAt = new Date().toISOString()
): Promise<ProductReviewPlan> {
  const pendingTasks = reviewPlan.generationTasks.filter((task) => task.status === "pending");
  const results = await Promise.all(
    pendingTasks.map(async (task) => {
      try {
        const result = await runner({
          ...task,
          status: "running",
          startedAt: completedAt
        });

        return PrepGenerationTaskSchema.parse({
          ...task,
          status: result.error ? "failed" : "completed",
          startedAt: completedAt,
          completedAt,
          outputRefs: result.outputRefs,
          error: result.error,
          citations: result.citations ?? task.citations
        });
      } catch (error) {
        return PrepGenerationTaskSchema.parse({
          ...task,
          status: "failed",
          startedAt: completedAt,
          completedAt,
          outputRefs: [],
          error: error instanceof Error ? error.message : "Unknown prep generation task failure"
        });
      }
    })
  );
  const byTaskId = new Map(results.map((task) => [task.taskId, task]));

  return ProductReviewPlanSchema.parse({
    ...reviewPlan,
    updatedAt: completedAt,
    generationTasks: reviewPlan.generationTasks.map((task) => byTaskId.get(task.taskId) ?? task)
  });
}

export function applyAiDraftUpdate(
  reviewPlan: ProductReviewPlan,
  update: AiDraftUpdate
): ProductReviewPlan {
  const parsedUpdate = AiDraftUpdateSchema.parse(update);
  const targetIndex = reviewPlan.items.findIndex((item) => item.productId === parsedUpdate.productId);
  if (targetIndex === -1) {
    throw new Error(`Cannot apply AI draft update for unknown product: ${parsedUpdate.productId}`);
  }

  const items = reviewPlan.items.map((item, index) => {
    if (index !== targetIndex) {
      return item;
    }

    const patch = parsedUpdate.patch;
    const listingDraft = patch.listingDraft ?? item.product.listingDraft;
    const product = ProductRecordSchema.parse({
      ...item.product,
      title: patch.title ?? item.product.title,
      aliases: patch.aliases ?? item.product.aliases,
      category: patch.category ?? item.product.category,
      description: patch.description ?? item.product.description,
      listingDraft
    });

    return {
      ...item,
      product,
      identityDraft: {
        ...item.identityDraft,
        title: patch.title ?? item.identityDraft.title,
        aliases: patch.aliases ?? item.identityDraft.aliases,
        category: patch.category ?? item.identityDraft.category
      },
      sellerGuidance: {
        ...item.sellerGuidance,
        ...patch.sellerGuidance,
        productId: item.productId
      },
      photoEnhancementPlan: {
        ...item.photoEnhancementPlan,
        prompts: patch.photoEnhancementPrompts ?? item.photoEnhancementPlan.prompts
      },
      draftUpdates: [...item.draftUpdates, parsedUpdate]
    };
  });

  return ProductReviewPlanSchema.parse({
    ...reviewPlan,
    updatedAt: parsedUpdate.updatedAt,
    items
  });
}

export function buildSellerDropFolderExtraction(
  folder = DEFAULT_SELLER_DROP_FOLDER,
  options: SellerDropFolderExtractionOptions = {}
): PrepExtractionResult {
  const sourceProducts = options.products ?? vintageJewelryProducts;
  const dropAssets = discoverSellerDropFolderAssets(folder, sourceProducts);
  const discoveredProductIds = new Set(dropAssets.groups.map((group) => group.productId));
  const products = sourceProducts
    .filter((product) => discoveredProductIds.has(product.id))
    .map((product) => ProductRecordSchema.parse(product));
  const session = LiveSessionSpecSchema.parse({
    ...(options.liveSessionSpec ?? vintageJewelryLiveSessionSpec),
    products
  });

  return {
    products,
    promos: session.promos.map((promo) => PromoRecordSchema.parse(promo)),
    policyPack: PolicyPackSchema.parse(session.policyPack),
    citations: dropAssets.images.flatMap((image) => {
      const product = products.find((candidate) => candidate.id === image.productId);
      return product?.media.images.find((candidate) => candidate.id === image.productImageId)?.citations ?? [];
    }),
    assets: buildPrepAssets(products),
    missingFieldReport: buildMissingFieldReport(products, session.sessionId),
    liveSessionSpec: session,
    sellerGuidance: buildSellerGuidance(products),
    imageGenerationPlan: buildImageGenerationPlan(products)
  };
}

export function buildSellerMaterialIngestion(
  inputPath = DEFAULT_SELLER_DROP_FOLDER,
  options: SellerDropFolderExtractionOptions = {}
): SellerMaterialIngestionResult {
  const ingestedFiles = discoverSellerMaterialFiles(inputPath);
  const inputStats = statSync(inputPath);
  const extractionFolder = inputStats.isDirectory() ? inputPath : dirname(inputPath);
  const extraction = buildSellerDropFolderExtraction(extractionFolder, options);
  const productIdentityDrafts = buildProductIdentityDrafts(
    extraction.products,
    extraction.missingFieldReport
  );
  const photoEnhancementPlan = extraction.imageGenerationPlan;
  const sellerUiPolicy = buildSellerUiPolicy(
    extraction.liveSessionSpec.sessionId,
    extraction.products,
    extraction.missingFieldReport,
    photoEnhancementPlan
  );
  const productReviewPlan = buildProductReviewPlan(
    extraction.liveSessionSpec,
    productIdentityDrafts,
    extraction.sellerGuidance,
    photoEnhancementPlan,
    sellerUiPolicy,
    extraction.missingFieldReport.generatedAt
  );

  return {
    ...extraction,
    ingestedFiles,
    productIdentityDrafts,
    photoEnhancementPlan,
    sellerUiPolicy,
    productReviewPlan
  };
}

export function buildPrepAssets(products: ProductRecord[]): PrepAsset[] {
  const productCards = products.map((product) => ({
    id: `asset-card-${product.id}`,
    productId: product.id,
    kind: "overlay_card" as const,
    uri: `/assets/overlay/${product.id}.json`,
    citations: product.evidence
  }));

  const productImages = products.flatMap((product) =>
    product.media.images.map((image) => ({
      id: image.id,
      productId: product.id,
      kind: "product_image" as const,
      uri: image.uri,
      citations: image.citations
    }))
  );

  return [
    ...productImages,
    ...productCards,
    {
      id: "asset-live-cover",
      kind: "live_cover",
      uri: "/assets/live/live-cover.jpg",
      citations: [seedCitation]
    }
  ];
}

export function buildSeedExtraction(seedFolder = DEFAULT_SEED_FOLDER): PrepExtractionResult {
  readSeedDocuments(seedFolder);

  const products = validProducts.map((product) => ProductRecordSchema.parse(product));
  const promo = PromoRecordSchema.parse(validPromo);
  const policyPack = PolicyPackSchema.parse(validPolicyPack);
  const liveSessionSpec = LiveSessionSpecSchema.parse({
    ...validLiveSessionSpec,
    products,
    promos: [promo],
    policyPack
  });

  return {
    products,
    promos: [promo],
    policyPack,
    citations: [seedCitation],
    assets: buildPrepAssets(products),
    missingFieldReport: buildMissingFieldReport(products),
    liveSessionSpec,
    sellerGuidance: [],
    imageGenerationPlan: []
  };
}
